import { describe, expect, it } from "vitest";
import { buildPayrollSummary } from "./summary";
import type { PayrollPeriod } from "./types";

function period(overrides: Partial<PayrollPeriod> = {}): PayrollPeriod {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    clientId: "cliente-1",
    year: 2026,
    monthIndex: 5,
    kind: "ordinario",
    status: "captura",
    ...overrides,
  };
}

describe("buildPayrollSummary", () => {
  it("con ningún período, todo queda vacío", () => {
    expect(buildPayrollSummary([])).toEqual({
      periodCount: 0,
      latestPeriodLabel: null,
      latestEmployees: 0,
      netAccrued: null,
    });
  });

  it("cuenta los períodos que recibe", () => {
    const periods = [
      period({ monthIndex: 2 }),
      period({ monthIndex: 4 }),
      period({ monthIndex: 5 }),
    ];
    expect(buildPayrollSummary(periods).periodCount).toBe(3);
  });

  it("«Último período» es el más reciente, en su etiqueta corta", () => {
    const periods = [period({ year: 2025, monthIndex: 11 }), period({ year: 2026, monthIndex: 2 })];
    expect(buildPayrollSummary(periods).latestPeriodLabel).toBe("MAR 2026");
  });

  it(
    "«Empleados en nómina» es del último período, NO la suma — sumar contaría a la misma " +
      "persona una vez por cada mes en que aparece",
    () => {
      const periods = [
        period({ monthIndex: 2, totals: { employees: 6, net: 100, cost: 150, areas: 2 } }),
        period({ monthIndex: 5, totals: { employees: 8, net: 200, cost: 250, areas: 3 } }),
      ];
      expect(buildPayrollSummary(periods).latestEmployees).toBe(8);
    },
  );

  it("«Empleados» es 0 cuando el último período todavía no tiene totales", () => {
    const periods = [period({ monthIndex: 5 })];
    expect(buildPayrollSummary(periods).latestEmployees).toBe(0);
  });

  it("«Líquido acumulado» suma SOLO los períodos con totales, y es null sin ninguno", () => {
    const periods = [
      period({ monthIndex: 2, totals: { employees: 6, net: 100, cost: 150, areas: 2 } }),
      period({ monthIndex: 4 }), // en captura, sin totales — no cuenta ni como cero
      period({ monthIndex: 5, totals: { employees: 8, net: 250, cost: 300, areas: 3 } }),
    ];
    expect(buildPayrollSummary(periods).netAccrued).toBe(350);
  });

  it("«Líquido acumulado» es null, no cero, cuando ningún período tiene totales", () => {
    const periods = [period({ monthIndex: 4 }), period({ monthIndex: 5 })];
    expect(buildPayrollSummary(periods).netAccrued).toBeNull();
  });
});
