/**
 * Contracts for the PyG Excel data layer. `AccountRow` is the file's original truth —
 * never mutated; user changes live in `CellEdit` overlays so a future
 * original-vs-edited comparison needs no migration.
 */

import type { Frequency } from "@/lib/period";

/** The ladder is shared with Ocupaciones; re-exported so PyG's callers keep one import. */
export type { Frequency };

/**
 * How a dataset participates in a workspace. "single" = a standalone statement. "sin-centro"
 * is otherwise an ordinary monthly, editable center — the tag exists only for its distinct
 * selector color and its position at the end of the list, never for a base-frequency or
 * read-only implication (unlike the retired annual, read-only "Sin centro de costo" dataset).
 */
export type DatasetRole = "single" | "center" | "sin-centro";

/** One account row exactly as parsed — original values, never mutated. */
export interface AccountRow {
  code: string;
  name: string;
  /** Monthly base: length 12 (month index 0–11). Annual base: length 1. */
  values: number[];
}

export interface PygDataset {
  id: string;
  fileName: string;
  uploadedAt: number;
  companyName: string;
  /** e.g. "Ene–Dic 2026"; "—" when the file has no date-range line. */
  periodLabel: string;
  /**
   * The year this dataset holds. Required: a dataset is a CENTER-YEAR, so the year is half of
   * its logical key. Every strategy declares it — from the filename, the date-range line or the
   * app workbook's own metadata — so there is no path that produces a dataset without one.
   */
  year: number;
  /** Frequency the file provides; the UI can aggregate up, never down. */
  baseFrequency: Frequency;
  /** Workspace role. "single" for a standalone statement (also the v1 migration default). */
  role: DatasetRole;
  /** Stable slug of the cost center (centers/sin-centro only); drives the selector id. */
  centerId?: string;
  /** Selector dot color (centers only). */
  centerColor?: string;
  /** Order within the selector (centers only). */
  order?: number;
  /** Sucursal files carry "Centro de Costo: X"; kept as metadata only. */
  costCenterName?: string;
  /** Flat, in file order, parents included with their original values. */
  accounts: AccountRow[];
  /** The file's own "Utilidad o Pérdida" row — validation/comparison only. */
  resultFromFile: number[];
  /** Spanish, human-readable parse/validation notes. */
  warnings: string[];
}

/**
 * One cell's imported edit, carried in an exported workbook's hidden metadata sheet and
 * reconstructed on re-upload. The single-statement export bakes value edits into the new
 * baseline, so its entries always carry `comment` and never `value`; the "Excel completo"
 * (app-workbook) round-trip restores adjustments as real edits too, so `value` is set there
 * instead — either field may be present alone, or both (a cell can carry an adjustment and a
 * comment together).
 */
export interface ImportedComment {
  code: string;
  /** Base-frequency column index (month for a monthly base). */
  monthIndex: number;
  comment?: string;
  /** A restored value adjustment (app-workbook round-trip only). */
  value?: number;
}

/** A user edit overlay — never mutates `AccountRow.values`. */
export interface CellEdit {
  id?: number;
  datasetId: string;
  code: string;
  /** Column index in the base frequency (month for a monthly base). */
  monthIndex: number;
  /** Only leaf (movement) accounts hold a value edit; `null` clears the cell. */
  value?: number | null;
  comment?: string;
  updatedAt: number;
}

/** Singleton workspace metadata: company, cuadre warnings, the active selector id. */
export interface WorkspaceMeta {
  companyName: string;
  warnings: string[];
  activeCenterId: string;
  /**
   * The accounting system this workspace came from — the `id` of the upload strategy that
   * originated it (`upload/systems.ts`). Part of its identity `(sistema, empresa, año, modo)`,
   * because two systems' charts of accounts are structurally incompatible; also what decides
   * whether the app can write that system's format back ("Un mes en crudo").
   */
  sourceSystemId: string;
  /**
   * Month indices (0–11) actually loaded, PER YEAR — declared, not inferred: a loaded month
   * with all-zero values is covered, an unloaded one is not, and the two produce the same
   * zeros.
   *
   * Keyed by year because coverage lives on the same axis as the data: loading January of 2026
   * must not mark January of 2025 as covered. A year absent from this record is a year the
   * workspace does not have.
   */
  loadedMonthsByYear: Record<number, number[]>;
}

/** A year's declared coverage; `[]` for a year the workspace never loaded. */
export function loadedMonthsFor(
  meta: Pick<WorkspaceMeta, "loadedMonthsByYear"> | undefined,
  year: number,
): number[] {
  return meta?.loadedMonthsByYear[year] ?? [];
}

/** Every year the workspace declares coverage for, ascending. */
export function loadedYearsOf(
  meta: Pick<WorkspaceMeta, "loadedMonthsByYear"> | undefined,
): number[] {
  return Object.keys(meta?.loadedMonthsByYear ?? {})
    .map(Number)
    .sort((a, b) => a - b);
}
