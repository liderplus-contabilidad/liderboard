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
import { writeLogoHeader } from "@/lib/excel-logo";
import { centerLogoOf, type CenterLogos, type EntityLogo } from "@/lib/logos";
import { formatCurrency } from "@/lib/format";
import { sectionTone } from "./datos-sections";
import type { DatosCell, DatosColumn, DatosGrid, DatosRow } from "./datos-types";
import { applyEditsToLeafAccounts, mergeCenters, toDatosGrid } from "./derive";
import { emptyAccountCodes, movingColumnPositions } from "./filter";
import {
  appWorkbookMetaToRows,
  APP_WORKBOOK_META_SHEET,
  SINGLE_WORKBOOK_CENTER_KEY,
  type AppWorkbookMode,
  type AppWorkbookSheet,
  type AppWorkbookYear,
  type CenterCellAdjustment,
  type CenterCellComment,
} from "./excel-metadata";
import type { CellEdit, PygDataset } from "./types";
import { LEGACY_SYSTEM, MONTHLY_CENTERS_SYSTEM } from "./upload/systems";

const CODE_COL = 1;
const NAME_COL = 2;
const FIRST_VALUE_COL = 3;
/**
 * Ecuador USD, sign before the symbol: "$1,234.00" / "-$1,234.00".
 *
 * The `,` and `.` in a format code are PLACEHOLDERS, not literals — the reader's regional
 * settings decide which character each one becomes, and CLDR says Ecuador writes
 * "$1.234,00" (the same mistake `lib/format.ts` had to override in the app). So a Mac set
 * to Ecuador renders these cells backwards however the app displayed them.
 *
 * `[$$-409]` asks for the en-US locale (symbol `$`, LCID 409) and is kept because it is the
 * only statement the FILE gets to make about its own formatting — Sheets and LibreOffice do
 * honor it. But it is NOT a fix: **Excel for Mac ignores it** (verified on macOS `en_EC` —
 * the amounts only came out right after changing System Settings › Language & Region ›
 * Number format). Do not extend this into a guarantee; the reader's locale has the last
 * word, and the only way around that would be writing the amounts as TEXT, which costs the
 * cells their arithmetic and `app-workbook.ts` its round-trip.
 */
const CURRENCY_FMT = "[$$-409]#,##0.00;-[$$-409]#,##0.00";
/** Las columnas de rótulos de una hoja de estado: el código y el nombre de la cuenta. */
const LABEL_COLS = 2;
const SHEET_NAME = "Estado de Resultados";

/** The Estado de Resultados with edited values and comments, ready to download. `loadedMonths`,
 * when given, leaves an unloaded month's cells genuinely empty rather than 0 (mirrors the
 * by-centers "Excel completo"). SHALL re-enter via `app-workbook`'s strategy, reconstructing an
 * equivalent single-mode workspace. */
export function buildPygWorkbook(
  /** Every year of the single-mode workspace, one sheet each. */
  slices: { dataset: PygDataset; edits: CellEdit[] }[],
  loadedMonthsByYear: Record<number, number[]>,
  /** The system the workspace came from — carried in the metadata so the re-upload keeps its
   * identity (a MicroPlus workspace stays MicroPlus). Defaults to the only system that could
   * have produced a single-mode workspace before MicroPlus existed. */
  sourceSystemId: string = LEGACY_SYSTEM,
  /** «Ocultar ceros» — omits the accounts and the months with no movement in ANY year of the
   * file. */
  hideEmpty = false,
  /** El logo del cliente abierto, que encabeza cada hoja. */
  logo?: EntityLogo,
): ExcelJS.Workbook {
  const wb = newWorkbook();
  const used = new Set<string>();
  const sheetRows: AppWorkbookSheet[] = [];
  const ordered = [...slices].sort((a, b) => a.dataset.year - b.dataset.year);

  const sheets = ordered.map(({ dataset, edits }) => ({
    name: uniqueSheetName(sheetTitle(SHEET_NAME, dataset.year, ordered.length > 1), used),
    dataset,
    edits,
    loadedMonths: loadedMonthsByYear[dataset.year] ?? [],
  }));
  writeStatementSheets(wb, sheets, hideEmpty, logo);
  for (const sheet of sheets) {
    sheetRows.push({
      sheetName: sheet.name,
      year: sheet.dataset.year,
      centerId: SINGLE_WORKBOOK_CENTER_KEY,
    });
  }

  attachWorkbookMetadata(
    wb,
    "single",
    ordered.map(({ dataset }) => ({
      year: dataset.year,
      loadedMonths: loadedMonthsByYear[dataset.year] ?? [],
    })),
    sheetRows,
    sourceSystemId,
    ordered.map(({ dataset, edits }) => ({
      centerId: SINGLE_WORKBOOK_CENTER_KEY,
      dataset,
      edits,
    })),
  );
  return wb;
}

