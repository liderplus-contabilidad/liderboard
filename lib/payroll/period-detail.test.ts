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

  // El colapso del ruido sub-centavo es del MOTOR, no de aquí: esta función clasifica lo que
  // aquél ya decidió. Si volviera a compararse por tolerancia en este punto habría dos
  // definiciones de «cuadra» y podrían separarse, que es exactamente lo que pasaba cuando esto
  // comparaba lo que declaraba el archivo mientras el motor comparaba lo tecleado.
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

  // Antes el corte era «ningún empleado trae figures», o sea «no llegó el archivo». Ese estado ya
  // no existe: el motor deriva el rol de la ficha, así que una nómina copiada del mes anterior
  // totaliza desde el primer momento y lo único sin totales es un período SIN empleados.
  it("una nómina sin nada capturado SÍ totaliza: el motor la deriva de la ficha", () => {
    const totals = computePeriodFinancials([
      computeLinePayroll(line(), DEFAULT_PAYROLL_PARAMETERS, []),
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
  // El mismo fixture de oro del motor, leído por la tarjeta de KPIs: así lo que se afirma no es
  // que esta función clasifique bien un número inventado, sino que el archivo del contador da
  // 5 conciliados y 1 con diferencia CUANDO las cifras las calcula la app. Sin esto, el ruido de
  // coma flotante del libro (`457.69000000000005` contra `457.69` tecleado) podría volver a
  // teñir de «con diferencia» a cuatro de los seis y nada lo notaría.
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
