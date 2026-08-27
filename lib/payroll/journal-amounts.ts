/**
 * Where each amount of the entry comes from: the seam between the engine and the account catalogue.
 *
 * `journal.ts` declares, per account, the rol columns that make it up (`sourceColumns`). This file
 * declares, per column, WHERE its value is taken from —from the engine's computation or from what was
 * captured of the month— and sums the whole nómina by walking both declarations.
 *
 * **`sourceColumns` is walked instead of writing 25 sums by hand**, and that is this file's design
 * decision. Writing them by hand works, but it creates a second definition of «where this amount
 * comes from» that can drift from the catalogue's annotation; then `sourceColumns` would say one
 * thing while the entry does another, and the accountant —who reviews the annotation against their
 * sheet— would be reviewing something that is not in charge. By walking it, the only way to get it
 * wrong is to get the annotation wrong.
 *
 * **A column with no destination does not compile.** `RolColumn` is derived from the catalogue
 * itself, so `COLUMN_SOURCES` is obliged to cover them all. It matters because the opposite failure
 * mode is invisible: an unmapped column would return `0`, its account would come out with no
 * movement, the hide-zeros switch would hide it, and the entry would go out of balance with no
 * visible cause.
 *
 * Nothing is rounded along the way. Rounding belongs to the engine and to `formatCurrency`; putting
 * another one here would create differences of a cent against the período's four totals, which add up
 * to the same thing.
 */
import { computeEmployeePayroll } from "./engine/compute";
import type { PayrollParameters } from "./engine/parameters";
import type { PayrollEmployeeComputation, PayrollEmployeeInput } from "./engine/types";
import { toEngineInput } from "./employee-input";
import { JOURNAL_ACCOUNTS, type JournalAccountId, type JournalAmounts } from "./journal";
import type { ParsedPayrollEmployeeLine } from "./types";

/**
 * The rol columns some account names, derived from the catalogue — never a separate list, which would
 * fall out of sync as soon as someone added an account.
 */
export type RolColumn = (typeof JOURNAL_ACCOUNTS)[number]["sourceColumns"][number];

/**
 * What each column is worth for ONE employee. The labels are the book's (§1 of the formulas
 * document), and the split between the two sources is not casual: what the engine DERIVES comes from
 * `computation`, and what is TYPED comes from `input`.
 *
 * The second argument is `PayrollEmployeeInput` —the ENGINE's input— and not the
 * `PayrollMonthlyCapture` the database stores, even though they share fields. It is deliberate: that
 * way the map speaks the engine's vocabulary end to end (its input and its output) instead of the
 * shape it is stored in, and that is why the March 2026 golden fixture —which is engine inputs
 * transcribed from the `.xls`— can be passed through here as it is and the entry checked against the
 * accountant's sheet. With the storage shape a record would have to be invented around each input.
 */
const COLUMN_SOURCES: Record<
  RolColumn,
  (computation: PayrollEmployeeComputation, input: PayrollEmployeeInput) => number
