/**
 * The Excel of «Registrar datos» — the captured figures going OUT as a file and coming BACK in as the
 * same rows. It is the module's one door for moving the capture between browsers, machines and
 * clients without retyping a decade month by month.
 *
 * **One flat sheet, `Año · Mes · Ventas · Cobros TC · Comis. TC · Publicidad`, twelve rows per year.**
 * Flat because the file is meant to be EDITED in Excel before it comes back: a plain table sorts,
 * filters and pastes in one gesture, where the grid's shape —a block per year— would have the parser
 * reconstructing two dimensions by coordinate. And by LABEL, as every workbook this app reads: the
 * header is located wherever it sits, so a letterhead pushed down or a sheet renamed changes nothing.
 *
 * **What the builder receives is what the parser returns** (`CaptureYearRows`). «Ventas» comes in
 * already RESOLVED by whoever calls —the raíz 4 where the estado de resultados covers the month, what
 * was typed where it does not— because a file that left those months empty would say there were no
 * sales when there were. Whether a returning «Ventas» may be WRITTEN is not decided here: the parser
 * does not know the coverage and must not; the provider applies it, as the paste already does.
 *
 * **`null` ≠ `0` survives the file.** An empty cell is «no se registró» and is written as an EMPTY
 * cell, never a zero; a real zero is written as `0`. A cell that is neither a number nor empty is not
 * coerced to anything: it rejects the file naming the month and the column, because a `0` nobody
 * typed would enter a percentage in silence.
 *
 * The parser returns a result and does not throw, as `parseSalesWorkbook` does: which message and in
 * what words is this module's business, and the drawer only shows it.
 */
import ExcelJS from "exceljs";
import { MONTHS_FULL_ES } from "@/lib/date";
import { compactLabel, readGrid, readWorkbook, type Cell } from "@/lib/excel/workbook";
import { parseCurrency } from "@/lib/format";
import { MONTHS_IN_YEAR, type RevenueExternalAmounts } from "./types";

/** One year as the file carries it: twelve months, index-aligned, `null` where nothing was recorded. */
export interface CaptureYearRows {
  year: number;
  /** Length 12. */
  months: RevenueExternalAmounts[];
}

/** The four amount columns, in the order the grid and the file write them. */
const AMOUNT_COLUMNS = [
  { key: "manualRevenue", label: "Ventas" },
  { key: "cardRevenue", label: "Cobros TC" },
  { key: "cardFees", label: "Comis. TC" },
  { key: "adSpend", label: "Publicidad" },
] as const;

/** The header row VERBATIM — what the sheet writes and what the parser looks for. */
export const CAPTURE_COLUMNS = ["Año", "Mes", ...AMOUNT_COLUMNS.map((column) => column.label)];

export const CAPTURE_SHEET_NAME = "Datos registrados";
export const CAPTURE_TITLE = "Reportería de ingresos · Datos registrados";

const HEADER_FILL = "FFF3F6F9";
const LETTERHEAD_INK = "FF64748B";

export interface CaptureWorkbookHeader {
  clientName: string;
}

/**
 * The sheet. Years ascending, months ascending, every month present — a row with four empty cells is
 * still a row, because the file describes the year WHOLE and that is what loading it back means.
 */
export function buildCaptureWorkbook(
  years: readonly CaptureYearRows[],
  header: CaptureWorkbookHeader,
): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  wb.creator = "LiderPlus";
  const ws = wb.addWorksheet(CAPTURE_SHEET_NAME);

  ws.addRow([header.clientName]).font = { bold: true, size: 14 };
  ws.addRow([CAPTURE_TITLE]).font = { bold: true, color: { argb: LETTERHEAD_INK } };
  ws.addRow([]);

  const head = ws.addRow(CAPTURE_COLUMNS);
  head.font = { bold: true };
  head.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } };
  });

  const sorted = [...years].sort((a, b) => a.year - b.year);
  for (const { year, months } of sorted) {
    for (let month = 0; month < MONTHS_IN_YEAR; month++) {
      const amounts = months[month];
      // `null` → `null` and NOT `""`: exceljs writes a null as an empty cell, and SheetJS reads an
      // empty cell back as `null` with `defval: null`. A `""` would come back as a string and the
      // parser would have to special-case it.
      ws.addRow([
        year,
        MONTHS_FULL_ES[month],
        ...AMOUNT_COLUMNS.map((column) => amounts?.[column.key] ?? null),
      ]);
    }
  }

  ws.getColumn(1).width = 8;
  ws.getColumn(2).width = 14;
  for (let column = 3; column <= CAPTURE_COLUMNS.length; column++) {
    ws.getColumn(column).width = 16;
    ws.getColumn(column).numFmt = "#,##0.00";
  }
  return wb;
}

