/**
 * The reading of ONE year's revenue: its monthly series, its coverage, its total, its average and its
 * best month. Nothing here is stored — every figure is recomputed from the raíz 4 of the PyG on each
 * render.
 *
 * **Two rules live here, and they are the ones the source workbook gets wrong.**
 *
 * **(a) `null` ≠ `0`.** A month never loaded reads `null` through the whole engine; a loaded month
 * that sold nothing is a real zero. The distinction is what lets an axis skip a month instead of
 * drawing it on the floor, what puts a dash in the table instead of `$0.00`, and —above all— what
 * keeps an unloaded month out of every denominator. It is the same distinction `loadedMonthsByYear`
 * carries in PyG and `monthHasData` in Ocupaciones.
 *
 * **(b) The average divides by the LOADED months, not by twelve.** 2026 has seven months loaded
 * summing $1,683,720.41, so its monthly average is $240,531.49. The workbook writes $240,312.73,
 * dividing by something else; the difference is not a rounding.
 */
import { MONTHS_IN_YEAR, type RevenueYearInput } from "./types";

/** What a year says once read. Every field is derived; none is persisted. */
export interface RevenueYearReading {
  year: number;
  /** Length 12, narrowed to the span asked for: outside it a month reads `null`. */
  monthly: (number | null)[];
  /** The indices that actually carry a figure, ascending — the year's coverage inside the span. */
  loadedMonths: number[];
  /** The sum over the loaded months. A year with none loaded totals `0` and is `covered: false`. */
  total: number;
  /** Rule (b): `total / loadedMonths.length`, or `null` when nothing is loaded. */
  average: number | null;
  /** The largest loaded month, or `null`. Ties resolve to the earliest, which reads as «the first
   *  time it reached that». */
  best: { monthIndex: number; amount: number } | null;
  /** Whether the year has anything to say at all — what decides if it is drawn. */
  covered: boolean;
}

/**
 * A series narrowed to a span: a month outside it reads `null`, exactly like one never loaded.
 *
 * That the two collapse into the same value is the point, and it is what makes the whole module
 * consistent: everything downstream —totals, averages, growth, ratios— already knows that `null` does
 * not participate, so narrowing needs no second mechanism and no flag travelling beside the data.
 */
export function scopeToMonths(
  series: readonly (number | null)[],
  months: readonly number[],
): (number | null)[] {
  const inSpan = new Set(months);
  return Array.from({ length: MONTHS_IN_YEAR }, (_, index) =>
    inSpan.has(index) ? (series[index] ?? null) : null,
  );
}

/** The indices carrying a figure, ascending. */
export function loadedIndicesOf(series: readonly (number | null)[]): number[] {
  const indices: number[] = [];
  for (let index = 0; index < series.length; index++) {
    if (series[index] !== null) {
      indices.push(index);
    }
  }
  return indices;
}

/** The sum over the loaded months. An unloaded month contributes nothing — it is not a zero. */
export function sumOf(series: readonly (number | null)[]): number {
  return series.reduce<number>((total, value) => total + (value ?? 0), 0);
}

/** One year's whole reading, already narrowed to the span. */
export function readRevenueYear(
  input: RevenueYearInput,
  months: readonly number[],
): RevenueYearReading {
  const monthly = scopeToMonths(input.monthlyRevenue, months);
  const loadedMonths = loadedIndicesOf(monthly);
  const total = sumOf(monthly);

  let best: { monthIndex: number; amount: number } | null = null;
  for (const index of loadedMonths) {
    const amount = monthly[index] as number;
    // Strictly greater, so a tie keeps the EARLIEST month.
    if (best === null || amount > best.amount) {
      best = { monthIndex: index, amount };
    }
  }

  return {
    year: input.year,
    monthly,
    loadedMonths,
    total,
    // Rule (b): the divisor is what was loaded, never twelve and never the span's width.
    average: loadedMonths.length > 0 ? total / loadedMonths.length : null,
    best,
    covered: loadedMonths.length > 0,
  };
}

/** Every marked year's reading, in ascending order — the input every card is built from. */
export function readRevenueYears(
  inputs: readonly RevenueYearInput[],
  months: readonly number[],
): RevenueYearReading[] {
  return [...inputs].sort((a, b) => a.year - b.year).map((input) => readRevenueYear(input, months));
}

/**
 * The year every reading is anchored to: the MOST RECENT of the marked ones.
 *
 * It is the reference of the growth, the subject of the tiles and the numerator of nothing else. It
 * is not a control: which year is «the current one» is already decided by what the user marked, and a
 * selector for it would be a second place to choose the same thing.
 */
export function referenceYearOf(
  readings: readonly RevenueYearReading[],
): RevenueYearReading | null {
  return readings.length > 0 ? readings[readings.length - 1] : null;
}