/** One statement worksheet still to be written — name resolved, grid not yet built. */
interface StatementSheet {
  name: string;
  dataset: PygDataset;
  edits: CellEdit[];
  /** Month indices actually loaded; `undefined` = no restriction (single-statement mode). */
  loadedMonths?: number[];
  /**
   * El logo de la IZQUIERDA de esta hoja en concreto, cuando no es el mismo en todo el libro. Un
   * libro de un cliente lo tiene único y lo pasa una vez; el consolidado entre clientes no tiene
   * ninguno propio —son varias empresas— y cada hoja se lleva el de la suya.
   */
  logo?: EntityLogo;
  /**
   * El logo del centro al que pertenece esta hoja, si el usuario le subió uno. La hoja Consolidado
   * no lleva: no es un centro, y `centerLogoOf` lo responde por sí solo sin caso propio aquí.
   */
  centerLogo?: EntityLogo;
}

const NO_OMISSIONS: ReadonlySet<string> = new Set();

/**
 * Writes every statement worksheet of a workbook, in order.
 *
 * The grids are built HERE rather than inside each sheet because `hideEmpty` is decided
 * over the whole file at once: a code is omitted only when it has no movement in ANY sheet (see
 * `emptyAccountCodes`), so every sheet keeps the same chart of accounts and they can be read side
 * by side. Nothing annotated is ever omitted, which is what keeps the hidden metadata sheet from
 * pointing at rows that aren't there.
 */
function writeStatementSheets(
  wb: ExcelJS.Workbook,
  sheets: readonly StatementSheet[],
  hideEmpty: boolean,
  logo?: EntityLogo,
): void {
  const grids = sheets.map((sheet) =>
    toDatosGrid(sheet.dataset, sheet.edits, sheet.dataset.baseFrequency),
  );
  const omit = hideEmpty ? emptyAccountCodes(grids) : NO_OMISSIONS;
  const months = hideEmpty ? movingMonths(grids) : null;
  sheets.forEach((sheet, index) =>
    writeStatementSheet(wb, sheet, grids[index], omit, months, sheet.logo ?? logo),
  );
}

/**
 * The month indices worth a column, ascending — a month survives if ANY sheet moved it, the same
 * per-workbook rule the omitted codes follow and for the same reason: the sheets are read side by
 * side, and a month present in one and missing in the next stops them lining up.
 *
 * Dropping an empty month does NOT unbalance the Total: an empty month contributes zero, so what
 * the sheet still shows adds up to exactly the total it always did.
 */
function movingMonths(grids: readonly DatosGrid[]): number[] {
  const moving = new Set<number>();
  for (const grid of grids) {
    const positions = grid.columns.flatMap((column, index) =>
      column.kind === "period" ? [index] : [],
    );
    for (const position of movingColumnPositions(grid.rows, positions)) {
      const column = grid.columns[position];
      // The column carries its own period index; the sheet's month columns are that index, not
      // the position, which is what makes this survive a grid that ever stops starting at Enero.
      if (column.kind === "period") {
        moving.add(column.index);
      }
    }
  }
  return [...moving].sort((a, b) => a - b);
}

