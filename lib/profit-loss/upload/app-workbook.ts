/**
 * Reads back the "Excel completo" the app itself downloads (see `pyg-workspace-export`):
 * a Consolidado sheet (recomputed on read, never stored), one sheet per center, and the
 * hidden `APP_WORKBOOK_META_SHEET` carrying the year, the loaded months, and — separately
 * from the visible (already-adjusted) values — every comment and value adjustment, so the
 * base/adjustment distinction survives the round-trip (see design.md decision 7).
 */
import { APP_WORKBOOK_META_SHEET, rowsToAppWorkbookMeta } from "../excel-metadata";
import { CENTER_PALETTE, slugifyCenter } from "../workspace";
import type { AccountRow, DatasetRole, ImportedComment, PygDataset, WorkspaceMeta } from "../types";
import { findFirstDataRow, findHeaderRow, normalizeLabel, readGrid, toNumber } from "./grid";
import type { Cell } from "./grid";
import type { StagedUpload, UploadCandidate, UploadStrategy } from "./types";

const ACCOUNT_CODE = /^\d+(\.\d+)*$/;
const RESULT_NAME = /utilidad|p[ée]rdida/i;
const SIN_CENTRO = /sin\s+centro\s+de\s+costo/i;
const CONSOLIDADO_SHEET = /^consolidado/i;

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

/** One center sheet → its accounts, each with 12 monthly values (Total column ignored). */
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

function parse(candidate: UploadCandidate): StagedUpload {
  const metaRows = readGrid(candidate.workbook, APP_WORKBOOK_META_SHEET);
  const meta = rowsToAppWorkbookMeta(metaRows);

  // The visible sheets show ADJUSTED values (useful for a person reading the file); the base
  // a reload must write is the file's original value, recovered from the metadata wherever a
  // cell was adjusted (see design.md decision 7 — base = metadata where it exists, sheet
  // otherwise).
  const originalValueByCell = new Map<string, number>();
  for (const a of meta.adjustments) {
    originalValueByCell.set(`${a.centerId}|${a.code}|${a.monthIndex}`, a.originalValue);
  }

  const centerSheetNames = candidate.workbook.SheetNames.filter(
    (name) => name !== APP_WORKBOOK_META_SHEET && !CONSOLIDADO_SHEET.test(name),
  );

  let companyName = "";
  const datasets: PygDataset[] = [];
  const idByCenterId = new Map<string, string>();

  centerSheetNames.forEach((sheetName, index) => {
    const grid = readGrid(candidate.workbook, sheetName);
    const { companyName: sheetCompany, accounts } = readCenterSheet(grid);
    if (!companyName && sheetCompany) {
      companyName = sheetCompany;
    }
    const centerId = slugifyCenter(sheetName);
    for (const account of accounts) {
      for (let monthIndex = 0; monthIndex < account.values.length; monthIndex++) {
        const original = originalValueByCell.get(`${centerId}|${account.code}|${monthIndex}`);
        if (original !== undefined) {
          account.values[monthIndex] = original;
        }
      }
    }
    const role: DatasetRole = SIN_CENTRO.test(sheetName) ? "sin-centro" : "center";
    const id = crypto.randomUUID();
    idByCenterId.set(centerId, id);
    datasets.push({
      id,
      fileName: candidate.fileName,
      uploadedAt: Date.now(),
      companyName,
      periodLabel: meta.year ? `Ene–Dic ${meta.year}` : "—",
      year: meta.year || null,
      baseFrequency: "mensual",
      role,
      centerId,
      centerColor: CENTER_PALETTE[index % CENTER_PALETTE.length],
      order: index,
      costCenterName: sheetName,
      accounts,
      resultFromFile: [],
      warnings: [],
    });
  });

  // Merge comments and adjustments per cell — a cell can carry both, and each must become
  // exactly one edit row (the edits table's unique index is one row per dataset+code+month).
  const merged = new Map<string, ImportedComment & { centerId: string }>();
  const keyOf = (centerId: string, code: string, monthIndex: number): string =>
    `${centerId}|${code}|${monthIndex}`;
  for (const c of meta.comments) {
    const key = keyOf(c.centerId, c.code, c.monthIndex);
    merged.set(key, {
      centerId: c.centerId,
      code: c.code,
      monthIndex: c.monthIndex,
      comment: c.comment,
    });
  }
  for (const a of meta.adjustments) {
    const key = keyOf(a.centerId, a.code, a.monthIndex);
    const existing = merged.get(key);
    merged.set(key, {
      centerId: a.centerId,
      code: a.code,
      monthIndex: a.monthIndex,
      value: a.originalValue,
      ...(existing?.comment ? { comment: existing.comment } : {}),
    });
  }

  const commentsByDataset: { datasetId: string; comments: ImportedComment[] }[] = [];
  const seedsByDatasetId = new Map<string, ImportedComment[]>();
  for (const seed of merged.values()) {
    const datasetId = idByCenterId.get(seed.centerId);
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

  const workspaceMeta: WorkspaceMeta = {
    companyName,
    warnings: [],
    activeCenterId: "consolidado",
    loadedMonths: meta.loadedMonths,
  };

  return { kind: "workspace", datasets, meta: workspaceMeta, commentsByDataset };
}

export const appWorkbookStrategy: UploadStrategy = {
  id: "app-workbook",
  label: "Excel completo de la app",
  detect,
  parse,
};