> = {
  /** `F` · SUELDO UNIFICADO */
  F: (c) => c.unifiedSalary,
  /** `M` · TOTAL HORAS EXTRAS recognised — never `J+K+L`, which is what was worked before trimming. */
  M: (c) => c.overtimeTotal,
  /** `N` · DECIMO IV MENSUAL */
  N: (c) => c.fourteenthMonthly,
  /** `O` · DECIMO III MENSUAL */
  O: (c) => c.thirteenthMonthly,
  /** `P` · VACACIONES - MENSUAL */
  P: (_c, k) => k.vacationPay,
  /** `Q` · SEGURO PRIVADO — the column that forced adding account 25. */
  Q: (_c, k) => k.privateInsurance,
  /** `R` · VIATICOS/VIVIENDA. It is `Viaticos`' column; `ASIENTOS` read `V` by mistake. */
  R: (_c, k) => k.allowances,
  /** `S` · COMISION FIJA POR VTAS. */
  S: (_c, k) => k.fixedCommission,
  /** `T` · COMISION VARIABLE */
  T: (_c, k) => k.variableCommission,
  /** `U` · FONDO DE RESERVA paid within the month */
  U: (c) => c.reserveFundPaid,
  /** `V` · BONO CUMPLIMIENTO */
  V: (_c, k) => k.bonus,
  /**
   * `EXTRA_AP` and `EXTRA_NA` are not columns of the book but the two aggregates of the bonus rows
   * each employee declares — the engine already receives them reduced, so here they are read off the
   * input.
   *
   * They come from `input.extras` and not from `capture.extras`: `toEngineInput` is the only place
   * that reduction by class happens, and repeating it here would open the door to the two disagreeing.
   */
  EXTRA_AP: (_c, k) => k.extras.contributory,
  EXTRA_NA: (_c, k) => k.extras.nonContributory,
  /** `X` · the employee's APORTE IESS */
  X: (c) => c.iessEmployee,
  /** `Y` · PRESTAMOS QUIROGRAFARIOS E HIPOTECARIOS */
  Y: (_c, k) => k.deductions.iessLoans,
  /** `Z` · LICENCIA SIN SUELDO */
  Z: (_c, k) => k.deductions.unpaidLeave,
  /** `AA` · ANTICIPO SUELDO */
  AA: (_c, k) => k.deductions.salaryAdvance,
  /** `AB` · PRESTAMOS EMPRESARIALES */
  AB: (_c, k) => k.deductions.companyLoans,
  /** `AC` · IMPUESTO RENTA */
  AC: (_c, k) => k.deductions.incomeTax,
  /** `AD` · ALMUERZOS */
  AD: (_c, k) => k.deductions.meals,
  /** `AE` · MULTAS */
  AE: (_c, k) => k.deductions.fines,
  /** `AF` · CONSUMO LOCALES EMPLEADO */
  AF: (_c, k) => k.deductions.inHouseConsumption,
  /** `AG` · CONTRIBUCION SOLIDARIA */
  AG: (_c, k) => k.deductions.solidarityContribution,
  /** `AH` · OTROS */
  AH: (_c, k) => k.deductions.otherDeductions,
  /** `AI` · DESCUENTO TIEMPO PACIAL (sic) */
  AI: (_c, k) => k.deductions.partTimeDeduction,
  /** `AN` · Descuento PERMISO MEDICO */
  AN: (_c, k) => k.deductions.medicalLeaveDeduction,
  /** `AP` · LIQUIDO A RECIBIR */
  AP: (c) => c.netPay,
  /** `AS` · décimo tercero provision */
  AS: (c) => c.thirteenthProvision,
  /** `AT` · décimo cuarto provision */
  AT: (c) => c.fourteenthProvision,
  /** `AU` · APORTE PATRONAL IESS */
  AU: (c) => c.iessEmployer,
  /** `AV` · vacation provision */
  AV: (c) => c.vacationProvision,
  /** `AW` · FONDO DE RESERVA accrued at the IESS */
  AW: (c) => c.reserveFundAccrued,
};

/**
 * The entry's amounts from ENGINE inputs already paired with their computation.
 *
 * It is the core, and it exists separately so the contrast against the real file (`GOLDEN_MARCH_2026`,
 * six inputs transcribed from the `.xls`) can go through the SAME sum as the screen, without
 * fabricating a storage record around each one.
 */
export function journalAmountsForInputs(
  inputs: readonly PayrollEmployeeInput[],
  parameters: PayrollParameters,
): JournalAmounts {
  // Each input is computed ONCE: the engine is the expensive part and several accounts read from the
  // same column.
  const rows = inputs.map((input) => ({
    computation: computeEmployeePayroll(input, parameters),
    input,
  }));

  const amounts = {} as Record<JournalAccountId, number>;
  for (const account of JOURNAL_ACCOUNTS) {
    let total = 0;
    for (const column of account.sourceColumns) {
      const read = COLUMN_SOURCES[column];
      for (const row of rows) {
        total += read(row.computation, row.input);
      }
    }
    amounts[account.id] = total;
  }
  return amounts;
}

/**
 * The amounts of a período's journal entry: each account, the sum of its columns over the WHOLE
 * nómina.
 *
 * It always returns the complete catalogue keys, with an explicit `0` where there was no movement.
 * `buildJournalEntry` tells `0` («that column did not move») from absent («it is not known»), and fed
 * from the período the latter can no longer happen: the nómina is known in full. An EMPTY nómina
 * gives the 25 accounts at zero, which is what it is — there is nothing to post.
 *
 * It takes `ParsedPayrollEmployeeLine` and not `PayrollEmployeeLine` for the same reason as
 * `computeLinePayroll`: the entry does not depend on anybody's `id` or `periodId`, and asking for the
 * ownerless shape lets an upload PREVIEW post itself before existing in the database.
 */
export function journalAmountsFor(
  lines: readonly ParsedPayrollEmployeeLine[],
  parameters: PayrollParameters,
): JournalAmounts {
  // `toEngineInput` is the only translation from record + capture into an engine input, and it is
  // reused instead of reading `line.capture` here: a second read could disagree with its own.
  return journalAmountsForInputs(
    lines.map((line) => toEngineInput(line)),
    parameters,
  );
}