/**
 * Writes one Estado de Resultados worksheet (preamble → header → rows → result) into `wb`.
 * `loadedMonths`, when given (the by-centers workspace), leaves an unloaded month's cells
 * genuinely empty rather than 0 — the same distinction the Datos table and the analytics
 * engine make, carried into what gets downloaded.
 */
function writeStatementSheet(
  wb: ExcelJS.Workbook,
  { name, dataset, edits, loadedMonths, centerLogo }: StatementSheet,
  grid: DatosGrid,
  omit: ReadonlySet<string>,
  months: readonly number[] | null,
  logo?: EntityLogo,
): ExcelJS.Worksheet {
  const ws = wb.addWorksheet(name);
  const isMonthly = dataset.baseFrequency !== "anual";
  // Which month columns this sheet writes, in order. `null` is every month — the shape the file
  // has always had, and the one it keeps whenever the switch is off.
  const written = isMonthly ? (months ?? MONTHS_FULL_ES.map((_, index) => index)) : [];

  // Los anchos van ANTES del membrete porque de ellos sale el ancla del logo derecho, y poner un
  // ancho no escribe ninguna fila: nada más de la hoja se entera del adelanto.
  setColumnWidths(ws, written.length + (isMonthly ? 1 : 0));
  // Antes del preámbulo y con la hoja aún vacía: el membrete se ESCRIBE, no se desplaza. Las dos
  // columnas de rótulos —el código y el nombre de la cuenta— son las que marcan el borde derecho
  // de la banda, que es donde acaba el preámbulo escrito justo debajo.
  writeLogoHeader(wb, ws, logo, centerLogo, LABEL_COLS);

  writePreamble(ws, dataset);
  const headerRowNumber = writeHeader(ws, isMonthly, written);
  freeze(ws, headerRowNumber);

  const originals = new Map(dataset.accounts.map((account) => [account.code, account.values]));
  const valueEdits = indexValueEdits(edits);
  emitDataRows(ws, grid.rows, {
    isMonthly,
    columns: grid.columns,
    originals,
    valueEdits,
    loadedMonths,
    omit,
    months: written,
  });
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
export function pygExportFilename(
  dataset: PygDataset | undefined,
  years: readonly number[] = [],
): string {
  const company = sanitize(dataset?.companyName ?? "") || "LiderPlus";
  const sorted = [...years].sort((a, b) => a - b);
  const span =
    sorted.length > 1
      ? ` ${sorted[0]}-${sorted[sorted.length - 1]}`
      : dataset?.periodLabel && dataset.periodLabel !== "—"
        ? ` ${dataset.periodLabel}`
        : "";
  return `PyG ${company}${span}.xlsx`;
}

// ── internals ──────────────────────────────────────────────────────────────

interface EmitContext {
  isMonthly: boolean;
  /** The grid's column plan — `row.cells` now carries the year's Total as its last cell, so
   * the period cells have to be told apart from it rather than assumed to be all of them. */
  columns: readonly DatosColumn[];
  originals: Map<string, number[]>;
  valueEdits: Map<string, CellEdit>;
  /** Month indices actually loaded; `undefined` = no restriction (single-statement mode). */
  loadedMonths?: number[];
  /** Account codes to leave out — empty unless «Ocultar ceros» is on. A code in here has no
   * movement anywhere in the workbook, so its whole subtree is in here too. */
  omit: ReadonlySet<string>;
  /** Month indices to write, ascending; every month unless «Ocultar ceros» is on. Empty for an
   * annual sheet, which has no month columns at all. */
  months: readonly number[];
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

function writeHeader(ws: ExcelJS.Worksheet, isMonthly: boolean, months: readonly number[]): number {
  const labels = isMonthly ? [...months.map((month) => MONTHS_FULL_ES[month]), "Total"] : ["Total"];
  const row = ws.addRow(["", "", ...labels]);
  row.font = { bold: true };
  row.eachCell((cell) => {
    cell.alignment = { horizontal: "center" };
  });
  return row.number;
}

function setColumnWidths(ws: ExcelJS.Worksheet, valueCols: number): void {
  ws.getColumn(CODE_COL).width = 12;
  ws.getColumn(NAME_COL).width = 42;
  for (let i = 0; i < Math.max(1, valueCols); i++) {
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
    // An omitted code takes its subtree with it: a descendant with movement would have kept its
    // ancestors out of the set, so nothing under this row survives either.
    if (!row.isResult && ctx.omit.has(row.code)) {
      continue;
    }
    writeDataRow(ws, row, ctx);
    if (row.children) {
      emitDataRows(ws, row.children, ctx);
    }
  }
}

function writeDataRow(ws: ExcelJS.Worksheet, row: DatosRow, ctx: EmitContext): void {
  const loaded = (monthIndex: number): boolean =>
    !ctx.loadedMonths || ctx.loadedMonths.includes(monthIndex);
  // The grid's own Total cell rides along in `row.cells`; the sheet writes the period columns
  // and then that total, so the two are separated here rather than re-summed.
  const periodCells = row.cells.filter((_, index) => ctx.columns[index]?.kind !== "total");
  const valueAt = (monthIndex: number): number | null =>
    loaded(monthIndex) ? (periodCells[monthIndex]?.value ?? 0) : null;
  const values = ctx.months.map(valueAt);
  // Summed over EVERY month, not just the written ones — though the two agree by construction,
  // since a month is only ever dropped for having nothing in it.
  const total = periodCells.reduce(
    (sum: number, _cell, monthIndex) => sum + (valueAt(monthIndex) ?? 0),
    0,
  );
  const r = ws.addRow([row.code, row.name, ...values, ...(ctx.isMonthly ? [total] : [])]);

  const isParent = Boolean(row.children?.length);
  if (isParent || row.isResult) {
    r.font = { bold: true };
  }
  r.getCell(NAME_COL).alignment = { indent: Math.max(0, row.level - 1) };

  const lastValueCol = FIRST_VALUE_COL + values.length - 1;
  const lastCol = ctx.isMonthly ? lastValueCol + 1 : lastValueCol;
  for (let col = FIRST_VALUE_COL; col <= lastCol; col++) {
    r.getCell(col).numFmt = CURRENCY_FMT;
  }
  paintSection(r, row, lastCol);

  if (row.isResult) {
    r.eachCell({ includeEmpty: true }, (cell) => {
      cell.border = { top: { style: "thin", color: { argb: "FF94A3B8" } } };
    });
    return; // no notes on the summary row
  }

  // Anchored to the WRITTEN column, not to the month index: with months dropped the two no
  // longer coincide, and a note on the wrong column is worse than no note.
  ctx.months.forEach((monthIndex, offset) => {
    const cell = periodCells[monthIndex];
    if (!cell || !loaded(monthIndex)) {
      return;
    }
    const note = cellNote(row.code, monthIndex, cell, ctx);
    if (note) {
      r.getCell(FIRST_VALUE_COL + offset).note = note;
    }
  });
}

/**
 * Tints the row with the tone of the BLOCK it belongs to — the accountant's own fills, the ones
 * the Datos table already paints on roots 4, 5 and 6.
 *
 * It asks `sectionTone`, the same rule the table and the printed report ask, rather than
 * re-deciding here which root is which: a second classification would drift from the first the
 * day a root changes meaning. What that rule says, the sheet obeys — nothing from level 3 inward,
 * nothing on a result row (its own top border is what closes the block), and the `-hover` tones
 * never travel, because a sheet does not light up when you pass over it.
 *
 * The fill spans the whole row, code through the last value column, since on screen the tone is on
 * the `<tr>`. It takes just what the rule needs rather than a whole `DatosRow`, because the raw
 * month grids — where a row is a code and a level and nothing else — paint through it too.
 */
function paintSection(
  r: ExcelJS.Row,
  row: { code: string; level: number; isResult?: boolean },
  lastCol: number,
): void {
  const tone = sectionTone(row.code, row.level, row.isResult);
  if (!tone) {
    return;
  }
  for (let col = CODE_COL; col <= lastCol; col++) {
    r.getCell(col).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: tone.argb },
    };
  }
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
  /** Coverage per year — an unloaded month is written empty on every sheet of THAT year. */
  loadedMonthsByYear: Record<number, number[]>;
  /** The system the workspace came from; defaults to the by-centers format, the only thing that
   * produces a centers-mode workspace today. */
  sourceSystemId?: string;
  /** Every center-year of the workspace. Grouped and ordered here, not by the caller. */
  centers: { dataset: PygDataset; edits: CellEdit[] }[];
  /** «Ocultar ceros» — omits the accounts and the months with no movement in ANY sheet of the
   * file, never sheet by sheet, so every center keeps the same chart of accounts and the same
   * columns. */
  hideEmpty?: boolean;
  /** El logo del cliente abierto, que encabeza cada hoja. */
  logo?: EntityLogo;
  /**
   * Los logos de los centros, por `centerId`. Solo alcanzan a la hoja de SU centro: el Consolidado
   * no es uno, así que se queda con el del cliente y nada a la derecha.
   */
  centerLogos?: CenterLogos;
}