/** `Datos registrados <cliente>.xlsx`, filesystem-safe. */
export function captureWorkbookFilename(header: CaptureWorkbookHeader): string {
  const name = header.clientName.replace(/[\\/:*?"<>|]/g, " ").trim() || "LiderPlus";
  return `Datos registrados ${name}.xlsx`;
}

export type CaptureParseResult =
  | { ok: true; years: CaptureYearRows[] }
  | { ok: false; message: string };

const WRONG_FORMAT =
  "No parece el Excel de «Datos registrados»: falta su cabecera " +
  `${CAPTURE_COLUMNS.join(" · ")}. Sube el archivo que descargaste desde «Registrar datos».`;

/** Every sheet is tried: the one carrying the header is the one read. */
export function parseCaptureWorkbook(data: ArrayBuffer): CaptureParseResult {
  const workbook = readWorkbook(data);
  if (!workbook) {
    return { ok: false, message: "El archivo no es un Excel que se pueda leer." };
  }
  for (const sheetName of workbook.SheetNames) {
    const grid = readGrid(workbook, sheetName);
    if (grid && findHeader(grid)) {
      return parseCaptureGrid(grid);
    }
  }
  return { ok: false, message: WRONG_FORMAT };
}

interface HeaderPosition {
  row: number;
  /** Column index of each of the six labels, in `CAPTURE_COLUMNS` order. */
  columns: number[];
}

/**
 * The header row is the one that carries all six labels, wherever they sit. Located by label and
 * never by coordinate: what is between the top of the sheet and the table —a letterhead, a blank
 * line, a note somebody typed— is nobody's business here.
 */
function findHeader(grid: readonly Cell[][]): HeaderPosition | null {
  const wanted = CAPTURE_COLUMNS.map(compactLabel);
  for (let row = 0; row < grid.length; row++) {
    const labels = grid[row].map(compactLabel);
    const columns = wanted.map((label) => labels.indexOf(label));
    if (columns.every((column) => column >= 0)) {
      return { row, columns };
    }
  }
  return null;
}

const MONTH_BY_NAME = new Map(MONTHS_FULL_ES.map((name, index) => [compactLabel(name), index]));

/** «Marzo», «marzo» or `3` → 2. `null` when it names no month. */
function readMonth(cell: Cell): number | null {
  if (typeof cell === "number") {
    return Number.isInteger(cell) && cell >= 1 && cell <= MONTHS_IN_YEAR ? cell - 1 : null;
  }
  const label = compactLabel(cell);
  if (label === "") {
    return null;
  }
  const byName = MONTH_BY_NAME.get(label);
  if (byName !== undefined) {
    return byName;
  }
  const asNumber = Number(label);
  return Number.isInteger(asNumber) && asNumber >= 1 && asNumber <= MONTHS_IN_YEAR
    ? asNumber - 1
    : null;
}

/** A four-digit year, as number or text. */
function readYear(cell: Cell): number | null {
  const value = typeof cell === "number" ? cell : Number(String(cell ?? "").trim());
  return Number.isInteger(value) && value >= 1000 && value <= 9999 ? value : null;
}

/**
 * One amount cell. `undefined` is «no pude leer esto», kept apart from `null` («vacío») because
 * they do opposite things: one rejects the file, the other clears the month.
 *
 * Text goes through `parseCurrency` and nothing else — the app's one definition of «qué es un
 * monto», so `$1,234.50` typed as text reads as the number Excel would have stored.
 */
function readAmount(cell: Cell): number | null | undefined {
  if (cell === null) {
    return null;
  }
  if (typeof cell === "number") {
    return Number.isFinite(cell) ? cell : undefined;
  }
  const text = cell.trim();
  if (text === "") {
    return null;
  }
  return parseCurrency(text) ?? undefined;
}

function emptyAmounts(): RevenueExternalAmounts {
  return { manualRevenue: null, cardRevenue: null, cardFees: null, adSpend: null };
}

/**
 * The rows under the header, until the first row that is empty in every one of the six columns.
 * Every year the file names comes back WHOLE — twelve months, the ones the file omits as four
 * `null`s— because what loading it back means is «this year, as the file says».
 */
export function parseCaptureGrid(grid: readonly Cell[][]): CaptureParseResult {
  const header = findHeader(grid);
  if (!header) {
    return { ok: false, message: WRONG_FORMAT };
  }
  const [yearColumn, monthColumn, ...amountColumns] = header.columns;
  const byYear = new Map<number, RevenueExternalAmounts[]>();
  // Which (year, month) pairs this parse has already read: a repeat is a rejection, because two rows
  // for the same month would overwrite each other and nothing would say which one was kept.
  const seen = new Set<string>();

  for (let index = header.row + 1; index < grid.length; index++) {
    const row = grid[index];
    const cells = header.columns.map((column) => row[column] ?? null);
    if (cells.every((cell) => cell === null || String(cell).trim() === "")) {
      break;
    }
    // Messages name what the reader sees —«fila 7», «marzo 2024»— and never a cell coordinate.
    const where = `fila ${index + 1}`;
    const year = readYear(row[yearColumn] ?? null);
    if (year === null) {
      return {
        ok: false,
        message: `En la ${where} el año no se puede leer («${row[yearColumn] ?? ""}»).`,
      };
    }
    const month = readMonth(row[monthColumn] ?? null);
    if (month === null) {
      return {
        ok: false,
        message: `En la ${where} el mes no se puede leer («${row[monthColumn] ?? ""}»).`,
      };
    }
    const monthName = `${MONTHS_FULL_ES[month].toLowerCase()} ${year}`;

    if (seen.has(`${year}-${month}`)) {
      return { ok: false, message: `${capitalize(monthName)} aparece dos veces en el archivo.` };
    }
    const months = byYear.get(year) ?? Array.from({ length: MONTHS_IN_YEAR }, emptyAmounts);

    const amounts = emptyAmounts();
    for (let position = 0; position < AMOUNT_COLUMNS.length; position++) {
      const value = readAmount(row[amountColumns[position]] ?? null);
      if (value === undefined) {
        return {
          ok: false,
          message:
            `En ${monthName}, «${AMOUNT_COLUMNS[position].label}» no es una cifra ` +
            `(«${row[amountColumns[position]]}»). Deja la celda vacía si no se registró.`,
        };
      }
      amounts[AMOUNT_COLUMNS[position].key] = value;
    }
    months[month] = amounts;
    byYear.set(year, months);
    seen.add(`${year}-${month}`);
  }

  const years = [...byYear.entries()]
    .sort(([a], [b]) => a - b)
    .map(([year, months]) => ({ year, months }));
  return { ok: true, years };
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
