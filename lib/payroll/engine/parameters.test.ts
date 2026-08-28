import { describe, expect, it } from "vitest";
import { computeEmployeePayroll } from "./compute";
import { DEFAULT_PAYROLL_PARAMETERS, type PayrollParameters } from "./parameters";
import type { PayrollEmployeeInput } from "./types";

const BASE_INPUT: PayrollEmployeeInput = {
  baseSalary: 480,
  days: 30,
  contractType: "CT",
  hasReserveFund: false,
  accumulatesReserveFund: false,
  overtimeHours50: 4,
  overtimeHours100: 4,
  overtimeHours25: 4,
  approvedOvertime: null,
  vacationPay: 0,
  privateInsurance: 0,
  allowances: 0,
  fixedCommission: 0,
  variableCommission: 0,
  bonus: 0,
  extras: { contributory: 0, nonContributory: 0 },
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
  flags: {
    provisionsThirteenth: false,
    provisionsFourteenth: false,
  },
};

const withParams = (overrides: Partial<PayrollParameters>) =>
  computeEmployeePayroll(BASE_INPUT, { ...DEFAULT_PAYROLL_PARAMETERS, ...overrides });

const base = () => computeEmployeePayroll(BASE_INPUT, DEFAULT_PAYROLL_PARAMETERS);

/**
 * These tests do not check a computation: they check that each parameter is REALLY plugged in and
 * that it reaches only where it should. It is what allows 2027 to be a change of data and not of
 * code, and the accountant's answer to §11.2 to be applied by moving a number.
 *
 * A hand-baked value would pass every test of figures —which use the default parameters— and would
 * only come to light the January the SBU changes.
 */
describe("los parámetros del período están enchufados", () => {
  it("el SBU manda sobre el décimo cuarto y sobre NADA más", () => {
    const doble = withParams({ unifiedBasicSalary: 964 });
    // Doubling the SBU does NOT exactly double the result: `ROUND(482/360×30)` is `40.17` and
    // `ROUND(964/360×30)` is `80.33`, not `80.34`. Rounding breaks linearity, and that is why the
    // figure is asserted as it is and not as «double of».
    expect(base().fourteenthMonthly).toBe(40.17);
    expect(doble.fourteenthMonthly).toBe(80.33);

    // It raises the total income because the décimo enters it, but no other derivation moves.
    expect(doble.unifiedSalary).toBe(base().unifiedSalary);
    expect(doble.thirteenthMonthly).toBe(base().thirteenthMonthly);
    expect(doble.iessEmployee).toBe(base().iessEmployee);
    expect(doble.iessEmployer).toBe(base().iessEmployer);
  });

  it("la tasa personal solo mueve el aporte personal", () => {
    const r = withParams({ iessEmployeeRate: 0.1 });
    expect(r.iessEmployee).not.toBe(base().iessEmployee);
    expect(r.iessEmployer).toBe(base().iessEmployer);
    expect(r.grossIncome).toBe(base().grossIncome);
  });

  it("la tasa patronal solo mueve el aporte patronal", () => {
    const r = withParams({ iessEmployerRate: 0.2 });
    expect(r.iessEmployer).not.toBe(base().iessEmployer);
    expect(r.iessEmployee).toBe(base().iessEmployee);
    expect(r.netPay).toBe(base().netPay);
  });

  it("la tasa del fondo de reserva NO toca el que se paga en el mes (§8)", () => {
    // The two branches use different rules —a twelfth against 8.33 %— and the book does not unify
    // them. If someone unified them, this test catches it.
    const input = { ...BASE_INPUT, hasReserveFund: true, accumulatesReserveFund: false };
    const conTasaRara = computeEmployeePayroll(input, {
      ...DEFAULT_PAYROLL_PARAMETERS,
      reserveFundRate: 0.5,
    });
    const normal = computeEmployeePayroll(input, DEFAULT_PAYROLL_PARAMETERS);
    expect(conTasaRara.reserveFundPaid).toBe(normal.reserveFundPaid);
  });

  it("la tasa del fondo de reserva sí manda sobre el acumulado", () => {
    const input = { ...BASE_INPUT, hasReserveFund: true, accumulatesReserveFund: true };
    const r = computeEmployeePayroll(input, {
      ...DEFAULT_PAYROLL_PARAMETERS,
      reserveFundRate: 0.5,
    });
    // The base is the unified salary PLUS overtime (480 + 30), not the bare salary: this fixture's
    // employee brings 4 hours of each class and the flag switched on.
    expect(r.reserveFundAccrued).toBe(255);
  });

  it("cada multiplicador de hora extra manda sobre su propia clase", () => {
    expect(withParams({ overtimeMultiplier50: 3 }).overtimePay50).toBe(base().overtimePay50 * 2);
    expect(withParams({ overtimeMultiplier100: 4 }).overtimePay100).toBe(base().overtimePay100 * 2);
    // It is the number that changes when the accountant answers §11.2: 0.25 → 1.25 if it turns out
    // the third class is of the same kind as the other two.
    expect(withParams({ overtimeMultiplier25: 1.25 }).overtimePay25).toBe(base().overtimePay25 * 5);
  });

  it("la jornada y el mes mandan sobre el valor de la hora", () => {
    expect(withParams({ dailyHours: 4 }).overtimePay50).toBe(base().overtimePay50 * 2);
    expect(withParams({ monthlyDays: 15 }).overtimePay50).toBe(base().overtimePay50 * 2);
  });
});

describe("el motor es una función pura", () => {
  it("no muta su entrada", () => {
    const input = structuredClone(BASE_INPUT);
    computeEmployeePayroll(input, DEFAULT_PAYROLL_PARAMETERS);
    expect(input).toEqual(BASE_INPUT);
  });

  it("no muta sus parámetros", () => {
    const parameters = { ...DEFAULT_PAYROLL_PARAMETERS };
    computeEmployeePayroll(BASE_INPUT, parameters);
    expect(parameters).toEqual(DEFAULT_PAYROLL_PARAMETERS);
  });

  it("dos llamadas iguales dan lo mismo", () => {
    expect(base()).toEqual(base());
  });
});

describe("entradas degeneradas no producen NaN", () => {
  // A `NaN` that slips in here propagates to the four totals and to the reconciliation, and on screen
  // it looks like an empty cell instead of an error.
  it.each([
    [
      "todo en cero",
      { baseSalary: 0, days: 0, overtimeHours50: 0, overtimeHours100: 0, overtimeHours25: 0 },
    ],
    ["sueldo cero con días", { baseSalary: 0, days: 30 }],
    ["días cero con sueldo", { baseSalary: 480, days: 0 }],
    ["sueldo negativo", { baseSalary: -100, days: 30 }],
  ])("%s", (_label, overrides) => {
    const result = computeEmployeePayroll(
      { ...BASE_INPUT, ...overrides },
      DEFAULT_PAYROLL_PARAMETERS,
    );
    for (const [key, value] of Object.entries(result)) {
      if (value !== null) {
        expect(Number.isFinite(value), `${key} no es finito`).toBe(true);
      }
    }
  });
});