/**
 * The "Excel completo": the WHOLE workspace, every year of it, in ONE workbook — never a zip,
 * because the file exists to be re-uploadable and only a workbook can re-enter through the
 * `app-workbook` strategy.
 *
 * Per year, in ascending order: a computed "Consolidado" sheet (sum of every center, "Sin centro
 * de costo" included — see `pyg-monthly-cost-centers`'s "es un centro mensual más") followed by
 * one sheet per center. A sheet's INSIDE is unchanged — twelve month columns plus the total — so
 * only which year it belongs to is new, and that travels in the hidden metadata sheet rather
 * than in the title, which Excel caps at 31 characters.
 */
export function buildMultiCenterWorkbook(input: MultiCenterInput): ExcelJS.Workbook {
  const wb = newWorkbook();
  const used = new Set<string>();
  const sheetRows: AppWorkbookSheet[] = [];

  const years = [...new Set(input.centers.map((c) => c.dataset.year))].sort((a, b) => a - b);
  const sheets: StatementSheet[] = [];

  for (const year of years) {
    const ofYear = input.centers
      .filter((c) => c.dataset.year === year)
      .sort((a, b) => (a.dataset.order ?? 0) - (b.dataset.order ?? 0));
    if (ofYear.length === 0) {
      continue;
    }
    const loadedMonths = input.loadedMonthsByYear[year] ?? [];

    // Apply each center's edits before merging so the Consolidado sheet equals the sum of the
    // (edited) center sheets — never the stale pre-edit values.
    const merged = mergeCenters(
      ofYear.map((c) => applyEditsToLeafAccounts(c.dataset.accounts, c.edits)),
    );
    const consolidated: PygDataset = {
      ...ofYear[0].dataset,
      id: `consolidado-${year}`,
      role: "center",
      costCenterName: undefined,
      accounts: merged.accounts,
      resultFromFile: [],
    };
    sheets.push({
      name: uniqueSheetName(sheetTitle("Consolidado", year, years.length > 1), used),
      dataset: consolidated,
      edits: [],
      loadedMonths,
    });

    for (const { dataset, edits } of ofYear) {
      const name = uniqueSheetName(
        sheetTitle(dataset.costCenterName || dataset.centerId || "Centro", year, years.length > 1),
        used,
      );
      const centerLogo = centerLogoOf(input.centerLogos, dataset.centerId);
      sheets.push({ name, dataset, edits, loadedMonths, ...(centerLogo ? { centerLogo } : {}) });
      sheetRows.push({ sheetName: name, year, centerId: dataset.centerId ?? dataset.id });
    }
  }

  // The Consolidado sheet is part of the judgement, not an exception to it: an account nobody
  // moved sums to zero there too, so it never keeps a row alive on its own.
  writeStatementSheets(wb, sheets, input.hideEmpty ?? false, input.logo);

  attachWorkbookMetadata(
    wb,
    "centers",
    years.map((year) => ({ year, loadedMonths: input.loadedMonthsByYear[year] ?? [] })),
    sheetRows,
    input.sourceSystemId ?? MONTHLY_CENTERS_SYSTEM,
    input.centers.map(({ dataset, edits }) => ({
      centerId: dataset.centerId ?? dataset.id,
      dataset,
      edits,
    })),
  );
  return wb;
}

