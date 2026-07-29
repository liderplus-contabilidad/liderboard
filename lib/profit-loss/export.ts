/**
 * Builds the downloadable PyG workbooks with `exceljs` (formatting + cell notes, which
 * SheetJS community can't write). Imported statically here; UI code must load this module
 * via dynamic `import()` so exceljs stays out of the initial bundle.
 *
 * The "con tus datos" workbook mirrors the upload structure so it re-parses cleanly
 * (round-trip): preamble → header → account rows → result row. Edited leaves and rolled-up
 * parents come from `toDatosGrid`; every edited cell carries a note with its original value,
 * and every comment becomes a note too. A hidden metadata sheet (shared with the by-centers
 * "Excel completo", see `excel-metadata.ts`) lets `app-workbook`'s strategy restore the year,
 * loaded months, comments and value adjustments on re-upload.
 */
import ExcelJS from "exceljs";
import { MONTHS_FULL_ES } from "@/lib/date";
import { formatCurrency } from "@/lib/format";
import type { DatosCell, DatosRow } from "./datos-types";
import { applyEditsToLeafAccounts, mergeCenters, toDatosGrid } from "./derive";
import {
  appWorkbookMetaToRows,
  APP_WORKBOOK_META_SHEET,
  SINGLE_WORKBOOK_CENTER_KEY,
  type AppWorkbookMode,
  type CenterCellAdjustment,
  type CenterCellComment,
} from "./excel-metadata";
import type { CellEdit, PygDataset } from "./types";
import { LEGACY_SYSTEM, MONTHLY_CENTERS_SYSTEM } from "./upload/systems";

const CODE_COL = 1;
const NAME_COL = 2;
const FIRST_VALUE_COL = 3;
/** Ecuador USD, sign before the symbol: "$1.234,00" / "-$1.234,00" (viewer-locale grouping). */
const CURRENCY_FMT = '"$"#,##0.00;"-$"#,##0.00';
const SHEET_NAME = "Estado de Resultados";

/** The Estado de Resultados with edited values and comments, ready to download. `loadedMonths`,
 * when given, leaves an unloaded month's cells genuinely empty rather than 0 (mirrors the
 * by-centers "Excel completo"). SHALL re-enter via `app-workbook`'s strategy, reconstructing an
 * equivalent single-mode workspace. */
export function buildPygWorkbook(
  dataset: PygDataset,
  edits: CellEdit[],
  loadedMonths?: number[],
  /** The system the workspace came from — carried in the metadata so the re-upload keeps its
   * identity (a MicroPlus workspace stays MicroPlus). Defaults to the only system that could
   * have produced a single-mode workspace before MicroPlus existed. */
  sourceSystemId: string = LEGACY_SYSTEM,
): ExcelJS.Workbook {
  const wb = newWorkbook();
  writeStatementSheet(wb, SHEET_NAME, dataset, edits, loadedMonths);
  attachWorkbookMetadata(wb, "single", dataset.year ?? 0, loadedMonths ?? [], sourceSystemId, [
    { centerId: SINGLE_WORKBOOK_CENTER_KEY, dataset, edits },
  ]);
  return wb;
}

/**
 * Writes one Estado de Resultados worksheet (preamble → header → rows → result) into `wb`.
 * `loadedMonths`, when given (the by-centers workspace), leaves an unloaded month's cells
 * genuinely empty rather than 0 — the same distinction the Datos table and the analytics
 * engine make, carried into what gets downloaded.
 */
function writeStatementSheet(
  wb: ExcelJS.Workbook,
  name: string,
  dataset: PygDataset,
  edits: CellEdit[],
  loadedMonths?: number[],
): ExcelJS.Worksheet {
  const ws = wb.addWorksheet(name);
  const isMonthly = dataset.baseFrequency !== "anual";

  writePreamble(ws, dataset);
  const headerRowNumber = writeHeader(ws, isMonthly);
  setColumnWidths(ws, isMonthly);
  freeze(ws, headerRowNumber);

  const grid = toDatosGrid(dataset, edits, dataset.baseFrequency);
  const originals = new Map(dataset.accounts.map((account) => [account.code, account.values]));
  const valueEdits = indexValueEdits(edits);
  emitDataRows(ws, grid.rows, { isMonthly, originals, valueEdits, loadedMonths });
  return ws;
}

