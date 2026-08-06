/**
 * The default views of both tabs, as data rather than as markup.
 *
 * A preset is an ORDINARY query: it goes through `toSeriesQuery` like everything `Comparar`
 * builds, so it inherits the same cap, the same warnings and the same coverage rules. There is
 * no second path into the engine — which is the point, because a second path is where the two
 * would start to disagree.
 */
import { CHART_MAX_SERIES } from "@/lib/charts/palette";
import type { AmountEntry } from "../analytics/structure";
import type { AnalyticsSource, PeriodRef, SeriesBundle, SeriesQuery } from "../analytics/types";
import { NON_OPERATIONAL_ROOT } from "../segment";
import type { SelectionContext } from "./selection";

/** The two roots every statement has; the stat tiles and the evolution card read them. */
export const REVENUE_ROOT = "4";
export const EXPENSE_ROOT = "5";

/**
 * Every expense root the SOURCE actually carries — the operating one, plus the non-operating
 * block once «Segmentar gastos» split it out of 5.2. Read off the source and not declared,
 * so an unsegmented statement asks exactly what it always asked, and a segmented one doesn't
 * lose from view the amount root 5 gave up: the gasto totals and the ranking stay whole, and
 * the Utilidad tile keeps agreeing with the Datos badge.
 */
export function expenseRootsOf(source: AnalyticsSource | undefined): string[] {
  return [EXPENSE_ROOT, NON_OPERATIONAL_ROOT].filter((code) => source?.valuesByCode.has(code));
}

/** Leaves under ANY of the given ancestors, in source order. */
export function leavesOfAny(source: AnalyticsSource | undefined, ancestors: string[]): string[] {
  return ancestors.flatMap((ancestor) => leavesOf(source, ancestor));
}

/** How many bars a ranking card shows before it says how many it left out. */
export const RANKING_SIZE = 8;

/**
 * No cap at all — for the cards that have to see the WHOLE set before they can reduce it.
 *
 * A pie folds its own tail into «Otros» and a ranking has to sort before it cuts; capping the
 * query first would hand them the first N accounts *in file order*, not the largest ones. The
 * real statement carries 131 expense leaves and its biggest spender is nowhere near the top of
 * the file, so an eight-series cap here produced a "ranking" of accounts worth $0. Nothing is
 * hidden silently: each card reports how many entries it left out of its own reduction.
 */
const UNCAPPED = Number.MAX_SAFE_INTEGER;

export interface PresetQueryOptions {
  limit?: number;
  /** Marked periods that narrow the eje; omit (or empty) for the whole axis of the frequency —
   * the same "acota, no multiplica" rule the filter bar's periods apply everywhere else. */
  periods?: readonly PeriodRef[];
}

/**
 * A preset query over an explicit, already-decided list of codes — no defaulting, so a card
 * that intersected its universe down to nothing (see `intersectWithMarked`) gets back a query
 * that draws nothing, not the engine's generic Ingresos fallback.
 */
export function presetQuery(
  codes: string[],
  context: SelectionContext,
  options: PresetQueryOptions = {},
): SeriesQuery {
  return {
    codes,
    centerIds: [context.activeCenterId],
    years: [context.year],
    frequency: context.frequency,
    ...(options.periods && options.periods.length > 0 ? { periods: [...options.periods] } : {}),
    limit: options.limit ?? CHART_MAX_SERIES,
  };
}

/** Query for a composition or ranking card: every leaf, so the card can do its own reduction. */
export function compositionQuery(
  codes: string[],
  context: SelectionContext,
  options: Pick<PresetQueryOptions, "periods"> = {},
): SeriesQuery {
  return presetQuery(codes, context, { ...options, limit: UNCAPPED });
}

/**
 * A card's fixed universe narrowed to the accounts marked in "Cuenta contable": a marked
 * ancestor keeps every leaf under it, a marked leaf keeps only itself. No marks is a no-op — the
 * card keeps its whole universe, exactly as it drew before the filter reached it.
 */
export function intersectWithMarked(universe: string[], markedCodes: readonly string[]): string[] {
  if (markedCodes.length === 0) {
    return universe;
  }
  return universe.filter((code) =>
    markedCodes.some((marked) => code === marked || code.startsWith(`${marked}.`)),
  );
}

/** Direct children of an account, in file order; `[]` when it has none. */
export function childrenOf(source: AnalyticsSource | undefined, parent: string): string[] {
  if (!source) {
    return [];
  }
  return [...source.parentByCode.entries()]
    .filter(([, candidate]) => candidate === parent)
    .map(([code]) => code);
}

/**
 * Movement accounts under an ancestor — the ones a composition or a ranking is actually made
 * of. Going by direct children instead would often yield a single row ("5" has only "5.1"),
 * which is a chart of one bar and therefore not a chart.
 */