/** «CARTAGO 2025» once there is more than one year to tell apart; the bare name otherwise, so a
 * single-year workbook looks exactly like it always did. */
function sheetTitle(name: string, year: number, multiYear: boolean): string {
  return multiYear ? `${name} ${year}` : name;
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
 * The workbook's ONE hidden metadata sheet: mode, system, the coverage of every year, which
 * (year, centro) each visible sheet holds, and every "center"'s comments and value adjustments
 * (tagged by centerId and year — `SINGLE_WORKBOOK_CENTER_KEY` for a single-mode workbook's
 * entries, since one sheet covers one year either way). Always written, even with nothing to
 * restore: the years and their coverage are needed for round-trip regardless of whether anything
 * was ever edited. Shared by `buildPygWorkbook` (single) and `buildMultiCenterWorkbook`
 * (centers) — `app-workbook`'s strategy reads `mode` back to know which shape to reconstruct.
 */
function attachWorkbookMetadata(
  wb: ExcelJS.Workbook,
  mode: AppWorkbookMode,
  years: AppWorkbookYear[],
  sheets: AppWorkbookSheet[],
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
          year: dataset.year,
          code: edit.code,
          monthIndex: edit.monthIndex,
          comment: edit.comment,
        });
      }
      if (edit.value !== undefined) {
        const originalValue = originals.get(edit.code)?.[edit.monthIndex] ?? 0;
        adjustments.push({
          centerId,
          year: dataset.year,
          code: edit.code,
          monthIndex: edit.monthIndex,
          originalValue,
        });
      }
    }
  }
  const meta = wb.addWorksheet(APP_WORKBOOK_META_SHEET, { state: "veryHidden" });
  meta.addRows(appWorkbookMetaToRows({ years, sheets, mode, system, comments, adjustments }));
}