/** Serializes a workbook to a Blob for `downloadBlob`. */
export async function workbookToBlob(wb: ExcelJS.Workbook): Promise<Blob> {
  const buffer = await wb.xlsx.writeBuffer();
  return new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

/** `PyG <empresa> <periodo>.xlsx`, filesystem-safe. */
export function pygExportFilename(dataset: PygDataset | undefined): string {
  const company = sanitize(dataset?.companyName ?? "") || "LiderPlus";
  const period =
    dataset?.periodLabel && dataset.periodLabel !== "—" ? ` ${dataset.periodLabel}` : "";
  return `PyG ${company}${period}.xlsx`;
}

// ── internals ──────────────────────────────────────────────────────────────

interface EmitContext {
  isMonthly: boolean;
  originals: Map<string, number[]>;
  valueEdits: Map<string, CellEdit>;
  /** Month indices actually loaded; `undefined` = no restriction (single-statement mode). */
  loadedMonths?: number[];
}

function newWorkbook(): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  wb.creator = "LiderPlus";
  return wb;
}

function writePreamble(ws: ExcelJS.Worksheet, dataset?: PygDataset): void {
  ws.addRow([dataset?.companyName || "LiderPlus"]).getCell(CODE_COL).font = {
    bold: true,
    size: 14,
  };
  ws.addRow(["Estado de Resultados"]).getCell(CODE_COL).font = {
    bold: true,
    color: { argb: "FF64748B" },
  };
  if (dataset?.costCenterName) {
    ws.addRow([`Centro de Costo: ${dataset.costCenterName}`]);
  }
  if (dataset?.year != null) {
    ws.addRow([`Desde el 01/01/${dataset.year} hasta el 31/12/${dataset.year}`]);
  }
  ws.addRow([]);
}

function writeHeader(ws: ExcelJS.Worksheet, isMonthly: boolean): number {
  const labels = isMonthly ? [...MONTHS_FULL_ES, "Total"] : ["Total"];
  const row = ws.addRow(["", "", ...labels]);
  row.font = { bold: true };
  row.eachCell((cell) => {
    cell.alignment = { horizontal: "center" };
  });
  return row.number;
}

function setColumnWidths(ws: ExcelJS.Worksheet, isMonthly: boolean): void {
  ws.getColumn(CODE_COL).width = 12;
  ws.getColumn(NAME_COL).width = 42;
  const valueCols = isMonthly ? 13 : 1; // 12 months + Total, or a single Total
  for (let i = 0; i < valueCols; i++) {
    ws.getColumn(FIRST_VALUE_COL + i).width = 13;
  }
}

function freeze(ws: ExcelJS.Worksheet, headerRowNumber: number): void {
  ws.views = [{ state: "frozen", xSplit: 2, ySplit: headerRowNumber }];
}

function indexValueEdits(edits: CellEdit[]): Map<string, CellEdit> {
  const map = new Map<string, CellEdit>();
  for (const edit of edits) {
    if (edit.value !== undefined) {
      map.set(cellKey(edit.code, edit.monthIndex), edit);
    }
  }
  return map;
}

function emitDataRows(ws: ExcelJS.Worksheet, rows: DatosRow[], ctx: EmitContext): void {
  for (const row of rows) {
    writeDataRow(ws, row, ctx);
    if (row.children) {
      emitDataRows(ws, row.children, ctx);
    }
  }
}

function writeDataRow(ws: ExcelJS.Worksheet, row: DatosRow, ctx: EmitContext): void {
  const loaded = (monthIndex: number): boolean =>
    !ctx.loadedMonths || ctx.loadedMonths.includes(monthIndex);
  const values = row.cells.map((cell, monthIndex) =>
    loaded(monthIndex) ? (cell.value ?? 0) : null,
  );
  const total = values.reduce((sum: number, value) => sum + (value ?? 0), 0);
  const r = ws.addRow([row.code, row.name, ...values, ...(ctx.isMonthly ? [total] : [])]);

  const isParent = Boolean(row.children?.length);
  if (isParent || row.isResult) {
    r.font = { bold: true };
  }
  r.getCell(NAME_COL).alignment = { indent: Math.max(0, row.level - 1) };

  const lastValueCol = FIRST_VALUE_COL + row.cells.length - 1;
  const lastCol = ctx.isMonthly ? lastValueCol + 1 : lastValueCol;
  for (let col = FIRST_VALUE_COL; col <= lastCol; col++) {
    r.getCell(col).numFmt = CURRENCY_FMT;
  }

  if (row.isResult) {
    r.eachCell({ includeEmpty: true }, (cell) => {
      cell.border = { top: { style: "thin", color: { argb: "FF94A3B8" } } };
    });
    return; // no notes on the summary row
  }

  row.cells.forEach((cell, monthIndex) => {
    if (!loaded(monthIndex)) {
      return;
    }
    const note = cellNote(row.code, monthIndex, cell, ctx);
    if (note) {
      r.getCell(FIRST_VALUE_COL + monthIndex).note = note;
    }
  });
}

