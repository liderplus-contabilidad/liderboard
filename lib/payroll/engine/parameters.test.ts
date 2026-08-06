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
 * Estos tests no comprueban una cuenta: comprueban que cada parámetro esté REALMENTE enchufado
 * y que llegue solo a donde le toca. Es lo que permite que 2027 sea un cambio de datos y no de
 * código, y que la respuesta del contador a §11.2 se aplique moviendo un número.
 *
 * Un valor horneado a mano pasaría todos los tests de cifras —que usan los parámetros por
 * defecto— y solo saldría a la luz el enero en que el SBU cambie.
 */
describe("los parámetros del período están enchufados", () => {
  it("el SBU manda sobre el décimo cuarto y sobre NADA más", () => {
    const doble = withParams({ unifiedBasicSalary: 964 });
    // Doblar el SBU NO dobla exactamente el resultado: `ROUND(482/360×30)` es `40,17` y
    // `ROUND(964/360×30)` es `80,33`, no `80,34`. El redondeo rompe la linealidad, y por eso
    // la cifra se afirma tal cual y no como «el doble de».
    expect(base().fourteenthMonthly).toBe(40.17);
    expect(doble.fourteenthMonthly).toBe(80.33);

    // Sube el total ingreso porque el décimo entra en él, pero ninguna otra derivación se mueve.
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
    // Las dos ramas usan reglas distintas —un doceavo contra 8,33 %— y el libro no las unifica.
    // Si alguien las unificara, este test lo caza.
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
    // La base es sueldo unificado MÁS horas extras (480 + 30), no el sueldo a secas: el
    // empleado de este fixture trae 4 horas de cada clase y la bandera encendida.
    expect(r.reserveFundAccrued).toBe(255);
  });

  it("cada multiplicador de hora extra manda sobre su propia clase", () => {
    expect(withParams({ overtimeMultiplier50: 3 }).overtimePay50).toBe(base().overtimePay50 * 2);
    expect(withParams({ overtimeMultiplier100: 4 }).overtimePay100).toBe(base().overtimePay100 * 2);
    // Es el número que cambia cuando el contador responda §11.2: 0,25 → 1,25 si resulta que la
    // tercera clase es del mismo tipo que las otras dos.
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
  // Un `NaN` que se cuele aquí se propaga a los cuatro totales y a la conciliación, y en
  // pantalla se ve como una celda vacía en vez de como un error.
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
