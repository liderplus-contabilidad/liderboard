/**
 * The app's one vocabulary for "how coarse is a period". PyG and Ocupaciones both need it, and
 * "T1" has to be spelled the same in both.
 *
 * What does NOT live here is how values combine: a P&L adds its months, while Ocupaciones adds
 * the raw inputs and recomputes ADR, ocupación and RevPAR as ratios OF THOSE SUMS. Only the shape
 * of the buckets is shared.
 */
import { MONTHS_SHORT_ES } from "@/lib/date";

export type Frequency = "mensual" | "trimestral" | "semestral" | "anual";

/** Coarseness order. A file's base frequency floors the UI options (aggregate up only). */
export const FREQUENCY_ORDER: readonly Frequency[] = [
  "mensual",
  "trimestral",
  "semestral",
  "anual",
];

/** Months each period spans, in a 12-month year. */
export const MONTHS_PER_PERIOD: Record<Frequency, number> = {
  mensual: 1,
  trimestral: 3,
  semestral: 6,
  anual: 12,
};

const PERIOD_LABELS: Record<Frequency, readonly string[]> = {
  mensual: MONTHS_SHORT_ES,
  trimestral: ["T1", "T2", "T3", "T4"],
  semestral: ["S1", "S2"],
  anual: ["Total"],
};

export function allowedFrequencies(base: Frequency): Frequency[] {
  return FREQUENCY_ORDER.slice(FREQUENCY_ORDER.indexOf(base));
}

export function periodLabels(target: Frequency): readonly string[] {
  return PERIOD_LABELS[target];
}

/** How many periods a year holds at this frequency: 12, 4, 2 or 1. */
export function periodsPerYear(frequency: Frequency): number {
  return 12 / MONTHS_PER_PERIOD[frequency];
}

/** The month indexes one period spans: `("trimestral", 1)` → `[3, 4, 5]`. */
export function monthsInPeriod(frequency: Frequency, index: number): number[] {
  const span = MONTHS_PER_PERIOD[frequency];
  return Array.from({ length: span }, (_, offset) => index * span + offset);
}

/** Which period a month falls into: `("trimestral", 4)` → `1` (mayo is T2). */
export function periodOfMonth(frequency: Frequency, month: number): number {
  return Math.floor(month / MONTHS_PER_PERIOD[frequency]);
}

/** Folds twelve monthly figures into one per period, by SUM. */
export function sumByPeriod(monthly: readonly number[], frequency: Frequency): number[] {
  const span = MONTHS_PER_PERIOD[frequency];
  return Array.from({ length: periodsPerYear(frequency) }, (_, index) =>
    monthly.slice(index * span, (index + 1) * span).reduce((total, value) => total + value, 0),
  );
}

const FREQUENCY_NOUNS: Record<Frequency, string> = {
  mensual: "Mes",
  trimestral: "Trimestre",
  semestral: "Semestre",
  anual: "Año",
};

/** «Trimestre 1 · ene–mar»: what a button reading "T1" says when you hover it. */
export function periodFullLabel(frequency: Frequency, index: number): string {
  const months = monthsInPeriod(frequency, index);
  const span =
    months.length === 1
      ? MONTHS_SHORT_ES[months[0]].toLowerCase()
      : `${MONTHS_SHORT_ES[months[0]].toLowerCase()}–${MONTHS_SHORT_ES[months[months.length - 1]].toLowerCase()}`;
  return `${FREQUENCY_NOUNS[frequency]} ${index + 1} · ${span}`;
}

/** The months of the SELECTION that fall into a period — never the months it could hold. */
export interface MonthBucket {
  /** Position in the year: 0–3 for a quarter, 0–1 for a semester. */
  index: number;
  months: number[];
  /** false when the selection only marked some of the period's months. */
  complete: boolean;
}

/**
 * Groups marked months into their periods, in calendar order. A partial bucket is KEPT — the user
 * marked those months — but flagged, so whoever labels it avoids calling two months "T1".
 */
export function bucketMonths(frequency: Frequency, months: readonly number[]): MonthBucket[] {
  const span = MONTHS_PER_PERIOD[frequency];
  const byIndex = new Map<number, number[]>();
  for (const month of [...new Set(months)].sort((a, b) => a - b)) {
    const index = periodOfMonth(frequency, month);
    byIndex.set(index, [...(byIndex.get(index) ?? []), month]);
  }
  return [...byIndex.entries()]
    .sort(([a], [b]) => a - b)
    .map(([index, picked]) => ({ index, months: picked, complete: picked.length === span }));
}

/**
 * A complete quarter is "T1"; an incomplete one names the months it holds, because a column
 * reading "T1" over two of its three months is a lie nothing else on screen would correct.
 */
export function bucketLabel(frequency: Frequency, bucket: MonthBucket): string {
  if (bucket.complete) {
    return periodLabels(frequency)[bucket.index] ?? String(bucket.index + 1);
  }
  return bucket.months.map((month) => MONTHS_SHORT_ES[month]).join(" · ");
}