/**
 * Comment-only cells carry their text; edited cells carry `Valor original: $X → $Y`
 * (plus the comment when there is one) so an edit is never invisible under "solo la nota".
 */
function cellNote(
  code: string,
  monthIndex: number,
  cell: DatosCell,
  ctx: EmitContext,
): string | undefined {
  const edited = ctx.valueEdits.get(cellKey(code, monthIndex));
  if (edited) {
    const original = ctx.originals.get(code)?.[monthIndex] ?? 0;
    const annotation = `Valor original: ${money(original)} → ${money(cell.value ?? 0)}`;
    return cell.comment ? `${cell.comment}\n\n${annotation}` : annotation;
  }
  return cell.comment || undefined;
}

function cellKey(code: string, monthIndex: number): string {
  return `${code}:${monthIndex}`;
}

function money(value: number): string {
  return formatCurrency(value, { cents: true });
}

function sanitize(name: string): string {
  return name
    .replace(/[\\/:*?"<>|]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export interface MultiCenterInput {
  companyName: string;
  year: number;
  /** Month indices actually loaded — unloaded columns are written empty on every sheet. */
  loadedMonths: number[];
  /** The system the workspace came from; defaults to the by-centers format, the only thing that
   * produces a centers-mode workspace today. */
  sourceSystemId?: string;
  /** In selector order — "Sin centro de costo" is just the last entry, no special case. */
  centers: { dataset: PygDataset; edits: CellEdit[] }[];
}

/**
 * The "Excel completo": a computed "Consolidado" sheet (sum of every center, "Sin centro de
 * costo" included — see `pyg-monthly-cost-centers`'s "es un centro mensual más"), one sheet
 * per center, and ONE hidden metadata sheet for the whole workbook (year, loaded months,
 * every comment and value adjustment) — round-trips through the `app-workbook` strategy.
 * Sheet names are Excel-safe (≤31 chars, unique).
 */
export function buildMultiCenterWorkbook(input: MultiCenterInput): ExcelJS.Workbook {
  const wb = newWorkbook();
  const used = new Set<string>();

  const base = input.centers[0]?.dataset;
  if (base) {
    // Apply each center's edits before merging so the Consolidado sheet equals the sum of the
    // (edited) center sheets — never the stale pre-edit values.
    const merged = mergeCenters(
      input.centers.map((c) => applyEditsToLeafAccounts(c.dataset.accounts, c.edits)),
    );
    const consolidated: PygDataset = {
      ...base,
      id: "consolidado",
      role: "center",
      costCenterName: undefined,
      accounts: merged.accounts,
      resultFromFile: [],
    };
    writeStatementSheet(
      wb,
      uniqueSheetName("Consolidado", used),
      consolidated,
      [],
      input.loadedMonths,
    );
  }

  for (const { dataset, edits } of input.centers) {
    const name = uniqueSheetName(dataset.costCenterName || dataset.centerId || "Centro", used);
    writeStatementSheet(wb, name, dataset, edits, input.loadedMonths);
  }

  attachWorkbookMetadata(
    wb,
    "centers",
    input.year,
    input.loadedMonths,
    input.sourceSystemId ?? MONTHLY_CENTERS_SYSTEM,
    input.centers.map(({ dataset, edits }) => ({
      centerId: dataset.centerId ?? dataset.id,
      dataset,
      edits,
    })),
  );
  return wb;
}

/** Excel forbids > 31 chars, the chars \ / ? * [ ] :, and duplicate sheet names. */
function uniqueSheetName(raw: string, used: Set<string>): string {
  const cleaned =
    raw
      .replace(/[\\/?*[\]:]/g, " ")
      .replace(/\s+/g, " ")
      .trim() || "Hoja";
  let name = cleaned.slice(0, 31);
  let n = 2;
  while (used.has(name.toLowerCase())) {
    const suffix = ` (${n})`;
    name = `${cleaned.slice(0, 31 - suffix.length)}${suffix}`;
    n++;
  }
  used.add(name.toLowerCase());
  return name;
}

/**
 * The workbook's ONE hidden metadata sheet: mode, year, loaded months, and every "center"'s
 * comments and value adjustments (tagged by centerId — `SINGLE_WORKBOOK_CENTER_KEY` for a
 * single-mode workbook's one entry, since one sheet covers the whole workspace either way —
 * see design.md decision 7). Always written, even with nothing to restore: `year`/`loadedMonths`
 * are needed for round-trip regardless of whether anything was ever edited. Shared by
 * `buildPygWorkbook` (single) and `buildMultiCenterWorkbook` (centers) — `app-workbook`'s
 * strategy reads `mode` back to know which shape to reconstruct.
 */
function attachWorkbookMetadata(
  wb: ExcelJS.Workbook,
  mode: AppWorkbookMode,
  year: number,
  loadedMonths: number[],
  system: string,
  entries: { centerId: string; dataset: PygDataset; edits: CellEdit[] }[],
): void {
  const comments: CenterCellComment[] = [];
  const adjustments: CenterCellAdjustment[] = [];
  for (const { centerId, dataset, edits } of entries) {
    const originals = new Map(dataset.accounts.map((account) => [account.code, account.values]));
    for (const edit of edits) {
      if (edit.comment) {
        comments.push({
          centerId,
          code: edit.code,
          monthIndex: edit.monthIndex,
          comment: edit.comment,
        });
      }
      if (edit.value !== undefined) {
        const originalValue = originals.get(edit.code)?.[edit.monthIndex] ?? 0;
        adjustments.push({ centerId, code: edit.code, monthIndex: edit.monthIndex, originalValue });
      }
    }
  }
  const meta = wb.addWorksheet(APP_WORKBOOK_META_SHEET, { state: "veryHidden" });
  meta.addRows(appWorkbookMetaToRows({ year, loadedMonths, mode, system, comments, adjustments }));
}

export interface MonthSliceExportInput {
  companyName: string;
  year: number;
  month: number;
  /** In selector order — "Sin centro de costo" is just the last entry. */
  centers: { name: string; dataset: PygDataset; edits: CellEdit[] }[];
}

/**
 * A single month in the source system's own grid — GENERAL, a column per center, then "Sin
 * centro de costo" — with the user's adjustments already applied. Re-enters through the
 * `monthly-centers` strategy exactly like a fresh accounting-system export (see
 * `pyg-workspace-export`'s "Un mes suelto se puede descargar en formato crudo"). This format
 * never carries a date line, so the preamble doesn't either — the month lives in the filename.
 */
export function buildMonthSliceWorkbook(input: MonthSliceExportInput): ExcelJS.Workbook {
  const wb = newWorkbook();
  const ws = wb.addWorksheet("Reporte");

  ws.addRow([input.companyName || "LiderPlus"]).getCell(CODE_COL).font = { bold: true, size: 14 };
  ws.addRow(["Estado de Resultados"]).getCell(CODE_COL).font = {
    bold: true,
    color: { argb: "FF64748B" },
  };
  ws.addRow([]);

  const centerLabels = input.centers.map((c) => c.name);
  const headerRow = ws.addRow(["", "", "GENERAL", ...centerLabels]);
  headerRow.font = { bold: true };
  headerRow.eachCell((cell) => {
    cell.alignment = { horizontal: "center" };
  });

  ws.getColumn(CODE_COL).width = 12;
  ws.getColumn(NAME_COL).width = 42;
  for (let i = 0; i < 1 + centerLabels.length; i++) {
    ws.getColumn(FIRST_VALUE_COL + i).width = 16;
  }
  ws.views = [{ state: "frozen", xSplit: 2, ySplit: headerRow.number }];

  // Each center's own grid at "mensual" already has rollups + edits applied — flattening it
  // gives code → value at `input.month`, in the account tree's pre-order (= file/numeric) order.
  const perCenter = input.centers.map(({ dataset, edits }) => {
    const grid = toDatosGrid(dataset, edits, "mensual");
    const values = new Map<string, { name: string; value: number }>();
    flattenGridValuesAtMonth(grid.rows, input.month, values);
    return values;
  });

  const order = [...(perCenter[0]?.keys() ?? [])];
  for (const code of order) {
    const name = perCenter[0]?.get(code)?.name ?? code;
    const centerValues = perCenter.map((values) => values.get(code)?.value ?? 0);
    const general = centerValues.reduce((sum, value) => sum + value, 0);
    const row = ws.addRow([code, name, general, ...centerValues]);
    for (let col = FIRST_VALUE_COL; col <= FIRST_VALUE_COL + centerValues.length; col++) {
      row.getCell(col).numFmt = CURRENCY_FMT;
    }
  }
  return wb;
}

/** Every non-result row's value at `month`, keyed by code, tree order preserved. */
function flattenGridValuesAtMonth(
  rows: DatosRow[],
  month: number,
  out: Map<string, { name: string; value: number }>,
): void {
  for (const row of rows) {
    if (!row.isResult) {
      out.set(row.code, { name: row.name, value: row.cells[month]?.value ?? 0 });
    }
    if (row.children) {
      flattenGridValuesAtMonth(row.children, month, out);
    }
  }
}

export interface SingleMonthSliceInput {
  companyName: string;
  year: number;
  /** 0–11. */
  month: number;
  dataset: PygDataset;
  edits: CellEdit[];
}

/**
 * A single month of a single-mode workspace, in the source system's own grid — one `Total`
 * column and the month's own `Desde el … hasta el …` range line, with the user's adjustments
 * already applied. Re-enters through the `monthly-single` strategy exactly like a fresh
 * accounting-system export (see `pyg-single-monthly-upload`'s "Descargas del modo estado
 * único"). Unlike the by-centers raw month, this format DOES carry a date line — that's how
 * `monthly-single` reads its period back — so the preamble writes it.
 */
export function buildSingleMonthSliceWorkbook(input: SingleMonthSliceInput): ExcelJS.Workbook {
  const wb = newWorkbook();
  const ws = wb.addWorksheet("Reporte");

  ws.addRow([input.companyName || "LiderPlus"]).getCell(CODE_COL).font = { bold: true, size: 14 };
  ws.addRow(["Estado de Resultados"]).getCell(CODE_COL).font = {
    bold: true,
    color: { argb: "FF64748B" },
  };
  const mm = String(input.month + 1).padStart(2, "0");
  const lastDay = new Date(input.year, input.month + 1, 0).getDate();
  ws.addRow([
    `Desde el 01/${mm}/${input.year} hasta el ${String(lastDay).padStart(2, "0")}/${mm}/${input.year}`,
  ]);
  ws.addRow([]);

  const headerRow = ws.addRow(["", "", "Total"]);
  headerRow.font = { bold: true };
  headerRow.eachCell((cell) => {
    cell.alignment = { horizontal: "center" };
  });

  ws.getColumn(CODE_COL).width = 12;
  ws.getColumn(NAME_COL).width = 42;
  ws.getColumn(FIRST_VALUE_COL).width = 16;
  ws.views = [{ state: "frozen", xSplit: 2, ySplit: headerRow.number }];

  // The dataset's "mensual" grid already has rollups + edits applied — flattening it gives
  // code → value at `input.month`, in the account tree's pre-order (= file/numeric) order.
  const grid = toDatosGrid(input.dataset, input.edits, "mensual");
  const values = new Map<string, { name: string; value: number }>();
  flattenGridValuesAtMonth(grid.rows, input.month, values);
  for (const [code, { name, value }] of values) {
    const row = ws.addRow([code, name, value]);
    row.getCell(FIRST_VALUE_COL).numFmt = CURRENCY_FMT;
  }
  return wb;
}

/** `PyG-<año>-completo.xlsx` — outside the monthly pattern so it never reads as a month. */
export function multiCenterFilename(year: number): string {
  return `PyG-${year}-completo.xlsx`;
}

/** `PyG-<año>-<mes>-liderboard.xlsx` — inside the monthly pattern so it re-enters unrenamed. */
export function monthSliceFilename(year: number, month: number): string {
  return `PyG-${year}-${String(month + 1).padStart(2, "0")}-liderboard.xlsx`;
}
