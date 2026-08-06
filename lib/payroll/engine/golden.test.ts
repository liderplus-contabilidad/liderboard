import { describe, expect, it } from "vitest";
import { computeEmployeePayroll } from "./compute";
import { GOLDEN_MARCH_2026 } from "./golden.fixtures";
import { DEFAULT_PAYROLL_PARAMETERS } from "./parameters";
import type { PayrollEmployeeComputation } from "./types";

/**
 * El test que decide si el motor sirve: reproducir, columna por columna, lo que las 1.199
 * fórmulas del libro del contador calcularon para marzo de 2026.
 *
 * La igualdad es EXACTA (`toBe`), no aproximada. Una tolerancia de un céntimo dejaría pasar
 * justo el error que este motor existe para evitar — que la app y el Excel del contador digan
 * cifras distintas sin que nada lo delate.
 */
const COLUMNS: readonly (keyof PayrollEmployeeComputation)[] = [
  "unifiedSalary",
  "overtimePay50",
  "overtimePay100",
  "overtimePay25",
  "overtimeTotal",
  "fourteenthMonthly",
  "thirteenthMonthly",
  "reserveFundPaid",
  "grossIncome",
  "iessEmployee",
  "totalDeductions",
  "netPay",
  "thirteenthProvision",
  "fourteenthProvision",
  "iessEmployer",
  "vacationProvision",
  "reserveFundAccrued",
  "totalProvision",
  "employerCost",
  "difference",
];

describe("fixture de oro: el rol real de MARZO 2026", () => {
  it("cubre a los seis empleados del archivo", () => {
    expect(GOLDEN_MARCH_2026).toHaveLength(6);
  });

  describe.each(GOLDEN_MARCH_2026)("$name (fila $row)", (employee) => {
    const got = computeEmployeePayroll(employee.input, DEFAULT_PAYROLL_PARAMETERS);

    it.each(COLUMNS)("%s cuadra al bit", (column) => {
      expect(got[column]).toBe(employee.expected[column]);
    });
  });

  it("las 19 columnas de los 6 salen de una sola pasada, sin excepciones", () => {
    for (const employee of GOLDEN_MARCH_2026) {
      expect(computeEmployeePayroll(employee.input, DEFAULT_PAYROLL_PARAMETERS)).toEqual(
        employee.expected,
      );
    }
  });
});

describe("lo que el archivo real demuestra y ningún test sintético prueba", () => {
  const byName = (name: string) => {
    const employee = GOLDEN_MARCH_2026.find((e) => e.name.startsWith(name));
    if (!employee) {
      throw new Error(`falta ${name} en el fixture`);
    }
    return employee;
  };

  it("los totales llegan con ruido de coma flotante, no redondeados", () => {
    // Si alguien «limpia» los totales con un redondeo, estos tres se rompen — y con ellos la
    // conciliación contra el PAGADO, que está tecleado a mano y sí es exacto.
    const sandoval = computeEmployeePayroll(
      byName("SANDOVAL COLIMBA").input,
      DEFAULT_PAYROLL_PARAMETERS,
    );
    expect(sandoval.grossIncome).toBe(569.5500000000001);

    const morales = computeEmployeePayroll(byName("MORALES").input, DEFAULT_PAYROLL_PARAMETERS);
    expect(morales.netPay).toBe(457.69000000000005);

    const acosta = computeEmployeePayroll(byName("ACOSTA").input, DEFAULT_PAYROLL_PARAMETERS);
    expect(acosta.totalProvision).toBe(81.00999999999999);
  });

  it("MORALES enseña 16,75 de horas extras que su total NO incluye", () => {
    const morales = computeEmployeePayroll(byName("MORALES").input, DEFAULT_PAYROLL_PARAMETERS);
    expect(morales.overtimePay50).toBe(16.75);
    expect(morales.overtimeTotal).toBe(0);
    expect(morales.grossIncome).toBe(567.98);
  });

  it("cinco de los seis quedan conciliados; solo VEGA tiene diferencia real", () => {
    const differences = GOLDEN_MARCH_2026.map((employee) => ({
      name: employee.name,
      difference: computeEmployeePayroll(employee.input, DEFAULT_PAYROLL_PARAMETERS).difference,
    }));

    const conciliados = differences.filter(
      (d) => d.difference !== null && Math.abs(d.difference) < 0.005,
    );
    expect(conciliados).toHaveLength(5);

    const vega = differences.find((d) => d.name.startsWith("VEGA"));
    expect(vega?.difference).toBeCloseTo(-41.71, 2);
  });

  it("SORIA cobra menos por su anticipo de 200, no por ganar menos", () => {
    const soria = computeEmployeePayroll(byName("SORIA").input, DEFAULT_PAYROLL_PARAMETERS);
    const luis = computeEmployeePayroll(
      byName("SANDOVAL ACOSTA").input,
      DEFAULT_PAYROLL_PARAMETERS,
    );
    expect(soria.grossIncome).toBe(luis.grossIncome);
    expect(luis.netPay - soria.netPay).toBeCloseTo(200, 2);
  });
});
