/**
 * Calculates the drift in "Utilidad o Pérdida" from the uploaded file's declared result.
 * Ensures values are derived dynamically to prevent staleness.
 */

import { formatCurrency, pluralize } from "../format";
import { periodSlotLabel } from "./analytics/period";
import {
  applyLeafEdits,
  buildAccountTree,
  computeResult,
  computeRollups,
  type YearSlice,
} from "./derive";

/**
 * Half a cent: below this the difference is float drift, not an adjustment. Same threshold
 * `upload/microplus.ts` uses to validate a file's own `RESULTADO:` row.
 */
const TOLERANCE = 0.005;

export interface DriftPeriod {
  year: number;
  /** Position within the year at the dataset's BASE frequency. */
  index: number;
  /** Ready to read, with its year: "Mar 2026". */
  label: string;
  /** The exercise as the file left it. */
  file: number;
  /** The exercise with the adjustments applied. */
  current: number;
  /** `current − file`, signed — the direction is half of what the reader needs. */
  difference: number;
}

export interface ResultDrift {
  /** Only the periods that actually moved, in calendar order. */
  periods: DriftPeriod[];
  /** Σ of every difference. Signed. */
  total: number;
}

/**
 * `null` when the result still matches the file — which is the ordinary case, so callers render
 * nothing at all rather than an "everything is fine" banner.
 *
 * Judges the slices HANDED TO IT, so a caller passing what is on screen gets an answer about what
 * is on screen — the rule the zero-row prune already follows.
 */
export function computeResultDrift(slices: readonly YearSlice[]): ResultDrift | null {
  const periods: DriftPeriod[] = [];

  for (const slice of [...slices].sort((a, b) => a.dataset.year - b.dataset.year)) {
    // No overlay, no drift. Also the common case, and it skips both derivations.
    if (!slice.edits.some((edit) => edit.value !== undefined)) {
      continue;
    }

    // `applyLeafEdits` and `computeRollups` clone rather than mutate, so both readings can be
    // taken off the same tree.
    const { roots } = buildAccountTree(slice.dataset.accounts);
    const file = computeResult(computeRollups(roots)).values;
    const current = computeResult(computeRollups(applyLeafEdits(roots, slice.edits))).values;

    for (let index = 0; index < current.length; index++) {
      const fileValue = file[index] ?? 0;
      const currentValue = current[index] ?? 0;
      const difference = currentValue - fileValue;
      if (Math.abs(difference) < TOLERANCE) {
        continue;
      }
      periods.push({
        year: slice.dataset.year,
        index,
        label: `${periodSlotLabel({ frequency: slice.dataset.baseFrequency, index })} ${slice.dataset.year}`,
        file: fileValue,
        current: currentValue,
        difference,
      });
    }
  }

  if (periods.length === 0) {
    return null;
  }
  return {
    periods,
    total: periods.reduce((sum, period) => sum + period.difference, 0),
  };
}

/** An amount whose DIRECTION is the point: "+$500.00" / "-$500.00". */
function signed(value: number): string {
  return `${value > 0 ? "+" : ""}${formatCurrency(value, { cents: true })}`;
}

/** One period's line: what the file brought, what it says now, and the gap. */
function describePeriod(period: DriftPeriod): string {
  return `${period.label}: el archivo trae ${formatCurrency(period.file, { cents: true })}, ahora da ${formatCurrency(period.current, { cents: true })} (${signed(period.difference)}).`;
}

/**
 * The banner's wording. A single drifted period says everything on one line — opening a "Ver
 * detalle" to repeat the same sentence would be a click for nothing — so `details` is empty there.
 */
export function describeResultDrift(drift: ResultDrift): { summary: string; details: string[] } {
  if (drift.periods.length === 1) {
    const [period] = drift.periods;
    return {
      summary: `La utilidad de ${period.label} ya no coincide con la del archivo: traía ${formatCurrency(period.file, { cents: true })} y ahora da ${formatCurrency(period.current, { cents: true })} (${signed(period.difference)}).`,
      details: [],
    };
  }
  return {
    summary: `La utilidad ya no coincide con la del archivo en ${pluralize(drift.periods.length, "periodo")}: ${signed(drift.total)} en total.`,
    details: drift.periods.map(describePeriod),
  };
}
