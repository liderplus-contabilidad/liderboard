/**
 * Reading the rol de pagos' `GENERAL` sheet: WHERE each element sits. Everything is located by
 * the labels the report itself writes, never by a fixed row or column — the sheet's own row 1 is
 * a hand-typed VLOOKUP index list that is DESYNCED (column `AR` is blank across every row and was
 * skipped when the list was typed, so every index from `AS` on names the wrong column), which is
 * exactly the failure mode a coordinate-based reader would inherit silently. The same rule
 * `microplus-grid.ts`/`dingoo-grid.ts` follow.
 *
 * The labels live in TWO rows (row 2 labels `M`–`BH`, row 3 labels `A`–`L`), so — unlike those
 * two modules, whose header lives on one row — this module doesn't return a single "header row";
 * `findLabel` scans the whole sheet for each label independently and takes the FIRST match,
 * top-to-bottom then left-to-right. Several labels are repeated further down (`LIQUIDO A RECIBIR` in
 * `BH` after `AP`, `PAGADO` in `CC` after `BZ`, `COSTO TOTAL` inside the journal entry block after
 * `AY`, and that same block REPEATS as descriptions `PRESTAMOS EMPRESARIALES`, `ALMUERZOS` and
 * `CONTRIBUCION SOLIDARIA`, which are three deduction labels): the report always writes its real
 * header first, so "first match" tells them apart without a coordinate, the same trick
 * `findMicroplusHeader`'s first-match assignment uses.
 *
 * The other trap is the other way round and belongs to row 2: over the overtime columns there are two
 * GROUPING labels (`" No. HORAS EXTRAS"` over `G`–`I`, `"VALOR DE HORAS EXTRAS"` over `J`–`L`) that
 * sit ABOVE the real labels of row 3. The first one starts the same as the `"No. "` that names the
 * ordinal, so the comparison has to be by the WHOLE label —never by prefix—, which is exactly what
 * `findLabel` does.
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

export interface PeriodRef {
  year: number;
  monthIndex: number;
}

export function parsePeriodText(cell: Cell): PeriodRef | null {
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

/**
 * THE PERIOD, BY ITS SHAPE AND NOT BY ITS CELL — the last coordinate left in this file.
 *
 * It was read at a fixed `B2`, which was the only exception to the rule this module's header
 * declares: everything is located by what the report writes. The exception stopped holding when the
 * app started GENERATING this same format: its letterhead opens a few rows above the preamble and
 * `B2` stops being `B2`, so the downloaded file could not have come back in.
 *
 * The rows above the `EMPLEADO` header are swept —where the preamble lives and nothing else— and the
 * first cell whose WHOLE text is «month year» is taken. The files the firm already has read the same:
 * their `B2` is the first one that matches. And nothing else in that preamble can match by accident,
 * because `parsePeriodText` requires the month to be in `MONTHS_FULL_ES` and the cell to carry
 * nothing else.
 */
export function findPeriod(grid: readonly Cell[][], headerRow: number | null): PeriodRef | null {
  const end = headerRow ?? grid.length;
  for (let row = 0; row < end; row++) {
    for (const cell of grid[row] ?? []) {
      const period = parsePeriodText(cell);
      if (period) {
        return period;
      }
    }
  }
  return null;
}

/** The column where the book writes the company and, under it, the letterhead: `B`, the same one as
 *  the area and employee names. */
const COMPANY_COLUMN = 1;

/**
 * THE COMPANY, BY ITS PLACE IN THE PREAMBLE AND NOT BY ITS CELL — `findPeriod`'s sibling, and for the
 * same reason.
 *
 * It was read at a fixed `B1`, and that stopped being true as soon as the app started generating this
 * format: its logo band opens a few rows above the preamble, so `B1` is a blank row of that band and
 * the downloaded file came back in WITH NO company. With the complete letterhead the preamble grows
 * further still.
 *
 * Column `B` is swept above the `EMPLEADO` header and the FIRST cell with text that is not the period
 * is taken. It is the client's name, because the letterhead goes below it. The cell is required to be
 * TEXT —not a converted number— because the real file brings a list of lookup indices on its first
 * row, and a `5` is nobody's razón social.
 */
