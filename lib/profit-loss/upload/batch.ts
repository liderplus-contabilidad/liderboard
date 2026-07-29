/**
 * Orchestrates a multi-file monthly upload: validate the WHOLE set before writing anything (one
 * identity, no repeated `(year, month)`), then apply every slice onto the datasets of ITS OWN
 * year, accumulating one final result for a single persistence write.
 *
 * A batch may mix years — that is what makes «arrastra los doce de 2025 y los seis de 2026» one
 * upload. What it may not do is bring the same month of the same year twice, which is the same
 * rule as before with the year added to the key.
 *
 * Grouping by year is also what keeps each year's chart of accounts its own: `mergeMonthSlice`
 * unions the codes it sees, so feeding it one year at a time is precisely what stops 2025's 196
 * accounts from appearing, zero-filled, inside 2026's 140.
 */
import { MONTHS_FULL_ES } from "@/lib/date";
import { PygParseError } from "../errors";
import { mergeMonthSlice } from "../merge-month";
import type { PygDataset } from "../types";
import { assignCenterSlots } from "../workspace";
import type { StagedUpload } from "./types";

export type MonthSlice = Extract<StagedUpload, { kind: "month-slice" }>;

export interface BatchApplyResult {
  datasets: PygDataset[];
  /** The workspace's coverage after the batch, per year. */
  loadedMonthsByYear: Record<number, number[]>;
  warnings: string[];
}

function monthLabel(month: number): string {
  return MONTHS_FULL_ES[month] ?? `mes ${month + 1}`;
}

/**
 * Rejects the WHOLE batch, writing nothing, when its own files don't share an identity — system,
 * mode or company — or when it repeats a `(year, month)` pair. Every file in a single drop is
 * meant to be the same workspace, so this is checked before anything merges (a batch mixing
 * identities is rejected outright, never partially applied).
 */
export function validateBatch(slices: readonly MonthSlice[]): void {
  const systems = [...new Set(slices.map((s) => s.system))];
  if (systems.length > 1) {
    throw new PygParseError(
      "mixed-identity",
      "La carga mezcla archivos de sistemas contables distintos; sus planes de cuentas no son " +
        "compatibles.",
    );
  }
  const modes = [...new Set(slices.map((s) => s.mode))];
  if (modes.length > 1) {
    throw new PygParseError(
      "mixed-identity",
      "La carga mezcla un estado único con archivos mensuales por centros de costo.",
    );
  }
  const companies = [...new Set(slices.map((s) => s.companyName))];
  if (companies.length > 1) {
    throw new PygParseError(
      "mixed-identity",
      `La carga mezcla archivos de empresas distintas: ${companies.join(", ")}.`,
    );
  }
  // Keyed by `(year, month)`: the same month of two different years is two different columns of
  // two different datasets, so it is a perfectly ordinary batch.
  const counts = new Map<string, { year: number; month: number; count: number }>();
  for (const slice of slices) {
    const key = `${slice.year}-${slice.month}`;
    const seen = counts.get(key);
    counts.set(key, { year: slice.year, month: slice.month, count: (seen?.count ?? 0) + 1 });
  }
  const duplicated = [...counts.values()]
    .filter((entry) => entry.count > 1)
    .sort((a, b) => a.year - b.year || a.month - b.month);
  if (duplicated.length > 0) {
    throw new PygParseError(
      "duplicate-month",
      `La carga incluye más de un archivo para ` +
        `${duplicated.map((entry) => `${monthLabel(entry.month)} de ${entry.year}`).join(", ")}.`,
    );
  }
}

/**
 * Applies every slice onto `current`, each against the datasets of its own year and in ascending
 * month order, accumulating one final result. Throws (writing nothing) if `validateBatch` rejects
 * the set. Persistence is the caller's job — a single `applyMonthSlice(result.datasets, meta)`
 * call is what makes this "one write".
 *
 * `current` is every dataset in the workspace, of every year; the years the batch doesn't touch
 * come back untouched.
 */
export function applyBatch(
  current: readonly PygDataset[],
  loadedMonthsByYear: Readonly<Record<number, number[]>>,
  slices: readonly MonthSlice[],
): BatchApplyResult {
  validateBatch(slices);

  const byYear = new Map<number, MonthSlice[]>();
  for (const slice of slices) {
    byYear.set(slice.year, [...(byYear.get(slice.year) ?? []), slice]);
  }

  const untouched = current.filter((dataset) => !byYear.has(dataset.year));
  const merged: PygDataset[] = [];
  const coverage: Record<number, number[]> = { ...loadedMonthsByYear };
  const warnings: string[] = [];

  for (const [year, yearSlices] of [...byYear.entries()].sort((a, b) => a[0] - b[0])) {
    let datasets = current.filter((dataset) => dataset.year === year);
    let months = coverage[year] ?? [];
    for (const slice of [...yearSlices].sort((a, b) => a.month - b.month)) {
      const result = mergeMonthSlice(datasets, months, slice);
      datasets = result.datasets;
      months = result.loadedMonths;
      warnings.push(...result.warnings);
    }
    coverage[year] = months;
    merged.push(...datasets);
  }

  // The slot pass runs over the WHOLE workspace, every year at once: a center's color has to be
  // the same in 2025 and in 2026, and the merge above only ever saw one year at a time.
  return {
    datasets: assignCenterSlots([...untouched, ...merged]),
    loadedMonthsByYear: coverage,
    warnings,
  };
}
