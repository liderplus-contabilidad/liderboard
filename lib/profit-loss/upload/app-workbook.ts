/**
 * Reads back the app's own workbook downloads that carry the hidden `APP_WORKBOOK_META_SHEET`:
 * the by-centers "Excel completo" (a Consolidado sheet + one sheet per center) and the
 * single-mode "Excel con tus datos" (one statement sheet) — told apart by `meta.mode`, since
 * `detect` itself only checks for the metadata sheet's presence, mode-agnostic. Either way the
 * metadata carries the year, the loaded months, and — separately from the visible (already-
 * adjusted) values — every comment and value adjustment, so the base/adjustment distinction
 * survives the round-trip (see design.md decision 7 of `monthly-cost-center-upload`).
 */
import {
  APP_WORKBOOK_META_SHEET,
  rowsToAppWorkbookMeta,
  SINGLE_WORKBOOK_CENTER_KEY,
  type AppWorkbookMeta,
} from "../excel-metadata";
import { assignCenterSlots } from "../workspace";
import type {
  AccountRow,
  DatasetRole,
  ImportedComment,
  ParsedDataset,
  WorkspaceMeta,
} from "../types";
import { findFirstDataRow, findHeaderRow, normalizeLabel, readGrid, toNumber } from "./grid";
import type { Cell } from "./grid";
import { APP_WORKBOOK_SYSTEM } from "./systems";
import type { StagedUpload, UploadCandidate, UploadStrategy } from "./types";

const ACCOUNT_CODE = /^\d+(\.\d+)*$/;
const RESULT_NAME = /utilidad|p[ée]rdida/i;
const SIN_CENTRO = /sin\s+centro\s+de\s+costo/i;

const MONTH_INDEX_BY_LABEL = new Map(
  [
    "enero",
    "febrero",
    "marzo",
    "abril",
    "mayo",
    "junio",
    "julio",
    "agosto",
    "septiembre",
    "octubre",
    "noviembre",
    "diciembre",
  ].map((label, index) => [label, index]),
);

function detect(candidate: UploadCandidate): boolean {
  return Boolean(candidate.workbook.Sheets[APP_WORKBOOK_META_SHEET]);
}

function readCompanyName(grid: Cell[][], headerRow: number): string {
  for (const row of grid.slice(0, headerRow)) {
    const text = typeof row[0] === "string" ? row[0].trim() : "";
    if (text) {
      return text;
    }
  }
  return "";
}

/** One statement sheet → its accounts, each with 12 monthly values (Total column ignored). */
function readCenterSheet(grid: Cell[][]): { companyName: string; accounts: AccountRow[] } {
  const firstDataRow = findFirstDataRow(grid, (code) => ACCOUNT_CODE.test(code));
  if (firstDataRow === -1) {
    return { companyName: "", accounts: [] };
  }
  const headerRow = findHeaderRow(grid, firstDataRow);
  if (headerRow === -1) {
    return { companyName: "", accounts: [] };
  }

  const monthColumns: { sheetCol: number; monthIndex: number }[] = [];
  const header = grid[headerRow];
  for (let col = 2; col < header.length; col++) {
    const monthIndex = MONTH_INDEX_BY_LABEL.get(normalizeLabel(header[col]));
    if (monthIndex !== undefined) {
      monthColumns.push({ sheetCol: col, monthIndex });
    }
  }

  const accounts: AccountRow[] = [];
  for (let i = firstDataRow; i < grid.length; i++) {
    const row = grid[i];
    const code = typeof row[0] === "string" ? row[0].trim() : "";
    const name = typeof row[1] === "string" ? row[1].trim() : "";
    if (!code || !ACCOUNT_CODE.test(code) || !name || RESULT_NAME.test(name)) {
      continue;
    }
    const values = Array.from({ length: 12 }, () => 0);
    for (const { sheetCol, monthIndex } of monthColumns) {
      values[monthIndex] = toNumber(row[sheetCol]);
    }
    accounts.push({ code, name, values });
  }
  return { companyName: readCompanyName(grid, headerRow), accounts };
}

/**
 * Restores original values from metadata, recording displaced adjusted values for re-seeding.
 */
function applyOriginals(
  accounts: AccountRow[],
  originalValueByCell: Map<string, number>,
  centerId: string,
  year: number,
  adjustedValueByCell: Map<string, number>,
): void {
  for (const account of accounts) {
    for (let monthIndex = 0; monthIndex < account.values.length; monthIndex++) {
      const key = cellKey(centerId, year, account.code, monthIndex);
      const original = originalValueByCell.get(key);
      if (original !== undefined) {
        adjustedValueByCell.set(key, account.values[monthIndex]);
        account.values[monthIndex] = original;
      }
    }
  }
}

interface Reconstructed {
  companyName: string;
  datasets: ParsedDataset[];
  /** Every dataset's id, keyed `centerId|year` — the same way the metadata tags its
   * comments and adjustments. `SINGLE_WORKBOOK_CENTER_KEY` stands in for the center in
   * single mode, where there is exactly one per year. */
  idByKey: Map<string, string>;
}

function cellKey(centerId: string, year: number, code: string, monthIndex: number): string {
  return `${centerId}|${year}|${code}|${monthIndex}`;
}

function datasetKey(centerId: string, year: number): string {
  return `${centerId}|${year}`;
}

/**
 * Rebuilds every dataset the workbook carries, ONE PER SHEET, reading the (year, centro) each
 * sheet holds from the metadata's `sheet` rows.
 *
 * The year is never parsed back out of the sheet title: Excel caps a title at 31 characters and
 * the writer truncates and de-duplicates to fit, so the title is display text and the metadata
 * is the record. A sheet the metadata does not list (the per-year Consolidado, which is derived)
 * is skipped.
 */
