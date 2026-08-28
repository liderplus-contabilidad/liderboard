/**
 * The bridge between what the database stores of an employee and what the engine consumes.
 *
 * It exists because the two shapes answer different questions and must not be fused:
 * `PayrollEmployeeLine` is how it is STORED —a stable record plus the month's capture—, and
 * `PayrollEmployeeInput` is what the COMPUTATION needs, with no identity and no provenance. That the
 * engine knows neither `id`, `periodId` nor `name` is what keeps it testable against the accountant's
 * book without inventing an employee.
 */
import { computeEmployeePayroll } from "./engine/compute";
import type { PayrollParameters } from "./engine/parameters";
import type { PayrollEmployeeComputation, PayrollEmployeeInput } from "./engine/types";
import { sumExtraIncome } from "./extra-income";
import type { ParsedPayrollEmployeeLine, PayrollMonthlyCapture } from "./types";

/**
 * A blank capture: everything at zero and no overtime trim.
 *
 * It returns a NEW object on every call, and that is not ceremony: a shared constant would let
 * editing one employee's month move another's figures, because `deductions` is a nested object and
 * would be copied by reference.
 */
export function emptyCapture(): PayrollMonthlyCapture {
  return {
    overtimeHours50: 0,
    overtimeHours100: 0,
    overtimeHours25: 0,
    approvedOvertime: null,
    vacationPay: 0,
    privateInsurance: 0,
    allowances: 0,
    fixedCommission: 0,
    variableCommission: 0,
    bonus: 0,
    extras: [],
    deductions: {
      iessLoans: 0,
      unpaidLeave: 0,
      salaryAdvance: 0,
      companyLoans: 0,
      incomeTax: 0,
      meals: 0,
      fines: 0,
      inHouseConsumption: 0,
      solidarityContribution: 0,
      otherDeductions: 0,
      partTimeDeduction: 0,
      medicalLeaveDeduction: 0,
    },
    paid: null,
  };
}

/**
 * Crosses the employee's record with what was captured of the month. **It always returns an input**:
 * a line with no capture is read as an EMPTY capture.
 *
 * That is deliberate and it is what makes the app work with no Excel. An employee's rol needs no file
 * to exist: their unified salary comes out of the base salary and the days, the décimo cuarto out of
 * the SBU, the décimo tercero and the IESS contribution out of that. The only thing a capture
 * contributes is the overtime, the other payments and the deductions — all of which, uncaptured, are
 * really worth ZERO, not «unknown». A nómina just copied from the previous month shows its complete
 * rol from the first moment, which is the module's main use case.
 *
 * It is the difference from PyG, from which the opposite rule was copied at first: there a month that
 * was not loaded is not a month at zero because nobody declared those figures, whereas here the
 * record DECLARES the salary and the rest is derived. What does keep that distinction is `paid`: with
 * nobody declaring what was transferred it stays `null` and the employee comes out «unreconciled»,
 * which is not the same as squared.
 *
 * How responsibilities are split between the two halves, which is what decides which field comes from
 * where: the reserve fund (`hasReserveFund`, `accumulatesReserveFund`) and the two décimo provision
 * flags (`provisionsThirteenth`, `provisionsFourteenth`) belong to the RECORD because they depend on
 * seniority and on a choice of the employee, not on the month — if they travelled in the capture,
 * copying the previous month's nómina would lose them. `paid` belongs to the MONTH and that is why it
 * lives in the capture, whether whoever assembles the rol types it or a file's `BZ` brings it: to the
 * engine they are indistinguishable, which is what allows reconciling a manual creation with no Excel
 * in between.
 *
 * The BONUS ROWS arrive inside the capture and not by parameter, and that closes a failure mode
 * instead of having to defend against it: when the declaration lived on the período, this function
 * received the list as an argument and the argument was declared mandatory and with no default on
 * purpose, so a consumer that forgot it would not compile instead of returning a rol that is TOO LOW
 * with a plausible figure no test of another consumer looks at. Travelling in the line there is
 * nothing to forget.
 */
export function toEngineInput(line: ParsedPayrollEmployeeLine): PayrollEmployeeInput {
  const capture = line.capture ?? emptyCapture();

  return {
    baseSalary: line.baseSalary,
    days: line.days,
    contractType: line.contractType,
    hasReserveFund: line.hasReserveFund,
    accumulatesReserveFund: line.accumulatesReserveFund,
    overtimeHours50: capture.overtimeHours50,
    overtimeHours100: capture.overtimeHours100,
    overtimeHours25: capture.overtimeHours25,
    approvedOvertime: capture.approvedOvertime,
    vacationPay: capture.vacationPay,
    privateInsurance: capture.privateInsurance,
    allowances: capture.allowances,
    fixedCommission: capture.fixedCommission,
    variableCommission: capture.variableCommission,
    bonus: capture.bonus,
    // The list is reduced HERE to its two aggregates: the engine does not know how many rows there
    // are or what they are called, because to the six bases three contributory bonuses of 50 and one
    // of 150 are the same thing.
    extras: sumExtraIncome(capture.extras),
    // A copy, not a reference: whoever receives this input can edit it to preview a change without
    // that touching what is stored until someone decides to write it.
    deductions: { ...capture.deductions },
    paid: capture.paid,
    // From the LINE and not from the capture: provisioning the décimos or taking them monthly is a
    // choice of the employee, just like the two reserve-fund ones above. See `PayrollEmployeeLine`.
    flags: {
      provisionsThirteenth: line.provisionsThirteenth,
      provisionsFourteenth: line.provisionsFourteenth,
    },
  };
}

/**
 * The rol of ONE stored line: the composition of `toEngineInput` with the engine, declared here just
 * once.
 *
 * It exists because that pair of calls is needed by four consumers —the KPI card, the nómina's table,
 * the employee's record and the payslip download— and it was written by hand in each. With one single
 * definition, no screen can be left with a different version of «this employee's rol»; without it, it
 * already happened: the reconciliation badge compared one thing and the engine another.
 */
export function computeLinePayroll(
  // `ParsedPayrollEmployeeLine` and not `PayrollEmployeeLine`: a line's rol does not depend on its
  // `id` or its `periodId`, and asking for the ownerless shape is what lets an upload's PREVIEW
  // total what the file brings before it exists in the database — with this same definition, not with
  // a copy.
  line: ParsedPayrollEmployeeLine,
  parameters: PayrollParameters,
): PayrollEmployeeComputation {
  return computeEmployeePayroll(toEngineInput(line), parameters);
}
