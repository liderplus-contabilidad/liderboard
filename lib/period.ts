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

/** How a granularity is NAMED — the «Ver por» control's labels, and what a report writes. */
const FREQUENCY_LABELS: Record<Frequency, string> = {
  mensual: "Mensual",
  trimestral: "Trimestral",
  semestral: "Semestral",
  anual: "Anual",
};

export function frequencyLabel(frequency: Frequency): string {
  return FREQUENCY_LABELS[frequency];
}

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

// ---------------------------------------------------------------------------
// Tramos con nombre
// ---------------------------------------------------------------------------

/**
 * A NAMED SPAN —«S1», «Q3»— which is deliberately NOT a `Frequency`, and the distinction is
 * load-bearing.
 *
 * A `Frequency` AGGREGATES: `sumByPeriod` folds twelve months into `12 / MONTHS_PER_PERIOD` buckets,
 * so every member of that union has to DIVIDE twelve. A quimestre is five months and `12 / 5` is
 * `2.4`: `Array.from({ length: 2.4 })` builds TWO buckets and noviembre y diciembre desaparecerían
 * del grid de Datos sin que nada lo diga. Adding it to the union would also drop «Quimestral» into
 * PyG's «Ver por» through `FREQUENCY_ORDER`, where nothing reads it.
 *
 * So a span is not a granularity: it is a NAMED SET OF MONTHS, and whoever consumes it marks those
 * months. The semestres are read off `monthsInPeriod` rather than written again — there is one
 * definition of what a semester is, and it is the one PyG already aggregates by.
 */
export type SpanKind = "semestre" | "quimestre";

export const SPAN_KINDS: readonly SpanKind[] = ["semestre", "quimestre"];

export interface NamedSpan {
  kind: SpanKind;
  /** Position in the year, 0-based. */
  index: number;
  /** «S1», «Q3» — the span's proper name, and what a test names. */
  code: string;
  /** The months it covers. Q3 holds TWO of them and says so HERE: nothing infers a length from the
   *  name, which is the same precaution `bucketLabel` takes when it refuses to call two months «T1». */
  months: number[];
}

/**
 * The quimestre is Ecuador's own five-month bucket, and five does not divide twelve: Ene–May and
 * Jun–Oct leave noviembre y diciembre over. That remainder is a THIRD span rather than an omission —
 * a year has to be reachable whole — and it carries its two months explicitly.
 */
const QUIMESTRE_MONTHS: readonly (readonly number[])[] = [
  [0, 1, 2, 3, 4],
  [5, 6, 7, 8, 9],
  [10, 11],
];

/** The spans of one kind, in calendar order. */
export function namedSpans(kind: SpanKind): NamedSpan[] {
  if (kind === "semestre") {
    return [0, 1].map((index) => ({
      kind,
      index,
      code: `S${index + 1}`,
      months: monthsInPeriod("semestral", index),
    }));
  }
  return QUIMESTRE_MONTHS.map((months, index) => ({
    kind,
    index,
    code: `Q${index + 1}`,
    months: [...months],
  }));
}

/** How a span kind is NAMED in a control: «Semestre», «Quimestre». */
export function spanKindLabel(kind: SpanKind): string {
  return kind === "semestre" ? "Semestre" : "Quimestre";
}
