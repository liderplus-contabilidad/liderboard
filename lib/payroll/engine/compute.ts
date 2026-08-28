/**
 * The rol de pagos computation engine: the 20 columns derived from the `GENERAL` sheet, in the
 * dependency order of §5 of `docs/payroll/rol-de-pagos-formulas.md`.
 *
 * It is the reimplementation of the accountant's book formulas, verified against the real March 2026
 * file: it reproduces the 20 columns of the 6 employees **exact to the bit**, floating-point noise
 * included (`golden.test.ts`).
 *
 * Two rules govern everything below and they are not cosmetic:
 *
 * - **The derivations round to two decimals; the totals do NOT** (§9). `W`, `AO`, `AP`, `AX` and
 *   `AY` carry the noise on purpose, because it is what the file stores and what gets compared
 *   against the hand-typed `PAGADO`.
 * - **The totals add in the book's COLUMN ORDER.** With no rounding in between, floating-point
 *   addition is not associative, so reordering addends «so it reads better» can shift the result in
 *   the last bit.
 *
 * Nothing here decides what an employee is or where the numbers come from: that belongs to `upload/`
 * and to `db.ts`. This module is a pure function of `(input, parameters) → figures`.
 */
import { sameToTheCentavo } from "../amounts";
import {
  contributoryBase,
  grossIncome,
  reserveFundAccrualBase,
  thirteenthBase,
  thirteenthProvisionBase,
  vacationBase,
} from "./bases";
import type { PayrollParameters } from "./parameters";
import { roundToCents } from "./round";
import type {
  CapturedDeductions,
  IncomeComponents,
  PayrollEmployeeComputation,
  PayrollEmployeeInput,
} from "./types";

/** `Y`…`AN` in the order the book sweeps them with `SUM(X:AN)`. */
function sumCapturedDeductions(d: CapturedDeductions): number {
  return (
    d.iessLoans +
    d.unpaidLeave +
    d.salaryAdvance +
    d.companyLoans +
    d.incomeTax +
    d.meals +
    d.fines +
    d.inHouseConsumption +
    d.solidarityContribution +
    d.otherDeductions +
    d.partTimeDeduction +
    d.medicalLeaveDeduction
  );
}

/** Exactly zero when the value does not reach a cent; if it does, it is returned INTACT, with its
 *  noise. It leans on `sameToTheCentavo`, which is the module's only definition of «same amount», so
 *  as not to open a second one here. See the comment on `difference` further below. */
function collapseSubCentavoNoise(value: number): number {
  return sameToTheCentavo(value, 0) ? 0 : value;
}