export function leavesOf(source: AnalyticsSource | undefined, ancestor: string): string[] {
  if (!source) {
    return [];
  }
  const parents = new Set(source.parentByCode.values());
  return [...source.valuesByCode.keys()].filter(
    (code) => code.startsWith(`${ancestor}.`) && !parents.has(code),
  );
}

/**
 * The last period ANY series covered. It is no longer "the period" a tile speaks about — that is
 * the whole covered span now — but the variation card still needs it: comparing against the
 * previous period is a question about two columns, and this names the later one. `-1` when
 * nothing is covered.
 */
export function lastCoveredIndex(bundle: SeriesBundle): number {
  let last = -1;
  for (const series of bundle.series) {
    series.points.forEach((point, index) => {
      if (point.value !== null && index > last) {
        last = index;
      }
    });
  }
  return last;
}

/**
 * The periods the bundle actually covers, in axis order — "the period" a tile, a composition or
 * a ranking speaks about, and what names it on screen.
 *
 * The axis is already whatever the filter bar left (`presetQuery` passes the marked periods to
 * the engine), so this only drops the ones the file never reached: a query over Ene–Dic on a
 * statement that stops in July covers Ene–Jul.
 */
export function coveredPeriods(bundle: SeriesBundle): PeriodRef[] {
  return bundle.periods.filter((_, index) =>
    bundle.series.some((series) => series.points[index]?.value !== null),
  );
}

/**
 * Each series summed over the periods the bundle carries, dropping the ones with no coverage in
 * ANY of them. A covered period valued at 0 contributes its zero; a never-loaded one contributes
 * nothing — which is the difference between a total of zero and no total at all.
 */
export function amountsOver(bundle: SeriesBundle): AmountEntry[] {
  return bundle.series
    .map((series) => ({
      code: series.key.code,
      label: series.label,
      value: sumPoints(series),
    }))
    .filter((entry): entry is AmountEntry => entry.value !== null);
}

/** One account summed over the bundle's periods, or `null` when it covers none of them. */
export function sumOver(bundle: SeriesBundle, code: string): number | null {
  const series = bundle.series.find((candidate) => candidate.key.code === code);
  return series ? sumPoints(series) : null;
}

function sumPoints(series: SeriesBundle["series"][number]): number | null {
  let total: number | null = null;
  for (const point of series.points) {
    if (point.value !== null) {
      total = (total ?? 0) + point.value;
    }
  }
  return total;
}

export interface Ranking {
  entries: AmountEntry[];
  /** How many were left out — said out loud rather than silently dropped. */
  hidden: number;
}

/**
 * The largest `size` entries by amount. Sorting BEFORE cutting is what makes it a ranking.
 *
 * Zeros are dropped: a real statement declares every account of the chart whether it moved or
 * not, so "the biggest expenses" would otherwise be a list of accounts worth nothing. They are
 * not counted as hidden either — a zero row is not a finding the user is missing out on.
 */
export function topEntries(entries: AmountEntry[], size = RANKING_SIZE): Ranking {
  return rank(entries, size, (a, b) => b.value - a.value);
}

/**
 * The largest movements by ABSOLUTE size. A variation card ranked by signed value fills up
 * with the rises and pushes every fall off the list — and a fall of $1.176 is the finding.
 */
export function topByMagnitude(entries: AmountEntry[], size = RANKING_SIZE): Ranking {
  return rank(entries, size, (a, b) => Math.abs(b.value) - Math.abs(a.value));
}

function rank(
  entries: AmountEntry[],
  size: number,
  order: (a: AmountEntry, b: AmountEntry) => number,
): Ranking {
  const ranked = [...entries].filter((entry) => entry.value !== 0).sort(order);
  return { entries: ranked.slice(0, size), hidden: Math.max(0, ranked.length - size) };
}

/**
 * What a composition left out, in the proportion each part deserves: the negatives one by one,
 * because every one is a finding (`4.1.4 Rebajas y/o Descuentos` is an income account with a
 * negative balance), and the zeros as a count, because a statement declares every account of
 * its chart and naming ten idle ones buries the one that matters.
 */
export function excludedNote(
  excluded: readonly AmountEntry[],
  lead = "Fuera del pastel",
): string | undefined {
  const negatives = excluded.filter((entry) => entry.value < 0);
  const zeros = excluded.length - negatives.length;
  const parts: string[] = [];

  if (negatives.length > 0) {
    parts.push(`negativas: ${negatives.map((entry) => entry.label).join(", ")}`);
  }
  if (zeros > 0) {
    parts.push(`${zeros} ${zeros === 1 ? "cuenta sin movimiento" : "cuentas sin movimiento"}`);
  }
  return parts.length > 0 ? `${lead} — ${parts.join("; ")}.` : undefined;
}