export interface MonthSliceExportInput {
  companyName: string;
  year: number;
  month: number;
  /** In selector order — "Sin centro de costo" is just the last entry. */
  centers: { name: string; dataset: PygDataset; edits: CellEdit[] }[];
  /** El logo del cliente abierto, que encabeza la hoja. */
  logo?: EntityLogo;
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
  writeLogoHeader(wb, ws, input.logo);

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
    const values = new Map<string, { name: string; value: number; level: number }>();
    flattenGridValuesAtMonth(grid.rows, input.month, values);
    return values;
  });

  const order = [...(perCenter[0]?.keys() ?? [])];
  for (const code of order) {
    const entry = perCenter[0]?.get(code);
    const centerValues = perCenter.map((values) => values.get(code)?.value ?? 0);
    const general = centerValues.reduce((sum, value) => sum + value, 0);
    const row = ws.addRow([code, entry?.name ?? code, general, ...centerValues]);
    const lastCol = FIRST_VALUE_COL + centerValues.length;
    for (let col = FIRST_VALUE_COL; col <= lastCol; col++) {
      row.getCell(col).numFmt = CURRENCY_FMT;
    }
    paintSection(row, { code, level: entry?.level ?? 1 }, lastCol);
  }
  return wb;
}

/** Every non-result row's value at `month`, keyed by code, tree order preserved. The `level` rides
 * along because the row's tone depends on it — these grids have no tree of their own to read it
 * back from. */
