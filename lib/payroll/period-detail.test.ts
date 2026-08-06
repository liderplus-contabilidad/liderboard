import { describe, expect, it } from "vitest";
import {
  computePeriodFinancials,
  computeReconciliationCounts,
  employeeReconciliationStatus,
  matchesEmployeeSearch,
} from "./period-detail";
import type { PayrollEmployeeFigures, PayrollEmployeeLine } from "./types";

function figures(overrides: Partial<PayrollEmployeeFigures> = {}): PayrollEmployeeFigures {
  return { gross: 500, deductions: 50, net: 450, cost: 600, paid: 450, ...overrides };
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
    days: 30,
    ...overrides,
  };
}

describe("employeeReconciliationStatus", () => {
  it("sin figures, no está conciliado ni con diferencia", () => {
    expect(employeeReconciliationStatus(line())).toBe("sin-conciliar");
  });

  it("con figures pero paid === null, tampoco es ninguna de las dos cosas", () => {
    expect(employeeReconciliationStatus(line({ figures: figures({ paid: null }) }))).toBe(
      "sin-conciliar",
    );
  });

  it("paid igual a net: conciliado", () => {
    expect(employeeReconciliationStatus(line({ figures: figures({ net: 450, paid: 450 }) }))).toBe(
      "conciliado",
    );
  });

  it("paid distinto de net: con diferencia", () => {
    expect(employeeReconciliationStatus(line({ figures: figures({ net: 450, paid: 400 }) }))).toBe(
      "diferencia",
    );
  });
});

describe("computeReconciliationCounts", () => {
  it("cuenta conciliados y con diferencia por separado, sin contar el resto en ninguno", () => {
    const lines = [
      line({ id: "a", figures: figures({ net: 450, paid: 450 }) }), // conciliado
      line({ id: "b", figures: figures({ net: 450, paid: 400 }) }), // diferencia
      line({ id: "c", figures: figures({ paid: null }) }), // sin conciliar
      line({ id: "d" }), // sin figures — tampoco cuenta
    ];
    expect(computeReconciliationCounts(lines)).toEqual({ reconciled: 1, withDifference: 1 });
  });

  it("una nómina vacía no cuenta nada", () => {
    expect(computeReconciliationCounts([])).toEqual({ reconciled: 0, withDifference: 0 });
  });
});

describe("computePeriodFinancials", () => {
  it("suma gross/deductions/net/cost SOLO de los empleados con figures", () => {
    const lines = [
      line({ id: "a", figures: figures({ gross: 500, deductions: 50, net: 450, cost: 600 }) }),
      line({ id: "b", figures: figures({ gross: 300, deductions: 30, net: 270, cost: 360 }) }),
      line({ id: "c" }), // sin figures: no debe entrar en la suma
    ];
    expect(computePeriodFinancials(lines)).toEqual({
      gross: 800,
      deductions: 80,
      net: 720,
      cost: 960,
    });
  });

  it("undefined, no cero, cuando NINGÚN empleado tiene figures — el período no recibió su archivo", () => {
    expect(computePeriodFinancials([line(), line({ id: "b" })])).toBeUndefined();
  });

  it("una nómina vacía tampoco tiene totales", () => {
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

describe("conciliación contra las cifras REALES del rol del contador", () => {
  // En el archivo real el líquido (`AP`) es resultado de una fórmula y llega con ruido de coma
  // flotante, mientras lo pagado (`BZ`) está tecleado a mano. Comparados con `===`, estos cuatro
  // salían «con diferencia» por 5,7e-14 y la tarjeta de KPIs decía lo contrario del archivo.
  it.each([
    ["MORALES MENA SILVIA JIMENA", 457.69000000000005, 457.69],
    ["SANDOVAL COLIMBA PEDRO MANUEL", 523.3700000000001, 523.37],
    ["ACOSTA MARIA PASTORA", 520.9899999999999, 520.99],
    ["SORIA CHALA MISHELL FERNANDA", 321.94000000000005, 321.94],
  ])("%s queda conciliado pese al ruido de coma flotante", (_name, net, paid) => {
    expect(employeeReconciliationStatus(line({ figures: figures({ net, paid }) }))).toBe(
      "conciliado",
    );
  });

  it("VEGA GARCIA sí tiene una diferencia real de $41.71", () => {
    expect(
      employeeReconciliationStatus(line({ figures: figures({ net: 516.83, paid: 558.54 }) })),
    ).toBe("diferencia");
  });

  it("un CENTAVO de diferencia sigue siendo una diferencia — la tolerancia es solo del ruido", () => {
    expect(
      employeeReconciliationStatus(line({ figures: figures({ net: 500, paid: 500.01 }) })),
    ).toBe("diferencia");
  });

  it("el archivo real da 5 conciliados y 1 con diferencia, no al revés", () => {
    const counts = computeReconciliationCounts([
      line({ figures: figures({ net: 457.69000000000005, paid: 457.69 }) }),
      line({ figures: figures({ net: 516.83, paid: 558.54 }) }),
      line({ figures: figures({ net: 523.3700000000001, paid: 523.37 }) }),
      line({ figures: figures({ net: 520.9899999999999, paid: 520.99 }) }),
      line({ figures: figures({ net: 521.94, paid: 521.94 }) }),
      line({ figures: figures({ net: 321.94000000000005, paid: 321.94 }) }),
    ]);

    expect(counts).toEqual({ reconciled: 5, withDifference: 1 });
  });
});
