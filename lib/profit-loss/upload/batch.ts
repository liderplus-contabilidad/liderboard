/**
 * Orchestrates a multi-file monthly-centers upload: validate the WHOLE set before writing
 * anything (a single year, no repeated month), then apply every slice in ascending month
 * order, accumulating one final result for a single persistence write. See the
 * `pyg-monthly-cost-centers` spec's "Varios meses en una sola carga".
 */
import { MONTHS_FULL_ES } from "@/lib/date";
import { PygParseError } from "../errors";
import { mergeMonthSlice } from "../merge-month";
import type { PygDataset } from "../types";
import type { StagedUpload } from "./types";

export type MonthSlice = Extract<StagedUpload, { kind: "month-slice" }>;

export interface BatchApplyResult {
  datasets: PygDataset[];
  loadedMonths: number[];
  warnings: string[];
}

function monthLabel(month: number): string {
  return MONTHS_FULL_ES[month] ?? `mes ${month + 1}`;
}

/** Rejects the WHOLE batch, writing nothing, when it mixes years or repeats a month. */
export function validateBatch(slices: readonly MonthSlice[]): void {
  const years = [...new Set(slices.map((s) => s.year))].sort((a, b) => a - b);
  if (years.length > 1) {
    throw new PygParseError(
      "mixed-years",
      `La carga mezcla archivos de años distintos: ${years.join(", ")}.`,
    );
  }
  const counts = new Map<number, number>();
  for (const slice of slices) {
    counts.set(slice.month, (counts.get(slice.month) ?? 0) + 1);
  }
  const duplicated = [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([month]) => month)
    .sort((a, b) => a - b);
  if (duplicated.length > 0) {
    throw new PygParseError(
      "duplicate-month",
      `La carga incluye más de un archivo para ${duplicated.map(monthLabel).join(", ")}.`,
    );
  }
}

/**
 * Applies every slice in ascending month order onto `current`, accumulating one final result.
 * Throws (writing nothing) if `validateBatch` rejects the set. Persistence is the caller's
 * job — a single `applyMonthSlice(result.datasets, meta)` call is what makes this "one write".
 */
export function applyBatch(
  current: readonly PygDataset[],
  loadedMonths: readonly number[],
  slices: readonly MonthSlice[],
): BatchApplyResult {
  validateBatch(slices);
  const ordered = [...slices].sort((a, b) => a.month - b.month);

  let datasets = [...current];
  let months = [...loadedMonths];
  const warnings: string[] = [];
  for (const slice of ordered) {
    const result = mergeMonthSlice(datasets, months, slice);
    datasets = result.datasets;
    months = result.loadedMonths;
    warnings.push(...result.warnings);
  }
  return { datasets, loadedMonths: months, warnings };
}