function flattenGridValuesAtMonth(
  rows: DatosRow[],
  month: number,
  out: Map<string, { name: string; value: number; level: number }>,
): void {
  for (const row of rows) {
    if (!row.isResult) {
      out.set(row.code, {
        name: row.name,
        value: row.cells[month]?.value ?? 0,
        level: row.level,
      });
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
  /** El logo del cliente abierto, que encabeza la hoja. */
  logo?: EntityLogo;
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
  writeLogoHeader(wb, ws, input.logo);

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
  const values = new Map<string, { name: string; value: number; level: number }>();
  flattenGridValuesAtMonth(grid.rows, input.month, values);
  for (const [code, { name, value, level }] of values) {
    const row = ws.addRow([code, name, value]);
    row.getCell(FIRST_VALUE_COL).numFmt = CURRENCY_FMT;
    paintSection(row, { code, level }, FIRST_VALUE_COL);
  }
  return wb;
}

/**
 * El consolidado entre clientes: por año ascendente, la hoja del total y detrás **una por cada
 * pieza que lo sumó** —cada (cliente · centro) que entró y el estado entero de cada cliente de
 * estado único—. Es el equivalente entre empresas del «Excel completo», y por el mismo motivo:
 * quien recibe la suma pregunta enseguida de dónde sale, y una sola hoja no lo dice.
 *
 * Las piezas llegan HECHAS (`ConsolidatedWorkspace.summedDatasets`) en vez de recomponerse aquí:
 * cuáles entraron lo decidió el filtro al sumar, y volver a decidirlo es exactamente cómo el
 * archivo acaba con hojas que no cuadran con su propio total.
 *
 * Deliberadamente **sin** la hoja de metadatos oculta, y añadir hojas no cambia esa regla: esa
 * hoja es lo que hace que un libro de la app vuelva a entrar reconstruyendo su workspace. Aquí
 * es exactamente lo que no debe pasar: este archivo es la suma de varias empresas, y re-subirlo a
 * un cliente lo reemplazaría por cuentas que no son suyas, con la razón social de otra. Sin
 * metadatos, `app-workbook.ts` no lo reclama y el archivo se queda donde sirve — en el correo del
 * contador, no de vuelta en la base.
 *
 * Los ajustes ya vienen aplicados en las cuentas (`consolidate.ts` los pliega antes de sumar), así
 * que no hay `edits` que pasar.
 */
export interface ConsolidatedInput {
  /** El total, uno por año. El orden lo pone esta función, no el que llame. */
  datasets: readonly PygDataset[];
  /**
   * Las piezas que ese total sumó (`ConsolidatedWorkspace.summedDatasets`): una hoja cada una,
   * detrás de la del año al que pertenece. Sin ellas el archivo es el de siempre — una hoja por
   * año—, que es lo que sigue pasando cuando ningún cliente lleva centros.
   */
  details?: readonly ConsolidatedDetail[];
  loadedMonthsByYear: Record<number, number[]>;
  /** «Ocultar ceros» — lo que ningún cliente movió, cuenta o mes, no llega al archivo. */
  hideEmpty?: boolean;
  /** Los logos de los CLIENTES, por su id: el de la izquierda en la hoja de cada pieza suya. */
  clientLogos?: Record<string, EntityLogo>;
  /** Los de los centros, por el id COMPUESTO `<clientId>::<centerId>` que las piezas llevan. */
  centerLogos?: CenterLogos;
}

/** Una pieza de la suma y de qué cliente salió — el espejo de `SummedDetail` en `consolidate.ts`. */
export interface ConsolidatedDetail {
  clientId: string;
  dataset: PygDataset;
}

export function buildConsolidatedWorkbook(input: ConsolidatedInput): ExcelJS.Workbook {
  const wb = newWorkbook();
  const used = new Set<string>();
  const ordered = [...input.datasets].sort((a, b) => a.year - b.year);
  const multiYear = ordered.length > 1;
  const details = input.details ?? [];
  const sheets: StatementSheet[] = [];

  for (const dataset of ordered) {
    const loadedMonths = input.loadedMonthsByYear[dataset.year] ?? [];
    sheets.push({
      name: uniqueSheetName(sheetTitle("Consolidado", dataset.year, multiYear), used),
      dataset,
      edits: [],
      loadedMonths,
    });
    // Detrás de su año y no todas al final: un estado se lee contra el total del que forma parte,
    // y con dos años el archivo quedaría con las hojas de 2025 debajo del Consolidado de 2026.
    for (const detail of details.filter((entry) => entry.dataset.year === dataset.year)) {
      sheets.push({
        name: uniqueSheetName(
          sheetTitle(detailTitle(detail.dataset), dataset.year, multiYear),
          used,
        ),
        dataset: detail.dataset,
        edits: [],
        loadedMonths,
        logo: input.clientLogos?.[detail.clientId],
        centerLogo: centerLogoOf(input.centerLogos, detail.dataset.centerId),
      });
    }
  }

  // El libro entero es el juicio de «ocultar ceros», piezas incluidas: así todas las hojas
  // conservan el mismo plan de cuentas y las mismas columnas, y se pueden leer en paralelo.
  writeStatementSheets(wb, sheets, input.hideEmpty ?? false);
  return wb;
}

/**
 * Cómo se llama la hoja de una pieza: «Restaurante · Dingoo» para un centro —el mismo rótulo con
 * el que el chip y la leyenda lo nombran, porque el mismo centro existe en varias empresas— y el
 * cliente a secas para uno de estado único, que no tiene centro que nombrar.
 */
function detailTitle(dataset: PygDataset): string {
  const client = dataset.companyName || "Cliente";
  return dataset.costCenterName ? `${dataset.costCenterName} · ${client}` : client;
}

/** `PyG-<años>-consolidado-clientes.xlsx` — fuera del patrón mensual, como «completo». */
export function consolidatedFilename(years: readonly number[]): string {
  const sorted = [...years].sort((a, b) => a - b);
  if (sorted.length === 0) {
    return "PyG-consolidado-clientes.xlsx";
  }
  const span = sorted.length === 1 ? `${sorted[0]}` : `${sorted[0]}-${sorted[sorted.length - 1]}`;
  return `PyG-${span}-consolidado-clientes.xlsx`;
}

/** `PyG-<año>-completo.xlsx` — outside the monthly pattern so it never reads as a month. */
export function multiCenterFilename(years: readonly number[]): string {
  const sorted = [...years].sort((a, b) => a - b);
  if (sorted.length === 0) {
    return "PyG-completo.xlsx";
  }
  // A range rather than a list: «PyG-2025-2027-completo» stays inside the same shape whatever
  // the workspace grows to, and never accidentally matches the monthly `PyG-AAAA-MM` pattern.
  const span = sorted.length === 1 ? `${sorted[0]}` : `${sorted[0]}-${sorted[sorted.length - 1]}`;
  return `PyG-${span}-completo.xlsx`;
}

/** `PyG-<año>-<mes>-liderboard.xlsx` — inside the monthly pattern so it re-enters unrenamed. */
export function monthSliceFilename(year: number, month: number): string {
  return `PyG-${year}-${String(month + 1).padStart(2, "0")}-liderboard.xlsx`;
}
