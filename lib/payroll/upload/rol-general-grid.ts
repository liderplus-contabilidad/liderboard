/**
 * Reading the rol de pagos' `GENERAL` sheet: WHERE each element sits. Everything is located by
 * the labels the report itself writes, never by a fixed row or column — the sheet's own row 1 is
 * a hand-typed VLOOKUP index list that is DESYNCED (column `AR` is blank across every row and was
 * skipped when the list was typed, so every index from `AS` on names the wrong column), which is
 * exactly the failure mode a coordinate-based reader would inherit silently. The same rule
 * `microplus-grid.ts`/`dingoo-grid.ts` follow.
 *
 * The rótulos live in TWO rows (row 2 rótula `M`–`BH`, row 3 rótula `A`–`L`), so — unlike those
 * two modules, whose header lives on one row — this module doesn't return a single "header row";
 * `findLabel` scans the whole sheet for each label independently and takes the FIRST match,
 * top-to-bottom then left-to-right. Two labels repeat further down (`LIQUIDO A RECIBIR` again at
 * `BH` after `AP`, `PAGADO` again at `CC` after `BZ`, `COSTO TOTAL` again inside the asientos
 * block after `AY`): the report always writes its real header first, so "first match" tells them
 * apart without a coordinate, the same trick `findMicroplusHeader`'s first-match assignment uses.
 *
 * Split from `rol-general.ts` so the delicate half — label location, area attribution, and the
 * employee/area/skip row classification — is testable over bare grids, with no workbook fixtures
 * in the way. Kept convention-free the same way `lib/excel/workbook.ts` is: contract-type
 * validation and hire-date semantics (what "unparseable" MEANS) stay in `rol-general.ts`, which
 * owns the domain; this file only reads what is there.
 */
import { MONTHS_FULL_ES } from "@/lib/date";
import { compactLabel, normalizeLabel, toNumber, type Cell } from "@/lib/excel/workbook";

/** `"MARZO 2026"` (`GENERAL!B2`) → `{ year: 2026, monthIndex: 2 }`. `null` when the cell isn't
 * text, or its shape isn't "word, whitespace, four-digit year", or the word doesn't match one of
 * `MONTHS_FULL_ES` once accents and case are stripped. Matched with `\p{L}+` rather than `[a-z]+`
 * so an accented month name (a file that DOES write `Á`) is accepted too, even though today's
 * `MONTHS_FULL_ES` entries carry none. */
const PERIOD_TEXT = /^(\p{L}+)\s+(\d{4})$/u;

export function parsePeriodText(cell: Cell): { year: number; monthIndex: number } | null {
  if (typeof cell !== "string") {
    return null;
  }
  const match = PERIOD_TEXT.exec(cell.trim());
  if (!match) {
    return null;
  }
  const monthIndex = MONTHS_FULL_ES.findIndex(
    (month) => normalizeLabel(month) === normalizeLabel(match[1]),
  );
  if (monthIndex === -1) {
    return null;
  }
  return { year: Number(match[2]), monthIndex };
}

/** Excel's day-0 in the (non-1904) epoch every desktop workbook uses: `1899-12-30`, already
 * absorbing the classic "1900 was a leap year" bug SheetJS's `raw: true` doesn't correct for. A
 * date cell arrives as this serial, not as text, because `readGrid` never passes `cellDates`. */
const EXCEL_EPOCH_UTC = Date.UTC(1899, 11, 30);
const MS_PER_DAY = 86_400_000;

/** `null` when the cell isn't a positive finite number — never a thrown error, since an
 * unparseable hire date is one employee's bad cell, not a reason to fail the whole file. */
