/**
 * The model behind the account ficha: one `Series` in, the numbers that answer "how did this
 * account behave?" out. Pure, like `waterfall.ts`, so every rule below is a Vitest case rather
 * than something to eyeball in a panel.
 *
 * The rule the whole file rests on is the engine's, not a new one: a `null` point is a period
 * the SOURCE never reported and a `0` is a real accounting zero. So `2 de 7` reads "the account
 * moved in two of the seven months the file covers" — not two of twelve, and not two of the
 * months this one account happened to touch. Nothing here turns a `null` into a `0`.
 *
 * Every metric that cannot be computed comes back as `null` — never as `0`, and never as a
 * pre-formatted "—". A zero and a "does not apply" are different answers, and the panel is what
 * decides how the second one looks.
 */
import type { Frequency } from "../types";
import { periodLabel } from "../analytics/period";
import type { AnalyticsSource, Series, SeriesPoint } from "../analytics/types";
import { shareOf } from "./expense-distribution";

/** A period named the way the axis names it, with the value that made it stand out. */
export interface DetailPeriod {
  label: string;
  value: number;
}

export interface AccountDetail {
  code: string;
  name: string;
  /** Ancestor names, root first, direct parent last; empty for a root account. */
  path: string[];
  /** Depth in the account tree, 1-based. */
  level: number;
  /** A leaf account — the only kind whose values the Datos table lets you edit. */
  imputable: boolean;
  /** Sum of the covered periods. */
  total: number;
  /** Periods the source covers — the denominator of "N de M". */
  coveredPeriods: number;
  /** Covered periods where the account actually moved (value ≠ 0). */
  activePeriods: number;
  /** Total over the ACTIVE periods; `null` when nothing moved. */
  averageActive: number | null;
  /** Highest covered period, and only when that maximum is above zero. */
  best: DetailPeriod | null;
  /** Percentage of the rolled-up parent's total; `null` for a root or a parent summing zero. */
  shareOfContainer: number | null;
  containerLabel: string | null;
  /**
   * What part of the TOTAL of costs and expenses this account is, and what part of the TOTAL of
   * revenue.
   *
   * They are not the same as `shareOfContainer` and that is why they do not replace it: that one
   * divides by the IMMEDIATE parent —«Honorarios Médicos is 43 % of Gastos Operacionales»—, which
   * answers where it sits within its branch, and these two divide by the statement's roots —«it is
   * 27 % of the whole expense and 21 % of what was billed»—, which is the question the accountant
   * opens their annex with. An account buried three levels deep has an enormous weight in its parent
   * and a tiny one in the statement, so reading only the first is misleading.
   *
   * `null` when the denominator gives no base, never `0 %`, and `null` too when the caller does not
   * ask for them: an INCOME account's ficha does not divide by the expense.
   */
  shareOfExpenses: number | null;
  shareOfRevenue: number | null;
  /** How the periods of the active frequency are named ("Meses", "Trimestres", …). */
  periodNoun: string;
}

export interface AccountDetailInput {
  /** The single series of the queried account, with its container already rolled up. */
  series: Series;
  /** Where the name, the depth and the ancestors come from — the tree is already built there. */
  source: AnalyticsSource;
  frequency: Frequency;
  /**
   * The statement's totals over the SAME span as the series, for the two weights above. The caller
   * asks for them instead of deriving them here because they come from another query to the engine,
   * and doing it inside would open the door to the ficha squaring against a different span from the
   * one it draws.
   */
  totals?: { expenses: number | null; revenue: number | null };
}

const PERIOD_NOUNS: Record<Frequency, [singular: string, plural: string]> = {
  mensual: ["Mes", "Meses"],
  trimestral: ["Trimestre", "Trimestres"],
  semestral: ["Semestre", "Semestres"],
  // The annual view is a single "Total" column; "Años con movimiento" would read as a count of
  // years, which is not what the number says.
  anual: ["Periodo", "Periodos"],
};

/** How the ficha names the periods of a frequency. Plural unless asked otherwise. */
export function periodNoun(frequency: Frequency, options: { singular?: boolean } = {}): string {
  const [singular, plural] = PERIOD_NOUNS[frequency];
  return options.singular ? singular : plural;
}

/**
 * The ancestors of an account, root first. Walks `parentByCode`, which is the TREE's parenthood
 * and not the dot-prefix one — an orphan hangs from its nearest ancestor, and the path has to
 * say the same thing the table's indentation does.
 */
export function ancestorPath(source: AnalyticsSource, code: string): string[] {
  const names: string[] = [];
  let current = source.parentByCode.get(code);
  while (current !== undefined) {
    names.unshift(source.namesByCode.get(current) ?? current);
    current = source.parentByCode.get(current);
  }
  return names;
}

/** A leaf: no other account in the source declares this one as its parent. */
function isLeaf(source: AnalyticsSource, code: string): boolean {
  for (const parent of source.parentByCode.values()) {
    if (parent === code) {
      return false;
    }
  }
  return true;
}

export function buildAccountDetail({
  series,
  source,
  frequency,
  totals,
}: AccountDetailInput): AccountDetail {
  const code = series.key.code;
  const path = ancestorPath(source, code);
  const covered = series.points.filter(
    (point): point is SeriesPoint & { value: number } => point.value !== null,
  );

  const total = covered.reduce((sum, point) => sum + point.value, 0);
  const active = covered.filter((point) => point.value !== 0);

  return {
    code,
    name: source.namesByCode.get(code) ?? series.label,
    path,
    level: path.length + 1,
    imputable: isLeaf(source, code),
    total,
    coveredPeriods: covered.length,
    activePeriods: active.length,
    averageActive: active.length > 0 ? total / active.length : null,
    best: bestPeriod(covered),
    ...containerShare(series, total),
    // The SAME definition of «percentage over a total» the annex's two columns use, so a line's ficha
    // and its row in the table cannot say different figures.
    shareOfExpenses: totals ? shareOf(total, totals.expenses) : null,
    shareOfRevenue: totals ? shareOf(total, totals.revenue) : null,
    periodNoun: periodNoun(frequency),
  };
}

/**
 * The highest period, but only when it is above zero. An account that is negative all year —
 * `4.1.4 Rebaja y/o Descuentos sobre Ventas` is the canonical one — has no "best month", and
 * naming the least-bad one would read as a peak that never happened.
 */
function bestPeriod(covered: (SeriesPoint & { value: number })[]): DetailPeriod | null {
  let best: (SeriesPoint & { value: number }) | null = null;
  for (const point of covered) {
    if (!best || point.value > best.value) {
      best = point;
    }
  }
  if (!best || best.value <= 0) {
    return null;
  }
  return { label: periodLabel(best.period), value: best.value };
}

/**
 * The account's weight inside its parent. The denominator is the container the ENGINE rolled up,
 * never the sum of whatever series happen to be on screen — that is the same rule the 100%
 * stacked chart follows, and it is why picking three of eight children correctly falls short
 * of 100%.
 */
function containerShare(
  series: Series,
  total: number,
): Pick<AccountDetail, "shareOfContainer" | "containerLabel"> {
  const container = series.container;
  if (!container) {
    return { shareOfContainer: null, containerLabel: null };
  }
  const containerTotal = container.points.reduce((sum, point) => sum + (point.value ?? 0), 0);
  return {
    shareOfContainer: containerTotal === 0 ? null : (total / containerTotal) * 100,
    containerLabel: container.label,
  };
}
