/**
 * Reading a MicroPlus `BALANCE DE PERDIDAS Y GANANCIAS` grid: WHERE each element sits, and how
 * a value is read. Everything is located by the labels the report itself writes (`CODIGO`,
 * `NOMBRE DE LA CUENTA`, `Desde:`, `Hasta:`, `RESULTADO:`), never by a fixed row or column —
 * MicroPlus spreads its preamble across arbitrary cells (the company on one column, the
 * pagination twenty columns to its right), so a coordinate would start reading the wrong cell
 * the day the template's margins change, and would do it silently (design.md, decision 1).
 *
 * Split from the strategy so the delicate half — label location and the indented value — is
 * testable over bare grids, with no workbook fixtures in the way. Kept convention-free the same
 * way `grid.ts` is: the account-code shape arrives as a predicate, and the sign rule and the
 * trailing-dot normalization live in the strategy, which owns them.
 */
import type { DateRange } from "./date-range";
import { compactLabel, type Cell } from "./grid";

const CODE_LABEL = "codigo";
const NAME_LABEL = "nombre de la cuenta";
const FROM_LABEL = "desde:";
const TO_LABEL = "hasta:";
const RESULT_LABEL = "resultado:";

/** The preamble labels that describe the PRINT, not the report: the pagination and the printing
 * date. Ignored wherever the preamble is read — neither is the period, and neither is the
 * company (see the spec's "La fecha de impresión no es el periodo"). */
const PRINT_LABELS = new Set(["pagina:", "fecha:"]);

const DATE = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;

/** Every label comparison in this module goes through the shared `compactLabel` (case, accents,
 * outer AND inner whitespace); re-exported under the module's own name because its tests and the
 * strategy read it that way. */
export function microplusLabel(cell: Cell): string {
  return compactLabel(cell);
}

function text(cell: Cell): string {
  return typeof cell === "string" ? cell.trim() : "";
}

/** Values are text with a thousands separator (`"1,221,507.82"`). A conversion that ignored
 * that would yield `NaN`, and the generic reader rounds `NaN` to `0` — leaving EVERY account at
 * zero without a single visible error, which is why this lives here with its own tests. */
