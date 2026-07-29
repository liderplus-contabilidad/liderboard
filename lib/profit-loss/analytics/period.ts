/**
 * Period references and their Spanish labels. A period is `(year, frequency, index)`; the
 * year lives here rather than in a continuous X axis so that overlaying 2025 against 2026 is
 * just two series sharing the same indexes.
 */
import { periodLabels } from "../derive";
import type { Frequency } from "../types";
import type { PeriodRef, PeriodSlot } from "./types";

export interface PeriodLabelOptions {
  /** Adds the two-digit year ("Ene 26"). Set it only when the query spans several years. */
  multiYear?: boolean;
}

/**
 * `periodLabels` is the single source of period naming — for "mensual" it already resolves
 * to `MONTHS_SHORT_ES`, so month spelling stays consistent with the Datos table.
 */
export function periodLabel(ref: PeriodRef, options: PeriodLabelOptions = {}): string {
  const label = periodLabels(ref.frequency)[ref.index] ?? String(ref.index + 1);
  return options.multiYear ? `${label} ${String(ref.year).slice(-2)}` : label;
}

/**
 * A year-less slot's label — «Ene», «T1». The filter bar marks slots, not dated periods, so
 * there is no year to append: the mark narrows every visible year at once.
 */
export function periodSlotLabel(slot: PeriodSlot): string {
  return periodLabels(slot.frequency)[slot.index] ?? String(slot.index + 1);
}

/** Every period of a year at the given frequency, in calendar order. */
export function periodsForYear(year: number, frequency: Frequency): PeriodRef[] {
  return periodLabels(frequency).map((_, index) => ({ year, frequency, index }));
}

/** Sort comparator for the unified X axis: year first, then position within the year. */
export function comparePeriodRefs(a: PeriodRef, b: PeriodRef): number {
  return a.year - b.year || a.index - b.index;
}

/**
 * Two references line up when they are the same slot of their respective years (T2 with T2).
 * This is what makes "same period last year" an index match instead of a date calculation.
 */
export function periodsAlign(a: PeriodRef, b: PeriodRef): boolean {
  return a.frequency === b.frequency && a.index === b.index;
}