function reconstruct(
  candidate: UploadCandidate,
  meta: AppWorkbookMeta,
  originalValueByCell: Map<string, number>,
  adjustedValueByCell: Map<string, number>,
): Reconstructed {
  const present = new Set(candidate.workbook.SheetNames);
  let companyName = "";
  const datasets: ParsedDataset[] = [];
  const idByKey = new Map<string, string>();

  for (const sheet of meta.sheets) {
    if (!present.has(sheet.sheetName)) {
      continue;
    }
    const grid = readGrid(candidate.workbook, sheet.sheetName);
    const { companyName: sheetCompany, accounts } = readCenterSheet(grid);
    if (!companyName && sheetCompany) {
      companyName = sheetCompany;
    }
    applyOriginals(accounts, originalValueByCell, sheet.centerId, sheet.year, adjustedValueByCell);

    const id = crypto.randomUUID();
    idByKey.set(datasetKey(sheet.centerId, sheet.year), id);
    const base = {
      id,
      fileName: candidate.fileName,
      uploadedAt: Date.now(),
      companyName,
      periodLabel: `Ene–Dic ${sheet.year}`,
      year: sheet.year,
      baseFrequency: "mensual" as const,
      accounts,
      resultFromFile: [],
      warnings: [],
    };
    if (meta.mode === "single") {
      datasets.push({ ...base, role: "single" });
      continue;
    }
    const role: DatasetRole = SIN_CENTRO.test(sheet.sheetName) ? "sin-centro" : "center";
    datasets.push({
      ...base,
      role,
      centerId: sheet.centerId,
      costCenterName: sheet.sheetName.replace(new RegExp(`\\s+${sheet.year}$`), ""),
    });
  }

  // Color and order belong to the workspace, not to the sheet order of one year — the same rule
  // the monthly merge follows, applied here so a re-upload cannot renumber the centers.
  return { companyName, datasets: assignCenterSlots(datasets), idByKey };
}

function parse(candidate: UploadCandidate): StagedUpload {
  const metaRows = readGrid(candidate.workbook, APP_WORKBOOK_META_SHEET);
  const meta = rowsToAppWorkbookMeta(metaRows);

  // The visible sheets show ADJUSTED values (useful for a person reading the file); the base
  // a reload must write is the file's original value, recovered from the metadata wherever a
  // cell was adjusted.
  const originalValueByCell = new Map<string, number>();
  for (const a of meta.adjustments) {
    originalValueByCell.set(cellKey(a.centerId, a.year, a.code, a.monthIndex), a.originalValue);
  }
  // Filled while reading the sheets: the adjusted value each original displaced.
  const adjustedValueByCell = new Map<string, number>();

  const { companyName, datasets, idByKey } = reconstruct(
    candidate,
    meta,
    originalValueByCell,
    adjustedValueByCell,
  );

  // Merge comments and adjustments per cell — a cell can carry both, and each must become
  // exactly one edit row (the edits table's unique index is one row per dataset+code+month).
  const merged = new Map<string, ImportedComment & { centerId: string; year: number }>();
  for (const c of meta.comments) {
    merged.set(cellKey(c.centerId, c.year, c.code, c.monthIndex), {
      centerId: c.centerId,
      year: c.year,
      code: c.code,
      monthIndex: c.monthIndex,
      comment: c.comment,
    });
  }
  for (const a of meta.adjustments) {
    const key = cellKey(a.centerId, a.year, a.code, a.monthIndex);
    const existing = merged.get(key);
    merged.set(key, {
      centerId: a.centerId,
      year: a.year,
      code: a.code,
      monthIndex: a.monthIndex,
      value: adjustedValueByCell.get(key) ?? a.originalValue,
      ...(existing?.comment ? { comment: existing.comment } : {}),
    });
  }

  const commentsByDataset: { datasetId: string; comments: ImportedComment[] }[] = [];
  const seedsByDatasetId = new Map<string, ImportedComment[]>();
  for (const seed of merged.values()) {
    const datasetId = idByKey.get(datasetKey(seed.centerId, seed.year));
    if (!datasetId) {
      continue;
    }
    const list = seedsByDatasetId.get(datasetId) ?? [];
    list.push({
      code: seed.code,
      monthIndex: seed.monthIndex,
      comment: seed.comment,
      value: seed.value,
    });
    seedsByDatasetId.set(datasetId, list);
  }
  for (const [datasetId, comments] of seedsByDatasetId) {
    commentsByDataset.push({ datasetId, comments });
  }

  const loadedMonthsByYear: Record<number, number[]> = {};
  for (const entry of meta.years) {
    loadedMonthsByYear[entry.year] = entry.loadedMonths;
  }
  const newestYear = meta.years[meta.years.length - 1]?.year ?? 0;

  const workspaceMeta: WorkspaceMeta = {
    companyName,
    warnings: [],
    activeCenterId:
      meta.mode === "single"
        ? (idByKey.get(datasetKey(SINGLE_WORKBOOK_CENTER_KEY, newestYear)) ?? "")
        : "consolidado",
    loadedMonthsByYear,
    // NOT this strategy's own id: the workspace's origin is whatever system the data came from
    // (MicroPlus stays MicroPlus), which is why the metadata carries it.
    sourceSystemId: meta.system,
  };

  return { kind: "workspace", datasets, meta: workspaceMeta, commentsByDataset };
}

export const appWorkbookStrategy: UploadStrategy = {
  id: APP_WORKBOOK_SYSTEM,
  label: "Excel completo de la app",
  detect,
  parse,
  // `export.ts` writes this format, so the declaration is honest — though it never decides a
  // download: this strategy is never a workspace's ORIGIN system (it reads that back from the
  // metadata sheet), so nothing ever asks whether `app-workbook` writes its own format.
  writesOwnFormat: true,
};
