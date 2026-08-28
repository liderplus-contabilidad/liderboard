/**
 * THE `GENERAL` SHEET'S LAYOUT — declared just once, and an exact mirror of the reader.
 *
 * `upload/rol-general-grid.ts` says WHERE each column IS in the accountant's file; this file says
 * WHERE IT IS WRITTEN and WHERE its value COMES FROM. They are the two halves of the same boundary,
 * and this download's real risk is not getting a figure wrong —the engine is already tested against
 * the book— but the two halves DRIFTING APART: adding a column to the parser and not here (or the
 * other way round) is given away by no sum, because the sums keep squaring without it. That is why
 * `columns.test.ts` crosses them: every label `LABEL_SPECS` looks for exists here with the SAME
 * letter.
 *
 * **The letter is the contract.** The accountant checks screen against sheet column by column, so a
 * column whose datum the app does not store —`AJ`–`AM`, `AQ`, `BE`— is declared all the same and
 * comes out empty, instead of being omitted: omitting it would shift everything to its right and its
 * `AY` would stop being `AY`.
 *
 * **The labels go in TWO rows**, as in the book: the first labels `M`–`CA` (and also carries the two
 * groupers over the overtime), the second labels `A`–`L`. It is not a flourish: the reader locates
 * each label by its WHOLE text, and the grouper `" No. HORAS EXTRAS"` starts the same as the `"No. "`
 * that names the ordinal — reproducing the two rows is what keeps that file reading the way it reads
 * today.
 *
 * The sheet ends at `CA`. The book carries on with a `CC`–`CF` block that REPEATS `PAGADO` and
 * `DIFERENCIA X PAGAR`: it is the accountant's work area —the parser itself dodges it with its
 * «first match» rule—, and copying it would write the same figure twice without the second one
 * meaning anything. The row of lookup indices the original carries above it is not reproduced either:
 * there it is OUT OF SYNC (`AR` is missing, so every index from `AS` on names the column next to it),
 * and copying a broken index is worse than not copying it.
 */
import type { PayrollEmployeeComputation } from "../engine/types";
import type { ParsedPayrollEmployeeLine, PayrollMonthlyCapture } from "../types";

/** What a cell of this sheet can carry. `Date` only for the hire date; `null` is the blank cell,
 *  which is NOT the same as a zero (see `PAGADO`). */
export type RolExportCell = string | number | Date | null;

/**
 * How the cell is formatted. `money` and `hours` are kept apart even though they share a mask today
 * because they are not the same magnitude: 5.5 are hours and 487.21 are dollars, and the day the
 * money format changes (a symbol, a colour for the negative) the hours must not go with it.
 */
export type RolCellFormat = "text" | "money" | "hours" | "integer" | "date";

/** Everything a row of an employee needs in order to be filled. The `computed` comes from
 *  `computeLinePayroll`, which is the app's only composition record + capture → engine. */
export interface RolRowContext {
  line: ParsedPayrollEmployeeLine;
  capture: PayrollMonthlyCapture;
  computed: PayrollEmployeeComputation;
  /** The sum of the extra concepts the período declares, for this employee. */
  extras: number;
  /** Their order number on the sheet, running across all the areas. */
  ordinal: number;
}

export interface RolExportColumn {
  /** Its letter on the sheet. It IS the contract with the accountant's book. */
  letter: string;
  /** Which of the two label rows theirs goes in, or `null` when the book gives it none (`AJ`–`AM`,
   *  the four deduction columns its `SUM(X:AN)` includes and nobody named). */
  labelRow: 1 | 2 | null;
  /** Verbatim from the book, typos included (`DESCUENTO TIEMPO PACIAL`, the trailing space of
   *  `OTROS `): they are the labels the reader looks for and the ones the accountant checks
   *  against. */
  label: string | null;
  format: RolCellFormat;
  /** Whether the `SUBTOTAL` and `SUMAN` rows total it. The identity ones do not, and neither does
   *  `DIAS` —the book does not sum it, and summing the days of different people means nothing. */
  totalled: boolean;
  /** The column's width, in Excel characters. */
  width: number;
  /** This column's value for one employee. `null` = a blank cell. */
  read: (ctx: RolRowContext) => RolExportCell;
}

