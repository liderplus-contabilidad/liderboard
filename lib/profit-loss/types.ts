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
  year: number | null;
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

/** What `parsePygWorkbook` yields: the dataset plus any comments to re-seed as edits. */
export interface PygParseResult {
  dataset: PygDataset;
  comments: ImportedComment[];
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
   * Month indices (0–11) actually loaded into the by-centers workspace — declared, not
   * inferred: a loaded month with all-zero values is covered, an unloaded one is not, and the
   * two produce the same zeros. Empty for a single-statement workspace, whose coverage is
   * still derived from values (a whole year always arrives in one file).
   */
  loadedMonths: number[];
}