export function toMicroplusNumber(cell: Cell): number {
  if (typeof cell === "number") {
    return Number.isFinite(cell) ? cell : 0;
  }
  const raw = text(cell);
  if (raw === "") {
    return 0;
  }
  const parsed = Number(raw.replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

export interface MicroplusHeader {
  row: number;
  codeCol: number;
  nameCol: number;
}

/** The header row is the one carrying `CODIGO` AND `NOMBRE DE LA CUENTA`; the two columns come
 * from where those labels are, so a template that shifts them reads the same. */
export function findMicroplusHeader(grid: readonly Cell[][]): MicroplusHeader | null {
  for (let row = 0; row < grid.length; row++) {
    const cells = grid[row] ?? [];
    let codeCol = -1;
    let nameCol = -1;
    for (let col = 0; col < cells.length; col++) {
      const label = microplusLabel(cells[col]);
      if (label === CODE_LABEL && codeCol === -1) {
        codeCol = col;
      } else if (label === NAME_LABEL && nameCol === -1) {
        nameCol = col;
      }
    }
    if (codeCol !== -1 && nameCol !== -1) {
      return { row, codeCol, nameCol };
    }
  }
  return null;
}

/** Index of the first non-empty cell strictly after `from`, or `-1`. */
function nextFilledCol(row: readonly Cell[], from: number): number {
  for (let col = from + 1; col < row.length; col++) {
    if (row[col] !== null && row[col] !== "") {
      return col;
    }
  }
  return -1;
}

function parseDate(cell: Cell): { day: number; month: number; year: number } | null {
  const match = DATE.exec(text(cell));
  return match
    ? { day: Number(match[1]), month: Number(match[2]) - 1, year: Number(match[3]) }
    : null;
}

export interface MicroplusRange {
  range: DateRange;
  /** Row the range was read from — the boundary the company name is searched above. */
  row: number;
}

/**
 * The range row is the one carrying `Desde:`; each date is the next non-empty cell after its
 * own label, because MicroPlus writes label and date in SEPARATE cells (`Desde:` · `01/01/2026`
 * · `Hasta:` · `31/05/2026`) instead of the single `Desde el … hasta el …` line the other
 * format uses.
 */
export function findMicroplusRange(grid: readonly Cell[][]): MicroplusRange | null {
  for (let i = 0; i < grid.length; i++) {
    const row = grid[i] ?? [];
    const fromCol = row.findIndex((cell) => microplusLabel(cell) === FROM_LABEL);
    if (fromCol === -1) {
      continue;
    }
    const fromValueCol = nextFilledCol(row, fromCol);
    const toCol = row.findIndex((cell, col) => col > fromCol && microplusLabel(cell) === TO_LABEL);
    if (fromValueCol === -1 || toCol === -1) {
      return null;
    }
    const from = parseDate(row[fromValueCol]);
    const to = parseDate(row[nextFilledCol(row, toCol)]);
    if (!from || !to) {
      return null;
    }
    return {
      row: i,
      range: {
        fromDay: from.day,
        fromMonth: from.month,
        fromYear: from.year,
        toDay: to.day,
        toMonth: to.month,
        toYear: to.year,
      },
    };
  }
  return null;
}

/**
 * The company is the first non-empty text cell above the range row, reading left to right. A
 * print label (`Página:`, `Fecha:`) and the value that follows it are skipped: those describe
 * the print job, and a template that put them first would otherwise hand back `Página:` as the
 * company name.
 */
export function findMicroplusCompany(grid: readonly Cell[][], beforeRow: number): string {
  for (let i = 0; i < Math.min(beforeRow, grid.length); i++) {
    const row = grid[i] ?? [];
    let skipValue = false;
    for (const cell of row) {
      if (cell === null || cell === "") {
        continue;
      }
      if (PRINT_LABELS.has(microplusLabel(cell))) {
        skipValue = true;
        continue;
      }
      if (skipValue) {
        skipValue = false;
        continue;
      }
      const value = text(cell);
      if (value) {
        return value;
      }
    }
  }
  return "";
}

/** The file's own bottom line: the row whose FIRST non-empty cell is `RESULTADO:`, valued by
 * the next non-empty cell after it. `null` when the file carries no such row. */
export function findMicroplusResult(grid: readonly Cell[][]): number | null {
  for (const row of grid) {
    const labelCol = nextFilledCol(row ?? [], -1);
    if (labelCol === -1 || microplusLabel(row[labelCol]) !== RESULT_LABEL) {
      continue;
    }
    const valueCol = nextFilledCol(row, labelCol);
    return valueCol === -1 ? 0 : toMicroplusNumber(row[valueCol]);
  }
  return null;
}

/** One account row as the grid holds it — the code still carrying its trailing dot, if any. */
export interface MicroplusAccountCell {
  rawCode: string;
  name: string;
  value: number;
}

export interface MicroplusReading {
  accounts: MicroplusAccountCell[];
  warnings: string[];
}

/**
 * The body: every row below the header whose code column holds an account code and whose name
 * column is non-empty. Blank rows, the `RESULTADO:` line and the signature line fall out on
 * their own, without a rule of their own.
 *
 * A value is the ONE non-empty cell to the right of the name — determined per row, never from
 * the header: `SALDO` labels the column only level-3 accounts use, and the real column encodes
 * the account's depth (the report indents to the right), so reading by the header would leave
 * every other level at zero. Verified over the 215 rows of the sample: not one carries two.
 */
export function readMicroplusAccounts(
  grid: readonly Cell[][],
  header: MicroplusHeader,
  isAccountCode: (code: string) => boolean,
): MicroplusReading {
  const accounts: MicroplusAccountCell[] = [];
  const warnings: string[] = [];

  for (let i = header.row + 1; i < grid.length; i++) {
    const row = grid[i] ?? [];
    const rawCode = text(row[header.codeCol]);
    const name = text(row[header.nameCol]);
    if (!rawCode || !name || !isAccountCode(rawCode)) {
      continue;
    }
    const filled: Cell[] = [];
    for (let col = header.nameCol + 1; col < row.length; col++) {
      if (row[col] !== null && row[col] !== "") {
        filled.push(row[col]);
      }
    }
    if (filled.length > 1) {
      warnings.push(
        `La cuenta ${rawCode} trae ${filled.length} valores en su fila; se toma el primero.`,
      );
    }
    accounts.push({ rawCode, name, value: filled.length > 0 ? toMicroplusNumber(filled[0]) : 0 });
  }

  return { accounts, warnings };
}