/** What `FR`/`AC FR` write. The reader only switches the flag on with an `S`. */
const yesNo = (value: boolean): string => (value ? "S" : "N");

/**
 * The hire date as a LOCAL MIDNIGHT `Date`, not UTC.
 *
 * It is not indifferent: exceljs converts a `Date` into a serial by subtracting the local time-zone
 * offset, so a UTC midnight in Ecuador (UTC−5) lands at 19:00 on the PREVIOUS day and the serial
 * drops a whole day. With local midnight the subtraction falls exactly on the right serial, and
 * `excelSerialToISODate` —which reads in UTC— returns the same date that went in. The round-trip test
 * proves it, which is the only place this can be seen.
 */
function hireDateCell(iso: string | null): RolExportCell {
  if (!iso) {
    return null;
  }
  const [year, month, day] = iso.split("-").map(Number);
  if (!year || !month || !day) {
    return null;
  }
  return new Date(year, month - 1, day);
}

/** Shortcut for the columns that come out of the engine. */
const computed =
  (field: keyof PayrollEmployeeComputation) =>
  (ctx: RolRowContext): RolExportCell =>
    ctx.computed[field];

/** Shortcut for the captured deductions, which live in the nested `deductions` object. */
const deduction =
  (field: keyof PayrollMonthlyCapture["deductions"]) =>
  (ctx: RolRowContext): RolExportCell =>
    ctx.capture.deductions[field];

/** A column of the book whose datum the app does not store: it keeps its letter and its label, and
 *  goes out empty. */
function empty(
  letter: string,
  label: string | null,
  width = 12,
  labelRow: 1 | 2 | null = label === null ? null : 1,
): RolExportColumn {
  return { letter, labelRow, label, format: "text", totalled: false, width, read: () => null };
}

const MONEY = { format: "money" as const, totalled: true, width: 12 };
const HOURS = { format: "hours" as const, totalled: true, width: 10 };

/**
 * The sheet's columns, from `A` to `CA`, in the book's order.
 *
 * `labelRow: 2` are the ones the book labels in its bottom row (`A`–`L`); `labelRow: 1`, the top ones
 * (`M`–`CA`). The two overtime groupers are not columns and live apart, in `OVERTIME_GROUP_LABELS`.
 */