export function findCompany(grid: readonly Cell[][], headerRow: number | null): string {
  const end = headerRow ?? grid.length;
  for (let row = 0; row < end; row++) {
    const cell = grid[row]?.[COMPANY_COLUMN];
    if (typeof cell !== "string") {
      continue;
    }
    const text = cell.trim();
    if (text.length === 0 || parsePeriodText(text)) {
      continue;
    }
    return text;
  }
  return "";
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
 * record — it exists purely so an area row (name only) can be told apart from an employee row
 * (ordinal AND name).
 *
 * Which engine FIELD each column carries is declared just once in `lib/payroll/concepts.ts` and is
 * not repeated here: what this file adds is the only thing that one cannot have, the LABEL the book
 * writes that column with — «Anticipo de sueldo» on screen is `ANTICIPO SUELDO` on the sheet, and the
 * parser locates by the latter. */
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
  | "hasReserveFundCol"
  | "accumulatesReserveFundCol"
  | "overtimeHours50Col"
  | "overtimeHours100Col"
  | "overtimeHours25Col"
  | "overtimePay50Col"
  | "overtimePay100Col"
  | "overtimePay25Col"
  | "overtimeTotalCol"
  | "vacationPayCol"
  | "privateInsuranceCol"
  | "allowancesCol"
  | "fixedCommissionCol"
  | "variableCommissionCol"
  | "bonusCol"
  | "iessLoansCol"
  | "unpaidLeaveCol"
  | "salaryAdvanceCol"
  | "companyLoansCol"
  | "incomeTaxCol"
  | "mealsCol"
  | "finesCol"
  | "inHouseConsumptionCol"
  | "solidarityContributionCol"
  | "otherDeductionsCol"
  | "partTimeDeductionCol"
  | "medicalLeaveDeductionCol"
  | "thirteenthProvisionCol"
  | "fourteenthProvisionCol"
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

/** The order is the book's (`A` → `CA`), which is the same as the `INDIVIDUAL` payslip's and
 * `concepts.ts`': that way the grouped notice about missing columns names them in the order whoever
 * opens the Excel is going to look for them. Each entry's comment is its LETTER on the sheet. */
const LABEL_SPECS: readonly LabelSpec[] = [
  { key: "ordinalCol", label: "no.", display: "No." }, // A
  { key: "employeeCol", label: "empleado", display: "EMPLEADO" }, // B
  { key: "roleCol", label: "cargo", display: "CARGO" }, // C
  { key: "baseSalaryCol", label: "sueldo base", display: "SUELDO BASE" }, // D
  { key: "daysCol", label: "dias", display: "DIAS" }, // E
  // G, H, I — the hour QUANTITIES. The book labels the third class «15 %» here and «25 %» on its
  // value (`L`): it is copied as it is, because what is looked for is the sheet's text, not the one
  // it should say. It is open question §11.2, and fixing it here would break the location.
  { key: "overtimeHours50Col", label: "horas extras 50%", display: "HORAS EXTRAS 50%" },
  { key: "overtimeHours100Col", label: "horas extras 100%", display: "HORAS EXTRAS 100%" },
  { key: "overtimeHours25Col", label: "horas extras 15%", display: "HORAS EXTRAS 15%" },
  // J, K, L — their VALUE. They are not capture fields (the engine derives them), but they are read
  // because they are the term `M` is compared against to recover the approved amount (§6), and
  // recomputing them here would not serve: in the real file one row uses 0.15 where the others use
  // 0.25, so a derived `J+K+L` would not match the `M` the book stored.
  { key: "overtimePay50Col", label: "valor ganado extras 50%", display: "VALOR GANADO EXTRAS 50%" },
  {
    key: "overtimePay100Col",
    label: "valor ganado extras 100%",
    display: "VALOR GANADO EXTRAS 100%",
  },
  { key: "overtimePay25Col", label: "valor ganado extras 25%", display: "VALOR GANADO EXTRAS 25%" },
  { key: "overtimeTotalCol", label: "total horas extras", display: "TOTAL HORAS EXTRAS" }, // M
  { key: "vacationPayCol", label: "vacaciones - mensual", display: "VACACIONES - MENSUAL" }, // P
  { key: "privateInsuranceCol", label: "seguro privado", display: "SEGURO PRIVADO" }, // Q
  { key: "allowancesCol", label: "viaticos/vivienda", display: "VIATICOS/VIVIENDA" }, // R
  {
    key: "fixedCommissionCol",
    label: "comision fija por vtas.",
    display: "COMISION FIJA POR VTAS.",
  }, // S
  { key: "variableCommissionCol", label: "comision variable", display: "COMISION VARIABLE" }, // T
  { key: "bonusCol", label: "bono cumplimiento", display: "BONO CUMPLIMIENTO" }, // V
  {
    key: "iessLoansCol", // Y
    label: "prestamos quirografarios e hipotecarios",
    display: "PRESTAMOS QUIROGRAFARIOS E HIPOTECARIOS",
  },
  { key: "unpaidLeaveCol", label: "licencia sin sueldo", display: "LICENCIA SIN SUELDO" }, // Z
  { key: "salaryAdvanceCol", label: "anticipo sueldo", display: "ANTICIPO SUELDO" }, // AA
  { key: "companyLoansCol", label: "prestamos empresariales", display: "PRESTAMOS EMPRESARIALES" }, // AB
  { key: "incomeTaxCol", label: "impuesto renta", display: "IMPUESTO RENTA" }, // AC
  { key: "mealsCol", label: "almuerzos", display: "ALMUERZOS" }, // AD
  { key: "finesCol", label: "multas", display: "MULTAS" }, // AE
  {
    key: "inHouseConsumptionCol", // AF
    label: "consumo locales empleado",
    display: "CONSUMO LOCALES EMPLEADO",
  },
  {
    key: "solidarityContributionCol", // AG — the book splits it into two lines; `compactLabel` joins it
    label: "contribucion solidaria",
    display: "CONTRIBUCION SOLIDARIA",
  },
  { key: "otherDeductionsCol", label: "otros", display: "OTROS" }, // AH — with a spare space
  // AI — «PACIAL» is the book's typo, and it is looked for with it: correcting it here would stop
  // finding the column in every file the firm already has.
  {
    key: "partTimeDeductionCol",
    label: "descuento tiempo pacial",
    display: "DESCUENTO TIEMPO PACIAL",
  },
  {
    key: "medicalLeaveDeductionCol", // AN
    label: "descuento permiso medico",
    display: "Descuento PERMISO MEDICO",
  },
  { key: "thirteenthProvisionCol", label: "xiii", display: "XIII" }, // AS
  { key: "fourteenthProvisionCol", label: "xiv", display: "XIV" }, // AT
  { key: "accumulatesReserveFundCol", label: "ac fr", display: "AC FR" }, // AZ
  { key: "hasReserveFundCol", label: "fr", display: "FR" }, // BA
  { key: "contractTypeCol", label: "tc", display: "TC" }, // BB
  { key: "hireDateCol", label: "fecha ingreso", display: "FECHA INGRESO" }, // BC
  { key: "idCardCol", label: "cedula", display: "CÉDULA" }, // BD
  { key: "sectorCodeCol", label: "codigo sectorial", display: "CODIGO SECTORIAL" }, // BF
  { key: "paidCol", label: "pagado", display: "PAGADO" }, // BZ
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
 * domain decisions (what counts as valid, what "unparseable" means) that `rol-general.ts` owns.
 *
 * Everything ending in `Raw` follows that same boundary: `hasReserveFundRaw`/
 * `accumulatesReserveFundRaw` bring the cell's text without deciding what counts as a «yes», and
 * `thirteenthProvisionRaw`/`fourteenthProvisionRaw` bring `AS`/`AT`'s amount without deciding what
 * counts as «switched on». Here only what is there is read. */
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
  hasReserveFundRaw: string;
  accumulatesReserveFundRaw: string;
  /** `G`, `H`, `I` — cantidades de horas. */
  overtimeHours50: number;
  overtimeHours100: number;
  overtimeHours25: number;
  /** `J`, `K`, `L` — their value, JUST AS THE BOOK brings it. They do not travel to the capture (the
   * engine derives them): they exist so `rol-general.ts` can compare `M` against `J+K+L` and recover
   * how much was recognised. */
  overtimePay50: number;
  overtimePay100: number;
  overtimePay25: number;
  /** `M` — the recognised total. `null` only when the book does not declare the column, the same
   * convention as `paid`: without it, it cannot be claimed that no hour was recognised. */
  overtimeTotal: number | null;
  /** `P`…`T`, `V` — the captured income items. */
  vacationPay: number;
  privateInsurance: number;
  allowances: number;
  fixedCommission: number;
  variableCommission: number;
  bonus: number;
  /** `Y`…`AN` — the twelve labelled deductions. `X` (IESS contribution) is not there: the engine
   * derives it, and neither are `AJ`–`AM`, because with no label there is no way to locate them
   * (§11.4). */
  iessLoans: number;
  unpaidLeave: number;
  salaryAdvance: number;
  companyLoans: number;
  incomeTax: number;
  meals: number;
  fines: number;
  inHouseConsumption: number;
  solidarityContribution: number;
  otherDeductions: number;
  partTimeDeduction: number;
  medicalLeaveDeduction: number;
  /** `AS`, `AT` — the provisioned amount, from which whether the month provisions the décimos is
   *  deduced. */
  thirteenthProvisionRaw: number;
  fourteenthProvisionRaw: number;
  /**
   * `null` when nobody declared what was paid: neither does the book bring the column, nor does this
   * employee's cell hold anything. It is the ONLY column that tells blank from zero, and not out of
   * symmetry with the rest but because here the two things mean different: with no `PAGADO` the
   * employee is neither reconciled nor in difference, whereas a written `0` claims zero was
   * transferred to them and leaves a difference equal to their net pay.
   *
   * It read blank as `0`, with the convention of the other forty columns. It was changed when this
   * format started being generated: the downloaded rol writes blank for whoever has no declared
   * payment, and with the old rule it came back as «with a difference» by their whole net pay — the
   * app's file could not have described its own state. It is also right about the accountant's book,
   * where a row with no `PAGADO` is one that has not been paid yet.
   */
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
    // A column the book does not declare is worth `0` like any empty cell: there are forty-odd of
    // them and writing `?? null` on each would turn «this concept was not used» into a separate case
    // no consumer would know how to handle. The two exceptions —`PAGADO` and `M`— have their own
    // reason written into the type: for those two, absence does say something different from zero.
    const num = (key: ColumnKey): number => toNumber(valueAt(row, columns[key]));
    const text = (key: ColumnKey): string => cellText(valueAt(row, columns[key]));
    /** Like `num`, but telling the BLANK cell from a written zero. Only `PAGADO` uses it, and that is
     *  why it is down here: for the other forty-odd columns empty IS zero. */
    const numOrNull = (key: ColumnKey): number | null => {
      const cell = valueAt(row, columns[key]);
      return isFilled(cell) ? toNumber(cell) : null;
    };
    rows.push({
      area: currentArea ?? "",
      name,
      role: text("roleCol"),
      baseSalary: num("baseSalaryCol"),
      days: num("daysCol"),
      contractTypeRaw: text("contractTypeCol"),
      idCard: text("idCardCol"),
      hireDateRaw: valueAt(row, columns.hireDateCol),
      sectorCode: text("sectorCodeCol"),
      hasReserveFundRaw: text("hasReserveFundCol"),
      accumulatesReserveFundRaw: text("accumulatesReserveFundCol"),
      overtimeHours50: num("overtimeHours50Col"),
      overtimeHours100: num("overtimeHours100Col"),
      overtimeHours25: num("overtimeHours25Col"),
      overtimePay50: num("overtimePay50Col"),
      overtimePay100: num("overtimePay100Col"),
      overtimePay25: num("overtimePay25Col"),
      overtimeTotal: columns.overtimeTotalCol === null ? null : num("overtimeTotalCol"),
      vacationPay: num("vacationPayCol"),
      privateInsurance: num("privateInsuranceCol"),
      allowances: num("allowancesCol"),
      fixedCommission: num("fixedCommissionCol"),
      variableCommission: num("variableCommissionCol"),
      bonus: num("bonusCol"),
      iessLoans: num("iessLoansCol"),
      unpaidLeave: num("unpaidLeaveCol"),
      salaryAdvance: num("salaryAdvanceCol"),
      companyLoans: num("companyLoansCol"),
      incomeTax: num("incomeTaxCol"),
      meals: num("mealsCol"),
      fines: num("finesCol"),
      inHouseConsumption: num("inHouseConsumptionCol"),
      solidarityContribution: num("solidarityContributionCol"),
      otherDeductions: num("otherDeductionsCol"),
      partTimeDeduction: num("partTimeDeductionCol"),
      medicalLeaveDeduction: num("medicalLeaveDeductionCol"),
      thirteenthProvisionRaw: num("thirteenthProvisionCol"),
      fourteenthProvisionRaw: num("fourteenthProvisionCol"),
      paid: numOrNull("paidCol"),
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
