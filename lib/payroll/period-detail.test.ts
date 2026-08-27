import { describe, expect, it } from "vitest";
import { computeLinePayroll } from "./employee-input";
import { computeEmployeePayroll } from "./engine/compute";
import { GOLDEN_MARCH_2026 } from "./engine/golden.fixtures";
import { DEFAULT_PAYROLL_PARAMETERS } from "./engine/parameters";
import type { PayrollEmployeeComputation } from "./engine/types";
import {
  computePeriodFinancials,
  computeReconciliationCounts,
  matchesEmployeeSearch,
  reconciliationStatusOf,
} from "./period-detail";
import type { PayrollEmployeeLine } from "./types";

function computation(
  overrides: Partial<PayrollEmployeeComputation> = {},
): PayrollEmployeeComputation {
  return {
    unifiedSalary: 460,
    overtimePay50: 0,
    overtimePay100: 0,
    overtimePay25: 0,
    overtimeTotal: 0,
    fourteenthMonthly: 39.5,
    thirteenthMonthly: 38.33,
    reserveFundPaid: 0,
    grossIncome: 500,
    iessEmployee: 43.47,
    totalDeductions: 50,
    netPay: 450,
    thirteenthProvision: 0,
    fourteenthProvision: 0,
    iessEmployer: 55.89,
    vacationProvision: 19.17,
    reserveFundAccrued: 0,
    totalProvision: 100,
    employerCost: 600,
    difference: 0,
    ...overrides,
  };
}

function line(overrides: Partial<PayrollEmployeeLine> = {}): PayrollEmployeeLine {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    periodId: "period-1",
    name: "Ana Torres",
    role: "Recepcionista",
    area: "ADMINISTRACION",
    baseSalary: 460,
    contractType: "CT",
    idCard: "0102030405",
    hireDate: "2024-03-01",
    sectorCode: "S001",
    hasReserveFund: false,
    accumulatesReserveFund: false,
    provisionsThirteenth: false,
    provisionsFourteenth: false,
    days: 30,
    ...overrides,
  };
}

describe("reconciliationStatusOf", () => {
  it("sin PAGADO declarado, no está conciliado ni con diferencia", () => {
    expect(reconciliationStatusOf(null)).toBe("sin-conciliar");
  });

  it("diferencia cero: conciliado", () => {
    expect(reconciliationStatusOf(0)).toBe("conciliado");
  });

  it("cualquier diferencia, en cualquier signo: con diferencia", () => {
    expect(reconciliationStatusOf(-41.70999999999992)).toBe("diferencia");
    expect(reconciliationStatusOf(0.01)).toBe("diferencia");
  });

  // The collapse of the sub-cent noise belongs to the ENGINE, not here: this function classifies what
  // the engine already decided. If it were compared by tolerance again at this point there would be
  // two definitions of «it squares» and they could drift apart, which is exactly what happened when
  // this compared what the file declared while the engine compared what was typed.
  it("no aplica tolerancia propia: un valor no nulo es diferencia aunque sea ínfimo", () => {
    expect(reconciliationStatusOf(5.7e-14)).toBe("diferencia");
  });
});

describe("computeReconciliationCounts", () => {
  it("cuenta conciliados y con diferencia por separado, sin contar el resto en ninguno", () => {
    expect(
      computeReconciliationCounts([
        computation({ difference: 0 }),
        computation({ difference: -50 }),
        computation({ difference: null }),
      ]),
    ).toEqual({ reconciled: 1, withDifference: 1 });
  });

  it("una nómina vacía no cuenta nada", () => {
    expect(computeReconciliationCounts([])).toEqual({ reconciled: 0, withDifference: 0 });
  });
});

describe("computePeriodFinancials", () => {
  it("suma gross/deductions/net/cost de todo el rol calculado", () => {
    expect(
      computePeriodFinancials([
        computation({ grossIncome: 500, totalDeductions: 50, netPay: 450, employerCost: 600 }),
        computation({ grossIncome: 300, totalDeductions: 30, netPay: 270, employerCost: 360 }),
      ]),
    ).toEqual({ gross: 800, deductions: 80, net: 720, cost: 960 });
  });

  // The cut used to be «no employee brings figures», that is, «the file did not arrive». That state
  // no longer exists: the engine derives the rol from the record, so a nómina copied from the previous
  // month totals from the first moment and the only thing with no totals is a período WITH NO
  // employees.
  it("una nómina sin nada capturado SÍ totaliza: el motor la deriva de la ficha", () => {
    const totals = computePeriodFinancials([
      computeLinePayroll(line(), DEFAULT_PAYROLL_PARAMETERS),
    ]);
    expect(totals).toBeDefined();
    expect(totals?.net).toBeGreaterThan(0);
  });

  it("undefined, no cero, solo cuando el período no tiene empleados", () => {
    expect(computePeriodFinancials([])).toBeUndefined();
  });
});

describe("matchesEmployeeSearch", () => {
  it("compara el nombre, ignorando mayúsculas y acentos", () => {
    expect(matchesEmployeeSearch(line({ name: "José Andrés" }), "jose andres")).toBe(true);
    expect(matchesEmployeeSearch(line({ name: "José Andrés" }), "JOSÉ")).toBe(true);
  });

  it("un texto vacío no filtra nada", () => {
    expect(matchesEmployeeSearch(line({ name: "Ana Torres" }), "")).toBe(true);
  });

  it("descarta lo que no contiene el texto", () => {
    expect(matchesEmployeeSearch(line({ name: "Ana Torres" }), "luis")).toBe(false);
  });
});

describe("conciliación del rol REAL de marzo 2026, a través del motor", () => {
  // The engine's same golden fixture, read by the KPI card: what is asserted is not that this function
  // classifies an invented number correctly, but that the accountant's file gives 5 reconciled and 1
  // with a difference WHEN the figures are computed by the app. Without this, the book's floating-point
  // noise (`457.69000000000005` against a typed `457.69`) could tint four of the six as «with a
  // difference» again and nothing would notice.
  const computations = GOLDEN_MARCH_2026.map((employee) =>
    computeEmployeePayroll(employee.input, DEFAULT_PAYROLL_PARAMETERS),
  );

  it("da 5 conciliados y 1 con diferencia, no al revés", () => {
    expect(computeReconciliationCounts(computations)).toEqual({
      reconciled: 5,
      withDifference: 1,
    });
  });

  it("la única diferencia real es la de VEGA GARCIA, de $41.71", () => {
    const withDifference = GOLDEN_MARCH_2026.filter(
      (_, index) => reconciliationStatusOf(computations[index].difference) === "diferencia",
    );
    expect(withDifference.map((employee) => employee.name)).toEqual([
      "VEGA GARCIA MARIANA DE JESUS",
    ]);
    expect(computations[1].difference).toBeCloseTo(-41.71, 2);
  });
});