export function excelSerialToISODate(cell: Cell): string | null {
  if (typeof cell !== "number" || !Number.isFinite(cell) || cell <= 0) {
    return null;
  }
  const date = new Date(EXCEL_EPOCH_UTC + Math.floor(cell) * MS_PER_DAY);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Every column this parser reads, by its own key. `ordinalCol` (`No.`) is never stored on the
 * ficha — it exists purely so an area row (name only) can be told apart from an employee row
 * (ordinal AND name). */
type ColumnKey =
  | "ordinalCol"
  | "employeeCol"
  | "roleCol"
  | "baseSalaryCol"
  | "daysCol"
  | "contractTypeCol"
  | "idCardCol"
  | "hireDateCol"
  | "sectorCodeCol"
  | "grossCol"
  | "deductionsCol"
  | "netCol"
  | "costCol"
  | "paidCol";

export type RolGeneralColumns = Record<ColumnKey, number | null> & {
  /** Row `EMPLEADO` was found on — employee/area scanning starts right below it. */
  headerRow: number | null;
  /** Row `SUMAN` was found on — scanning stops right above it, so the asientos contables block
   * starting further down (which also carries values in what look like an account "No." and
   * "name" column) is never read as nómina. */
  sumanRow: number | null;
};

interface LabelSpec {
  key: ColumnKey;
  /** Already `compactLabel`-normalized, so `findLabel` can compare directly. */
  label: string;
  /** As the report itself writes it, for the "columna no encontrada" warning. */
  display: string;
}

const LABEL_SPECS: readonly LabelSpec[] = [
  { key: "ordinalCol", label: "no.", display: "No." },
  { key: "employeeCol", label: "empleado", display: "EMPLEADO" },
  { key: "roleCol", label: "cargo", display: "CARGO" },
  { key: "baseSalaryCol", label: "sueldo base", display: "SUELDO BASE" },
  { key: "daysCol", label: "dias", display: "DIAS" },
  { key: "contractTypeCol", label: "tc", display: "TC" },
  { key: "idCardCol", label: "cedula", display: "CÉDULA" },
  { key: "hireDateCol", label: "fecha ingreso", display: "FECHA INGRESO" },
  { key: "sectorCodeCol", label: "codigo sectorial", display: "CODIGO SECTORIAL" },
  { key: "grossCol", label: "total ingreso", display: "TOTAL INGRESO" },
  { key: "deductionsCol", label: "total egresos", display: "TOTAL EGRESOS" },
  { key: "netCol", label: "liquido a recibir", display: "LIQUIDO A RECIBIR" },
  { key: "costCol", label: "costo total", display: "COSTO TOTAL" },
  { key: "paidCol", label: "pagado", display: "PAGADO" },
];

const SUMAN_LABEL = "suman";

/** First cell whose `compactLabel` equals `target`, scanning row by row then column by column. */
function findLabel(grid: readonly Cell[][], target: string): { row: number; col: number } | null {
  for (let row = 0; row < grid.length; row++) {
    const cells = grid[row] ?? [];
    for (let col = 0; col < cells.length; col++) {
      if (compactLabel(cells[col]) === target) {
        return { row, col };
      }
    }
  }
  return null;
}

export function locateColumns(grid: readonly Cell[][]): RolGeneralColumns {
  const columns = {} as RolGeneralColumns;
  for (const spec of LABEL_SPECS) {
    columns[spec.key] = findLabel(grid, spec.label)?.col ?? null;
  }
  columns.headerRow = findLabel(grid, "empleado")?.row ?? null;
  columns.sumanRow = findLabel(grid, SUMAN_LABEL)?.row ?? null;
  return columns;
}

/** The Spanish labels of every column the report was expected to carry but didn't — in the
 * report's own reading order, for a SINGLE grouped warning (never one per column). */
export function missingColumnLabels(columns: RolGeneralColumns): string[] {
  return LABEL_SPECS.filter((spec) => columns[spec.key] === null).map((spec) => spec.display);
}

function isFilled(cell: Cell): boolean {
  return cell !== null && !(typeof cell === "string" && cell.trim() === "");
}

/** Reads a cell as text tolerating either representation: most identity columns (cédula, código
 * sectorial) arrive as text, but Excel is free to store a 10-digit cédula as a plain number
 * instead — `String()` round-trips it exactly since it is far under `Number.MAX_SAFE_INTEGER`. */
function cellText(cell: Cell): string {
  if (typeof cell === "string") {
    return cell.trim();
  }
  if (typeof cell === "number" && Number.isFinite(cell)) {
    return String(cell);
  }
  return "";
}

function valueAt(row: readonly Cell[], col: number | null): Cell {
  return col === null ? null : (row[col] ?? null);
}

/** One employee row as the grid holds it — raw values only. `contractTypeRaw` isn't yet checked
 * against `"CT" | "TP"` and `hireDateRaw` isn't yet converted from its Excel serial: both are
 * domain decisions (what counts as valid, what "unparseable" means) that `rol-general.ts` owns. */
export interface RolGeneralEmployeeRow {
  area: string;
  name: string;
  role: string;
  baseSalary: number;
  days: number;
  contractTypeRaw: string;
  idCard: string;
  hireDateRaw: Cell;
  sectorCode: string;
  gross: number;
  deductions: number;
  net: number;
  cost: number;
  /** `null` only when the workbook never declared a `PAGADO` column at all — `paidCol === null`.
   * A column that exists but is blank for this one employee reads as `0`, the same convention
   * every other figure in this row follows. */
  paid: number | null;
}

export interface RolGeneralReading {
  rows: RolGeneralEmployeeRow[];
  /** Grouped warnings this reading produced on its own (today: only the "sin área" count).
   * Column-validity and per-employee data warnings are `rol-general.ts`'s to add. */
  warnings: string[];
}

/**
 * The body: every row between the `EMPLEADO` header and `SUMAN` (exclusive on both ends),
 * classified by what columns `A` (ordinal) and `B` (nombre) carry:
 *  - only `B` → an ÁREA header (`ADMINISTRACION`, `HOSPEDAJE`…); becomes the area every employee
 *    row below it inherits, until the next one;
 *  - `A` AND `B` → an EMPLEADO row. The ordinal's own value never matters beyond "is it there" —
 *    it tolerates the file's own `"1-"` (a dash where every other row has a plain integer)
 *    without needing to parse it, because nothing downstream stores it;
 *  - neither → `SUBTOTAL`/`SUMAN` rows (their only content sits in column `C`) and blank rows;
 *    both fall out on their own here, without a rule of their own, the same phrase
 *    `readDingooAccounts`'s doc uses for its own blank rows.
 *
 * Without the `SUMAN` boundary this would keep reading into the asientos contables block that
 * follows (account codes like `621001` sit in `A` with a description in `B` — the same shape as
 * an ordinal-plus-nombre) and misread bookkeeping entries as employees.
 */
export function readEmployeeRows(
  grid: readonly Cell[][],
  columns: RolGeneralColumns,
): RolGeneralReading {
  if (columns.employeeCol === null || columns.headerRow === null) {
    return { rows: [], warnings: [] };
  }

  const start = columns.headerRow + 1;
  const end = columns.sumanRow ?? grid.length;
  const rows: RolGeneralEmployeeRow[] = [];
  let currentArea: string | null = null;
  let noAreaCount = 0;

  for (let r = start; r < end; r++) {
    const row = grid[r] ?? [];
    const name = cellText(valueAt(row, columns.employeeCol));
    if (!name) {
      continue;
    }
    if (!isFilled(valueAt(row, columns.ordinalCol))) {
      currentArea = name;
      continue;
    }
    if (currentArea === null) {
      noAreaCount++;
    }
    rows.push({
      area: currentArea ?? "",
      name,
      role: cellText(valueAt(row, columns.roleCol)),
      baseSalary: toNumber(valueAt(row, columns.baseSalaryCol)),
      days: toNumber(valueAt(row, columns.daysCol)),
      contractTypeRaw: cellText(valueAt(row, columns.contractTypeCol)),
      idCard: cellText(valueAt(row, columns.idCardCol)),
      hireDateRaw: valueAt(row, columns.hireDateCol),
      sectorCode: cellText(valueAt(row, columns.sectorCodeCol)),
      gross: toNumber(valueAt(row, columns.grossCol)),
      deductions: toNumber(valueAt(row, columns.deductionsCol)),
      net: toNumber(valueAt(row, columns.netCol)),
      cost: toNumber(valueAt(row, columns.costCol)),
      paid: columns.paidCol === null ? null : toNumber(valueAt(row, columns.paidCol)),
    });
  }

  const warnings: string[] = [];
  if (noAreaCount > 0) {
    warnings.push(
      noAreaCount === 1
        ? "1 empleado no tiene un área asignada (sin encabezado de área por encima)."
        : `${noAreaCount} empleados no tienen un área asignada (sin encabezado de área por encima).`,
    );
  }
  return { rows, warnings };
}