export const ROL_EXPORT_COLUMNS: readonly RolExportColumn[] = [
  {
    letter: "A",
    labelRow: 2,
    label: "No. ",
    format: "integer",
    totalled: false,
    width: 6,
    read: (ctx) => ctx.ordinal,
  },
  {
    letter: "B",
    labelRow: 2,
    label: "EMPLEADO",
    format: "text",
    totalled: false,
    width: 32,
    read: (ctx) => ctx.line.name,
  },
  {
    letter: "C",
    labelRow: 2,
    label: "CARGO",
    format: "text",
    totalled: false,
    width: 30,
    read: (ctx) => ctx.line.role,
  },
  {
    letter: "D",
    labelRow: 2,
    label: "SUELDO BASE",
    ...MONEY,
    read: (ctx) => ctx.line.baseSalary,
  },
  {
    letter: "E",
    labelRow: 2,
    label: "DIAS",
    format: "integer",
    // The book does not sum it, and rightly so: the days of six people are not a number of days.
    totalled: false,
    width: 7,
    read: (ctx) => ctx.line.days,
  },
  {
    letter: "F",
    labelRow: 2,
    label: "SUELDO UNIFICADO",
    ...MONEY,
    read: computed("unifiedSalary"),
  },
  {
    letter: "G",
    labelRow: 2,
    label: "HORAS EXTRAS 50%",
    ...HOURS,
    read: (ctx) => ctx.capture.overtimeHours50,
  },
  {
    letter: "H",
    labelRow: 2,
    label: "HORAS EXTRAS 100%",
    ...HOURS,
    read: (ctx) => ctx.capture.overtimeHours100,
  },
  {
    // «15 %», sic: that is how the book labels the QUANTITY and «25 %» its value (`L`). It is written
    // as it is written, because it is the text the reader looks for.
    letter: "I",
    labelRow: 2,
    label: "HORAS EXTRAS 15%",
    ...HOURS,
    read: (ctx) => ctx.capture.overtimeHours25,
  },
  {
    letter: "J",
    labelRow: 2,
    label: "VALOR GANADO EXTRAS 50%",
    ...MONEY,
    read: computed("overtimePay50"),
  },
  {
    letter: "K",
    labelRow: 2,
    label: "VALOR GANADO EXTRAS 100%",
    ...MONEY,
    read: computed("overtimePay100"),
  },
  {
    letter: "L",
    labelRow: 2,
    label: "VALOR GANADO EXTRAS 25%",
    ...MONEY,
    read: computed("overtimePay25"),
  },
  {
    // `M` is the RECOGNISED amount, not the sum of `J+K+L`: it is from its difference with them that
    // the reader deduces the trim Gerencia applied, so writing the sum would erase that datum.
    letter: "M",
    labelRow: 1,
    label: "TOTAL HORAS EXTRAS",
    ...MONEY,
    read: computed("overtimeTotal"),
  },
  {
    letter: "N",
    labelRow: 1,
    label: "DECIMO IV MENSUAL",
    ...MONEY,
    read: computed("fourteenthMonthly"),
  },
  {
    letter: "O",
    labelRow: 1,
    label: "DECIMO III MENSUAL",
    ...MONEY,
    read: computed("thirteenthMonthly"),
  },
  {
    letter: "P",
    labelRow: 1,
    label: "VACACIONES - MENSUAL",
    ...MONEY,
    read: (ctx) => ctx.capture.vacationPay,
  },
  {
    letter: "Q",
    labelRow: 1,
    label: "SEGURO PRIVADO",
    ...MONEY,
    read: (ctx) => ctx.capture.privateInsurance,
  },
  {
    letter: "R",
    labelRow: 1,
    label: "VIATICOS/VIVIENDA",
    ...MONEY,
    read: (ctx) => ctx.capture.allowances,
  },
  {
    letter: "S",
    labelRow: 1,
    label: "COMISION FIJA POR VTAS.",
    ...MONEY,
    read: (ctx) => ctx.capture.fixedCommission,
  },
  {
    letter: "T",
    labelRow: 1,
    label: "COMISION VARIABLE",
    ...MONEY,
    read: (ctx) => ctx.capture.variableCommission,
  },
  {
    letter: "U",
    labelRow: 1,
    label: "FONDO DE RESERVA",
    ...MONEY,
    read: computed("reserveFundPaid"),
  },
  {
    letter: "V",
    labelRow: 1,
    label: "BONO CUMPLIMIENTO",
    ...MONEY,
    read: (ctx) => ctx.capture.bonus,
  },
  {
    letter: "W",
    labelRow: 1,
    label: "TOTAL INGRESO",
    ...MONEY,
    read: computed("grossIncome"),
  },
  {
    letter: "X",
    labelRow: 1,
    label: "APORTES AL IESS",
    ...MONEY,
    read: computed("iessEmployee"),
  },
  {
    letter: "Y",
    labelRow: 1,
    label: "PRESTAMOS QUIROGRAFARIOS E HIPOTECARIOS",
    ...MONEY,
    read: deduction("iessLoans"),
  },
  {
    letter: "Z",
    labelRow: 1,
    label: "LICENCIA SIN SUELDO",
    ...MONEY,
    read: deduction("unpaidLeave"),
  },
  {
    letter: "AA",
    labelRow: 1,
    label: "ANTICIPO SUELDO",
    ...MONEY,
    read: deduction("salaryAdvance"),
  },
  {
    letter: "AB",
    labelRow: 1,
    label: "PRESTAMOS EMPRESARIALES",
    ...MONEY,
    read: deduction("companyLoans"),
  },
  {
    letter: "AC",
    labelRow: 1,
    label: "IMPUESTO RENTA",
    ...MONEY,
    read: deduction("incomeTax"),
  },
  { letter: "AD", labelRow: 1, label: "ALMUERZOS", ...MONEY, read: deduction("meals") },
  { letter: "AE", labelRow: 1, label: "MULTAS", ...MONEY, read: deduction("fines") },
  {
    letter: "AF",
    labelRow: 1,
    label: "CONSUMO LOCALES EMPLEADO",
    ...MONEY,
    read: deduction("inHouseConsumption"),
  },
  {
    // The book splits this label into two lines inside the cell; it is written on a single one, which
    // is how `compactLabel` reads it anyway.
    letter: "AG",
    labelRow: 1,
    label: "CONTRIBUCION SOLIDARIA",
    ...MONEY,
    read: deduction("solidarityContribution"),
  },
  {
    // The trailing space belongs to the book and is kept: the reader normalizes, but whoever compares
    // the two files cell by cell would see a difference that does not exist.
    letter: "AH",
    labelRow: 1,
    label: "OTROS ",
    ...MONEY,
    read: deduction("otherDeductions"),
  },
  {
    // «PACIAL», sic.
    letter: "AI",
    labelRow: 1,
    label: "DESCUENTO TIEMPO PACIAL",
    ...MONEY,
    read: deduction("partTimeDeduction"),
  },
  // `AJ`–`AM`: four deduction columns the book's `SUM(X:AN)` includes and that nobody labelled. With
  // no name there is no concept to capture, so they are reserved empty to keep the letters.
  empty("AJ", null, 6),
  empty("AK", null, 6),
  empty("AL", null, 6),
  empty("AM", null, 6),
  {
    letter: "AN",
    labelRow: 1,
    label: "Descuento PERMISO MEDICO",
    ...MONEY,
    read: deduction("medicalLeaveDeduction"),
  },
  {
    letter: "AO",
    labelRow: 1,
    label: "TOTAL EGRESOS",
    ...MONEY,
    read: computed("totalDeductions"),
  },
  {
    letter: "AP",
    labelRow: 1,
    label: "LIQUIDO A RECIBIR",
    ...MONEY,
    read: computed("netPay"),
  },
  empty("AQ", "CTAS. POR COBRAR", 14),
  // `AR` is blank in the original —it is the gap that puts its row of indices out of sync— and it is
  // kept so `AS` stays `AS`.
  empty("AR", null, 4),
  { letter: "AS", labelRow: 1, label: "XIII", ...MONEY, read: computed("thirteenthProvision") },
  { letter: "AT", labelRow: 1, label: "XIV", ...MONEY, read: computed("fourteenthProvision") },
  { letter: "AU", labelRow: 1, label: "PATRONAL", ...MONEY, read: computed("iessEmployer") },
  { letter: "AV", labelRow: 1, label: "VACACION", ...MONEY, read: computed("vacationProvision") },
  {
    letter: "AW",
    labelRow: 1,
    label: "ACUMULA FONDO RESERVA",
    ...MONEY,
    read: computed("reserveFundAccrued"),
  },
  { letter: "AX", labelRow: 1, label: "PROVISION", ...MONEY, read: computed("totalProvision") },
  { letter: "AY", labelRow: 1, label: "COSTO TOTAL", ...MONEY, read: computed("employerCost") },
  {
    letter: "AZ",
    labelRow: 1,
    label: "AC FR",
    format: "text",
    totalled: false,
    width: 7,
    read: (ctx) => yesNo(ctx.line.accumulatesReserveFund),
  },
  {
    letter: "BA",
    labelRow: 1,
    label: "FR",
    format: "text",
    totalled: false,
    width: 6,
    read: (ctx) => yesNo(ctx.line.hasReserveFund),
  },
  {
    letter: "BB",
    labelRow: 1,
    label: "TC",
    format: "text",
    totalled: false,
    width: 6,
    read: (ctx) => ctx.line.contractType,
  },
  {
    letter: "BC",
    labelRow: 1,
    label: "FECHA INGRESO",
    format: "date",
    totalled: false,
    width: 14,
    read: (ctx) => hireDateCell(ctx.line.hireDate),
  },
  {
    // As TEXT, like the sector code: a cédula starting with a zero stops being that cédula the moment
    // Excel treats it as a number.
    letter: "BD",
    labelRow: 1,
    label: "CÉDULA",
    format: "text",
    totalled: false,
    width: 14,
    read: (ctx) => ctx.line.idCard,
  },
  empty("BE", "NÚMERO DE CUENTA", 18),
  {
    letter: "BF",
    labelRow: 1,
    label: "CODIGO SECTORIAL",
    format: "text",
    totalled: false,
    width: 18,
    read: (ctx) => ctx.line.sectorCode,
  },
  {
    // The block the accountant takes to the bank: name and net pay. It IS filled in, because the app
    // has both figures — the rule of leaving blank is for what we do not have, not for what is
    // repeated.
    letter: "BG",
    labelRow: 1,
    label: "NÓMINA",
    format: "text",
    totalled: false,
    width: 32,
    read: (ctx) => ctx.line.name,
  },
  {
    // The sheet's second `LIQUIDO A RECIBIR`. The reader keeps the first (`AP`) by its «first match»
    // rule, which is exactly what keeps this repeat out of the way.
    letter: "BH",
    labelRow: 1,
    label: "LIQUIDO A RECIBIR",
    ...MONEY,
    read: computed("netPay"),
  },
  {
    // `null` when nobody declared what was paid, and that is NOT zero: without it the employee is
    // neither reconciled nor in difference. That is why the reader had to learn to read the empty
    // cell.
    letter: "BZ",
    labelRow: 1,
    label: "PAGADO",
    ...MONEY,
    read: (ctx) => ctx.capture.paid,
  },
  {
    letter: "CA",
    labelRow: 1,
    label: "DIFERENCIA X PAGAR",
    ...MONEY,
    read: computed("difference"),
  },
];

