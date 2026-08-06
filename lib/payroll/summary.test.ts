import { describe, expect, it } from "vitest";
import type { PayrollPeriodFinancials } from "./period-detail";
import { buildPayrollSummary } from "./summary";
import type { PayrollPeriod, PayrollRosterSummary } from "./types";

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

/** El mapa `periodId → roster` que el provider deriva de la tabla `employees`. */
function rosterMap(entries: [string, PayrollRosterSummary][]): Map<string, PayrollRosterSummary> {
  return new Map(entries);
}

/** El mapa `periodId → financials` que el provider deriva de la tabla `employees`, tal como
 *  `db.periodFinancials` lo entrega — sin entrada para un período sin `figures` cargadas. */
function financialsMap(
  entries: [string, PayrollPeriodFinancials][],
): Map<string, PayrollPeriodFinancials> {
  return new Map(entries);
}

const NO_ROSTER = rosterMap([]);
const NO_FINANCIALS = financialsMap([]);

describe("buildPayrollSummary", () => {
  it("con ningún período, todo queda vacío", () => {
    expect(buildPayrollSummary([], NO_ROSTER, NO_FINANCIALS)).toEqual({
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
    expect(buildPayrollSummary(periods, NO_ROSTER, NO_FINANCIALS).periodCount).toBe(3);
  });

  it("«Último período» es el más reciente, en su etiqueta corta", () => {
    const periods = [period({ year: 2025, monthIndex: 11 }), period({ year: 2026, monthIndex: 2 })];
    expect(buildPayrollSummary(periods, NO_ROSTER, NO_FINANCIALS).latestPeriodLabel).toBe(
      "MAR 2026",
    );
  });

  it(
    "«Empleados en nómina» es del último período, NO la suma — sumar contaría a la misma " +
      "persona una vez por cada mes en que aparece, y sale del CONTEO DERIVADO de su nómina, " +
      "nunca de un total guardado",
    () => {
      const marzo = period({ id: "marzo", monthIndex: 2 });
      const junio = period({ id: "junio", monthIndex: 5 });
      const roster = rosterMap([
        ["marzo", { employees: 6, areas: 2 }],
        ["junio", { employees: 8, areas: 3 }],
      ]);
      expect(buildPayrollSummary([marzo, junio], roster, NO_FINANCIALS).latestEmployees).toBe(8);
    },
  );

  it("«Empleados» es 0 cuando el último período todavía no tiene nómina cargada", () => {
    const periods = [period({ monthIndex: 5 })];
    expect(buildPayrollSummary(periods, NO_ROSTER, NO_FINANCIALS).latestEmployees).toBe(0);
  });

  it("«Líquido acumulado» suma SOLO los períodos con financials, y es null sin ninguno", () => {
    const marzo = period({ id: "marzo", monthIndex: 2 });
    const abril = period({ id: "abril", monthIndex: 4 }); // en captura, sin financials — no cuenta ni como cero
    const junio = period({ id: "junio", monthIndex: 5 });
    const financials = financialsMap([
      ["marzo", { gross: 200, deductions: 20, net: 100, cost: 150 }],
      ["junio", { gross: 500, deductions: 50, net: 250, cost: 300 }],
    ]);
    expect(buildPayrollSummary([marzo, abril, junio], NO_ROSTER, financials).netAccrued).toBe(350);
  });

  it("«Líquido acumulado» es null, no cero, cuando ningún período tiene financials", () => {
    const periods = [period({ monthIndex: 4 }), period({ monthIndex: 5 })];
    expect(buildPayrollSummary(periods, NO_ROSTER, NO_FINANCIALS).netAccrued).toBeNull();
  });
});
