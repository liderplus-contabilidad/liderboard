/**
 * Structure-family transformations: what share of the whole an account represents. The two
 * percentage functions keep the series shape (`key` and `container` preserved, nulls
 * propagated); the two composition functions turn a set of accounts of one period into the
 * data a Pareto curve or a pie needs — including the rules that would otherwise break them.
 */
import { aggregate } from "../derive";
import { periodsAlign } from "./period";
import { aggregateCoverage, canReexpress } from "./source";
import { blankPoints, type AnalyticsSource, type Series } from "./types";

/** The income root; it is what a vertical analysis divides by unless another base is named. */
export const REVENUE_ROOT = "4";

/**
 * Divides each point by the account `baseCode` of ITS OWN source. The series does NOT have to
 * hang from the base — dividing a expense by revenue is the ordinary vertical analysis, not an
 * exception — and used over several sources it normalizes centers whose sizes are ~100× apart,
 * because each one is measured against its own base instead of against the consolidated total.
 *
 * This is the module's ONE definition of "percentage over an account": the fixed-denominator
 * transformations are expressed on top of it rather than repeating the arithmetic.
 */
export function toPctOfAccount(
  series: Series,
  sources: AnalyticsSource[],
  baseCode: string,
): Series {
  const frequency = series.points[0]?.period.frequency;
  const source = sources.find(
    (candidate) => candidate.centerId === series.key.centerId && candidate.year === series.key.year,
  );
  if (!source || !frequency || !canReexpress(source.baseFrequency, frequency)) {
    return { ...series, points: blankPoints(series.points) };
  }

  const base = aggregate(source.valuesByCode.get(baseCode) ?? [], source.baseFrequency, frequency);
  const coverage = aggregateCoverage(source.coverage, source.baseFrequency, frequency);

  return {
    ...series,
    points: series.points.map((point) => {
      const total = coverage.has(point.period.index) ? (base[point.period.index] ?? null) : null;
      const divisible = point.value !== null && total !== null && total !== 0;
      return { ...point, value: divisible ? ((point.value as number) / total) * 100 : null };
    }),
  };
}

/**
 * Vertical analysis against Ingresos — the case `baseCode = "4"`, and the one the "% sobre
 * ingresos" card and the cross-center normalization both read.
 */
export function toPctOfRevenue(series: Series, sources: AnalyticsSource[]): Series {
  return toPctOfAccount(series, sources, REVENUE_ROOT);
}

/**
 * Divides each point by its container — the parent `buildSeries` already rolled up. This is
 * the basis of the 100% stacked bars, and the reason no view has to re-add the siblings.
 */
export function toPctOfContainer(series: Series): Series {
  const container = series.container;
  if (!container) {
    return { ...series, points: blankPoints(series.points) };
  }

  return {
    ...series,
    points: series.points.map((point) => {
      const match = container.points.find(
        (candidate) =>
          candidate.period.year === point.period.year &&
          periodsAlign(candidate.period, point.period),
      );
      const total = match?.value ?? null;
      const divisible = point.value !== null && total !== null && total !== 0;
      return { ...point, value: divisible ? ((point.value as number) / total) * 100 : null };
    }),
  };
}

/** One account's amount in one period — what the composition functions consume. */
export interface AmountEntry {
  code: string;
  label: string;
  value: number;
}

export interface ParetoEntry extends AmountEntry {
  pct: number;
  cumulativePct: number;
}

export interface ParetoResult {
  entries: ParetoEntry[];
  excluded: AmountEntry[];
  /**
   * Positive accounts the cap left undrawn. They are NOT missing from the reading: the last
   * drawn bar's `cumulativePct` already counts them out of the total, so the chart still says
   * what share the drawn ones concentrate.
   */
  truncated: number;
  total: number;
}

export interface ParetoOptions {
  /** Bars to draw. Default 10 — the rest are counted, not drawn. */
  maxEntries?: number;
}

/**
 * The tail a real statement carries. A close moves fifty expense accounts and the smallest forty
 * are worth cents each; drawn, they are forty rows sharing the height of one card, with their
 * labels on top of each other and their amounts on top of the bars. Ten is the same density the
 * ranking card uses, and the question a Pareto answers — «cuáles concentran el gasto» — is
 * answered by the head of the list by construction.
 */
const MAX_PARETO_ENTRIES = 10;

/**
 * Sorts from largest to smallest and accumulates the share of the total, so "which accounts
 * make up 80% of the spend" is a read and not a calculation. Entries at or below zero are set
 * aside: a running total over mixed signs has no reading.
 *
 * The accumulation runs over EVERY included entry and the cap is applied after, so a drawn bar's
 * cumulative share is its share of the whole spend and not of the ten that fit.
 */
export function toPareto(entries: AmountEntry[], options: ParetoOptions = {}): ParetoResult {
  const included = entries.filter((entry) => entry.value > 0);
  const excluded = entries.filter((entry) => entry.value <= 0);
  const total = included.reduce((sum, entry) => sum + entry.value, 0);

  let running = 0;
  const ranked = [...included]
    .sort((a, b) => b.value - a.value)
    .map((entry) => {
      running += entry.value;
      return {
        ...entry,
        pct: (entry.value / total) * 100,
        cumulativePct: (running / total) * 100,
      };
    });

  const cap = options.maxEntries ?? MAX_PARETO_ENTRIES;
  // `total` is only zero when nothing was included, so the divisions above never happen then.
  const drawn = total === 0 ? [] : ranked.slice(0, cap);
  return { entries: drawn, excluded, truncated: ranked.length - drawn.length, total };
}

export interface PieSlice extends AmountEntry {
  pct: number;
}

export interface ExcludedSlice extends AmountEntry {
  reason: "negativo" | "cero";
}

export interface PieResult {
  slices: PieSlice[];
  excluded: ExcludedSlice[];
  total: number;
}

export interface PieOptions {
  /** Slices to draw, "Otros" included. Default 6. */
  maxSlices?: number;
}

const OTHERS_CODE = "otros";

/**
 * The two rules a pie breaks without: group the tail into «Otros», and drop the entries that
 * are not positive — `4.1.4 Rebajas y/o Descuentos` is negative and would draw a negative
 * angle. The excluded ones come back with their reason so the view can footnote them instead
 * of making them disappear.
 */
export function toPieSlices(entries: AmountEntry[], options: PieOptions = {}): PieResult {
  const maxSlices = options.maxSlices ?? 6;

  const excluded: ExcludedSlice[] = entries
    .filter((entry) => entry.value <= 0)
    .map((entry) => ({ ...entry, reason: entry.value < 0 ? "negativo" : "cero" }));
  const included = [...entries.filter((entry) => entry.value > 0)].sort(
    (a, b) => b.value - a.value,
  );
  const total = included.reduce((sum, entry) => sum + entry.value, 0);
  if (total === 0) {
    return { slices: [], excluded, total: 0 };
  }

  const kept =
    included.length > maxSlices
      ? [
          ...included.slice(0, maxSlices - 1),
          {
            code: OTHERS_CODE,
            label: "Otros",
            value: included.slice(maxSlices - 1).reduce((sum, entry) => sum + entry.value, 0),
          },
        ]
      : included;

  return {
    slices: kept.map((entry) => ({ ...entry, pct: (entry.value / total) * 100 })),
    excluded,
    total,
  };
}