/**
 * The column this app ADDS to the book: the sum of the income concepts the período declares on its
 * own and that Cultura Manor's book does not have.
 *
 * It goes at the end and not in its conceptual place (after `V BONO CUMPLIMIENTO`) because inserting
 * it there would shift `W`, `X`, `AO`, `AP`… one letter per concept, and matching letters is what
 * makes the file checkable. Aggregated and not one column per concept for the same reason: the
 * sheet's width would stop being fixed. Without it, `W TOTAL INGRESO` would bring dollars no column
 * explains.
 */
export const EXTRA_INCOME_COLUMN: RolExportColumn = {
  letter: "CB",
  labelRow: 1,
  label: "OTROS INGRESOS",
  ...MONEY,
  width: 14,
  read: (ctx) => ctx.extras,
};

/**
 * The two GROUPING labels the book puts over the overtime, in its top row. They are not columns —they
 * carry no value— but they are reproduced because they are part of the header the accountant
 * recognises, and because the first is the trap that forces the reader to compare by the WHOLE label.
 */
export const OVERTIME_GROUP_LABELS: readonly { letter: string; label: string }[] = [
  { letter: "G", label: " No. HORAS EXTRAS" },
  { letter: "J", label: "VALOR DE HORAS EXTRAS" },
];

/** `"A"` → 0, `"AA"` → 26. Excel's column arithmetic, in one single place. */
export function columnIndexOf(letter: string): number {
  let index = 0;
  for (const char of letter.toUpperCase()) {
    index = index * 26 + (char.charCodeAt(0) - 64);
  }
  return index - 1;
}

/** How many columns the sheet occupies, gaps included. */
export function sheetWidth(columns: readonly RolExportColumn[]): number {
  return columns.reduce((max, column) => Math.max(max, columnIndexOf(column.letter) + 1), 0);
}