export function computeEmployeePayroll(
  input: PayrollEmployeeInput,
  parameters: PayrollParameters,
): PayrollEmployeeComputation {
  const p = parameters;

  // 1 · `F` — the base salary prorated by days. It is not capped from above: the book does not do
  // it, and a 31-day month with 31 paid is a real case, not a capture error.
  const unifiedSalary = roundToCents((input.baseSalary / p.monthlyDays) * input.days);

  // 2 · `J`, `K`, `L` — the hourly rate comes out of the BASE salary, not the unified one: someone
  // who worked half a month is paid their overtime at the full rate.
  const hourlyRate = input.baseSalary / p.monthlyDays / p.dailyHours;
  const overtimePay50 = roundToCents(hourlyRate * p.overtimeMultiplier50 * input.overtimeHours50);
  const overtimePay100 = roundToCents(
    hourlyRate * p.overtimeMultiplier100 * input.overtimeHours100,
  );
  const overtimePay25 = roundToCents(hourlyRate * p.overtimeMultiplier25 * input.overtimeHours25);

  // 3 · `M` — the overtime amount that is recognised. It is TYPED, not computed: `null` is «all the
  // hours worked» and any number is that exact amount, including the `0` the book writes as `*0`.
  // What is not recognised stays VISIBLE in the three columns above but feeds NOTHING: not the
  // total, not the contribution, not the décimos, not the provisions (§6).
  //
  // The `null` branch does not round, just like the book, which literally writes `(J+K+L)`: the
  // three addends already arrive rounded and their sum carries the noise `W` has to keep (§9).
  // Rounding here «to keep it clean» would break bit equality with the file.
  const overtimeTotal = input.approvedOvertime ?? overtimePay50 + overtimePay100 + overtimePay25;

  // 4 · `N` — the SBU spread over the year by days worked. It does not depend on the employee's
  // salary; a part-time contract receives half.
  const fourteenthFull = (p.unifiedBasicSalary / p.yearlyDays) * input.days;
  const fourteenthMonthly = roundToCents(
    input.contractType === "CT" ? fourteenthFull : fourteenthFull / 2,
  );

  // The components are filled in the order the bases need them: `O` is derived from a base that does
  // NOT contain it, and afterwards it enters two others.
  const components: IncomeComponents = {
    unifiedSalary,
    overtimeTotal,
    fourteenthMonthly,
    thirteenthMonthly: 0,
    vacationPay: input.vacationPay,
    privateInsurance: input.privateInsurance,
    allowances: input.allowances,
    fixedCommission: input.fixedCommission,
    variableCommission: input.variableCommission,
    reserveFundPaid: 0,
    bonus: input.bonus,
    contributoryExtras: input.extras.contributory,
    nonContributoryExtras: input.extras.nonContributory,
  };

  // 5 · `O` — a twelfth of its own base, which leaves the monthly vacations out.
  components.thirteenthMonthly = roundToCents(thirteenthBase(components) / 12);

  // 6 · `U` — only received by whoever is entitled AND does not accrue it. A twelfth, not the 8.33 %
  // rate its twin `AW` uses: they are not the same and the book does not unify them (§7, §8).
  components.reserveFundPaid =
    input.hasReserveFund && !input.accumulatesReserveFund
      ? roundToCents(contributoryBase(components) / 12)
      : 0;

  // 7 · `W` — unrounded, in the book's column order.
  const gross = grossIncome(components);

  // 8 · `X` — the contributory base times the personal rate.
  const iessEmployee = roundToCents(contributoryBase(components) * p.iessEmployeeRate);

  // 9 · `AO` and 10 · `AP` — neither of the two rounded.
  const totalDeductions = iessEmployee + sumCapturedDeductions(input.deductions);
  const netPay = gross - totalDeductions;

  // 11 · the five of the provision, in column order.
  const thirteenthProvision = input.flags.provisionsThirteenth
    ? roundToCents(thirteenthProvisionBase(components) / 12)
    : 0;
  // The book writes a stale `470` here (and an `846` in its template row) instead of the current
  // SBU, but since the column is always multiplied by zero it was never possible to verify which was
  // the right one. The período's SBU is used, which is the only defensible reading.
  const fourteenthProvisionFull = (p.unifiedBasicSalary / p.yearlyDays) * input.days;
  const fourteenthProvision = input.flags.provisionsFourteenth
    ? roundToCents(
        input.contractType === "CT" ? fourteenthProvisionFull : fourteenthProvisionFull / 2,
      )
    : 0;
  const iessEmployer = roundToCents(contributoryBase(components) * p.iessEmployerRate);
  const vacationProvision = roundToCents(vacationBase(components) / 24);
  const reserveFundAccrued =
    input.hasReserveFund && input.accumulatesReserveFund
      ? roundToCents(reserveFundAccrualBase(components) * p.reserveFundRate)
      : 0;

  // 12 · `AX` and 13 · `AY` — unrounded.
  const totalProvision =
    thirteenthProvision +
    fourteenthProvision +
    iessEmployer +
    vacationProvision +
    reserveFundAccrued;
  const employerCost = totalProvision + gross;

  // 14 · `CA` — `null` when there is no `PAGADO`: without it neither that it squares nor that it does
  // not can be claimed, and a zero there would be an invented reconciliation.
  //
  // BELOW a cent the difference collapses to exactly zero, and that is not a liberty: the net pay is
  // an unrounded sum that arrives with noise (`457.69000000000005`) while what was paid is typed by
  // hand with two decimals (`457.69`), so every real difference is a whole number of cents and any
  // remainder belongs to the binary. It is the same rule `sameToTheCentavo` already applies in the
  // journal entry, and it is also what the file does: Excel collapses to zero a subtraction that is
  // negligible against its operands, which is why `CA15` stores `0` and not `5.7e-14`. What is NOT
  // touched is a real difference: VEGA's is still `-41.70999999999992`, with its noise, exactly as
  // the book stores it.
  const difference = input.paid === null ? null : collapseSubCentavoNoise(netPay - input.paid);

  return {
    unifiedSalary,
    overtimePay50,
    overtimePay100,
    overtimePay25,
    overtimeTotal,
    fourteenthMonthly,
    thirteenthMonthly: components.thirteenthMonthly,
    reserveFundPaid: components.reserveFundPaid,
    grossIncome: gross,
    iessEmployee,
    totalDeductions,
    netPay,
    thirteenthProvision,
    fourteenthProvision,
    iessEmployer,
    vacationProvision,
    reserveFundAccrued,
    totalProvision,
    employerCost,
    difference,
  };
}
