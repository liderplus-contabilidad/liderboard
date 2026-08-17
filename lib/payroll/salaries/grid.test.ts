import { describe, expect, it } from "vitest";
import { computeLinePayroll } from "../employee-input";
import { DEFAULT_PAYROLL_PARAMETERS as PARAMS } from "../engine/parameters";
import type { PayrollEmployeeLine } from "../types";
import { emptyFilters, type SalariesFilters } from "./filters";
import { buildSalariesGrid, resolveAreaMode, salariesUniverse, type SalariesSource } from "./grid";

/** Una ficha mínima y válida; solo se le pasa lo que cada caso necesita distinguir. */
function line(overrides: Partial<PayrollEmployeeLine> = {}): PayrollEmployeeLine {
  return {
    id: crypto.randomUUID(),
    periodId: "p",
    name: "EMPLEADO",
    role: "CARGO",
    area: "COCINA",
    baseSalary: 500,
    contractType: "CT",
    idCard: "1712345678",
    hireDate: null,
    sectorCode: "",
    hasReserveFund: false,
    accumulatesReserveFund: false,
    days: 30,
    ...overrides,
  };
}

/** El costo que el MOTOR deriva de esa ficha: el grid no puede inventarse otro. */
function cost(overrides: Partial<PayrollEmployeeLine> = {}): number {
  return computeLinePayroll(line(overrides), PARAMS, []).employerCost;
}

function source(
  periods: readonly { id: string; year: number; monthIndex: number }[],
  lines: Record<string, PayrollEmployeeLine[]>,
): SalariesSource {
  return {
    periods,
    linesByPeriod: new Map(
      Object.entries(lines).map(([id, own]) => [id, own.map((l) => ({ ...l, periodId: id }))]),
    ),
  };
}

const ENE_26 = { id: "e26", year: 2026, monthIndex: 0 };
const FEB_26 = { id: "f26", year: 2026, monthIndex: 1 };
const MAR_26 = { id: "m26", year: 2026, monthIndex: 2 };
const ENE_25 = { id: "e25", year: 2025, monthIndex: 0 };

function withAreas(areas: string[]): SalariesFilters {
  return { ...emptyFilters(), areas };
}

describe("resolveAreaMode", () => {
  it("sin áreas marcadas es consolidado", () => {
    expect(resolveAreaMode(emptyFilters())).toEqual({ mode: "consolidado", area: null });
  });

  it("exactamente un área marcada es el detalle de esa área", () => {
    expect(resolveAreaMode(withAreas(["VENTAS"]))).toEqual({ mode: "detalle", area: "VENTAS" });
  });

  it("dos áreas marcadas siguen siendo consolidado", () => {
    expect(resolveAreaMode(withAreas(["COCINA", "VENTAS"])).mode).toBe("consolidado");
  });
});

describe("salariesUniverse", () => {
  it("ofrece solo las áreas que la nómina realmente contiene, en orden estándar", () => {
    const data = source([ENE_26], { e26: [line({ area: "VENTAS" }), line({ area: "HOSPEDAJE" })] });

    expect(salariesUniverse(data).areas).toEqual(["HOSPEDAJE", "VENTAS"]);
  });

  it("incluye un área que la lista estándar no conoce, detrás de las estándar", () => {
    const data = source([ENE_26], {
      e26: [line({ area: "MANTENIMIENTO" }), line({ area: "COCINA" })],
    });

    expect(salariesUniverse(data).areas).toEqual(["COCINA", "MANTENIMIENTO"]);
  });

  it("los años y meses son los de los períodos registrados", () => {
    const data = source([MAR_26, ENE_25], { m26: [line()], e25: [line()] });

    expect(salariesUniverse(data).years).toEqual([2025, 2026]);
    expect(salariesUniverse(data).months).toEqual([0, 2]);
  });
});

describe("las columnas", () => {
  it("son los períodos existentes, en orden cronológico", () => {
    const data = source([MAR_26, ENE_26, FEB_26], {
      e26: [line()],
      f26: [line()],
      m26: [line()],
    });

    const grid = buildSalariesGrid(data, emptyFilters(), PARAMS);

    expect(grid.columns.map((c) => c.label)).toEqual(["Ene", "Feb", "Mar"]);
  });

  it("un mes sin período no produce columna", () => {
    // Enero y marzo cargados, febrero no: dos columnas, sin hueco entre ellas.
    const data = source([ENE_26, MAR_26], { e26: [line()], m26: [line()] });

    const grid = buildSalariesGrid(data, emptyFilters(), PARAMS);

    expect(grid.columns.map((c) => c.label)).toEqual(["Ene", "Mar"]);
  });

  it("con un solo año a la vista el rótulo no lo nombra", () => {
    const data = source([ENE_26, FEB_26], { e26: [line()], f26: [line()] });

    expect(buildSalariesGrid(data, emptyFilters(), PARAMS).columns.map((c) => c.label)).toEqual([
      "Ene",
      "Feb",
    ]);
  });

  it("con dos años a la vista cada rótulo lleva el suyo", () => {
    const data = source([ENE_25, ENE_26, FEB_26], {
      e25: [line()],
      e26: [line()],
      f26: [line()],
    });

    expect(buildSalariesGrid(data, emptyFilters(), PARAMS).columns.map((c) => c.label)).toEqual([
      "Ene 25",
      "Ene 26",
      "Feb 26",
    ]);
  });

  it("un mes marcado atraviesa los años", () => {
    const data = source([ENE_25, ENE_26, FEB_26], {
      e25: [line()],
      e26: [line()],
      f26: [line()],
    });

    const grid = buildSalariesGrid(data, { ...emptyFilters(), months: [0] }, PARAMS);

    expect(grid.columns.map((c) => c.label)).toEqual(["Ene 25", "Ene 26"]);
  });

  it("marcar un año deja de nombrarlo en los rótulos", () => {
    const data = source([ENE_25, ENE_26, FEB_26], {
      e25: [line()],
      e26: [line()],
      f26: [line()],
    });

    const grid = buildSalariesGrid(data, { ...emptyFilters(), years: [2026] }, PARAMS);

    expect(grid.columns.map((c) => c.label)).toEqual(["Ene", "Feb"]);
  });
});

describe("el consolidado por área", () => {
  it("suma cada área por separado y ordena por el universo", () => {
    const data = source([ENE_26], {
      e26: [
        line({ area: "VENTAS", idCard: "1", baseSalary: 500 }),
        line({ area: "COCINA", idCard: "2", baseSalary: 600 }),
        line({ area: "COCINA", idCard: "3", baseSalary: 700 }),
      ],
    });

    const grid = buildSalariesGrid(data, emptyFilters(), PARAMS);

    expect(grid.rows.map((r) => r.label)).toEqual(["COCINA", "VENTAS"]);
    expect(grid.rows[0].values[0]).toBeCloseTo(
      cost({ baseSalary: 600 }) + cost({ baseSalary: 700 }),
      8,
    );
    expect(grid.rows[1].values[0]).toBeCloseTo(cost({ baseSalary: 500 }), 8);
  });

  it("un área sin fichas ese mes queda vacía, no en cero", () => {
    const data = source([ENE_26, FEB_26], {
      e26: [line({ area: "COCINA", idCard: "1" })],
      f26: [line({ area: "COCINA", idCard: "1" }), line({ area: "VENTAS", idCard: "2" })],
    });

    const grid = buildSalariesGrid(data, emptyFilters(), PARAMS);
    const ventas = grid.rows.find((r) => r.label === "VENTAS");

    expect(ventas?.values[0]).toBeNull();
    expect(ventas?.values[1]).not.toBeNull();
  });

  it("un cero real se distingue de un hueco", () => {
    // Cero días pagados: la ficha SÍ está en la nómina y su costo es cero de verdad.
    const data = source([ENE_26], { e26: [line({ area: "VENTAS", days: 0 })] });

    const grid = buildSalariesGrid(data, emptyFilters(), PARAMS);

    expect(grid.rows[0].values[0]).toBe(0);
    expect(grid.rows[0].values[0]).not.toBeNull();
  });

  it("marcar áreas deja solo esas filas", () => {
    const data = source([ENE_26], {
      e26: [
        line({ area: "COCINA", idCard: "1" }),
        line({ area: "VENTAS", idCard: "2" }),
        line({ area: "HOSPEDAJE", idCard: "3" }),
      ],
    });

    const grid = buildSalariesGrid(data, withAreas(["COCINA", "VENTAS"]), PARAMS);

    expect(grid.rows.map((r) => r.label)).toEqual(["COCINA", "VENTAS"]);
  });

  it("un área sin datos en el rango visible no produce fila", () => {
    const data = source([ENE_25, ENE_26], {
      e25: [line({ area: "VENTAS" })],
      e26: [line({ area: "COCINA" })],
    });

    const grid = buildSalariesGrid(data, { ...emptyFilters(), years: [2026] }, PARAMS);

    expect(grid.rows.map((r) => r.label)).toEqual(["COCINA"]);
  });
});

describe("el detalle de un área", () => {
  it("una fila por empleado, alfabética, con su cargo", () => {
    const data = source([ENE_26], {
      e26: [
        line({ area: "VENTAS", name: "SORIA CHALA MISHELL", role: "RECEPCIONISTA", idCard: "2" }),
        line({ area: "VENTAS", name: "SANDOVAL ACOSTA LUIS", role: "RECEPCIONISTA", idCard: "1" }),
        line({ area: "COCINA", name: "OTRO", idCard: "3" }),
      ],
    });

    const grid = buildSalariesGrid(data, withAreas(["VENTAS"]), PARAMS);

    expect(grid.mode).toBe("detalle");
    expect(grid.rows.map((r) => r.label)).toEqual(["SANDOVAL ACOSTA LUIS", "SORIA CHALA MISHELL"]);
    expect(grid.rows[0].sublabel).toBe("RECEPCIONISTA");
  });

  it("una misma persona a lo largo de tres meses es UNA fila", () => {
    const persona = { area: "VENTAS", name: "SANDOVAL", idCard: "1712345678" };
    const data = source([ENE_26, FEB_26, MAR_26], {
      e26: [line(persona)],
      f26: [line(persona)],
      m26: [line(persona)],
    });

    const grid = buildSalariesGrid(data, withAreas(["VENTAS"]), PARAMS);

    expect(grid.rows).toHaveLength(1);
    expect(grid.rows[0].values.every((v) => v !== null)).toBe(true);
  });

  it("un empleado que ingresó a mitad del rango deja vacíos los meses anteriores", () => {
    const sandoval = { area: "VENTAS", name: "SANDOVAL", idCard: "1" };
    const soria = { area: "VENTAS", name: "SORIA", idCard: "2" };
    const data = source([ENE_26, FEB_26, MAR_26], {
      e26: [line(sandoval)],
      f26: [line(sandoval)],
      m26: [line(sandoval), line(soria)],
    });

    const grid = buildSalariesGrid(data, withAreas(["VENTAS"]), PARAMS);
    const fila = grid.rows.find((r) => r.label === "SORIA");

    expect(fila?.values[0]).toBeNull();
    expect(fila?.values[1]).toBeNull();
    expect(fila?.values[2]).not.toBeNull();
  });

  it("toma el cargo de la ficha más reciente", () => {
    const data = source([ENE_26, MAR_26], {
      e26: [line({ area: "VENTAS", name: "SANDOVAL", idCard: "1", role: "RECEPCIONISTA" })],
      m26: [line({ area: "VENTAS", name: "SANDOVAL", idCard: "1", role: "JEFE DE VENTAS" })],
    });

    const grid = buildSalariesGrid(data, withAreas(["VENTAS"]), PARAMS);

    expect(grid.rows[0].sublabel).toBe("JEFE DE VENTAS");
  });
});

describe("un empleado que cambia de área", () => {
  const enero = { area: "COCINA", name: "PEREZ", idCard: "1" };
  const resto = { area: "VENTAS", name: "PEREZ", idCard: "1" };
  const data = source([ENE_26, FEB_26], { e26: [line(enero)], f26: [line(resto)] });

  it("en el consolidado suma cada mes bajo el área en la que estuvo", () => {
    const grid = buildSalariesGrid(data, emptyFilters(), PARAMS);
    const cocina = grid.rows.find((r) => r.label === "COCINA");
    const ventas = grid.rows.find((r) => r.label === "VENTAS");

    expect(cocina?.values).toEqual([cost(), null]);
    expect(ventas?.values).toEqual([null, cost()]);
  });

  it("en el detalle de un área, sus meses en la otra quedan vacíos", () => {
    const grid = buildSalariesGrid(data, withAreas(["VENTAS"]), PARAMS);

    expect(grid.rows).toHaveLength(1);
    expect(grid.rows[0].values[0]).toBeNull();
    expect(grid.rows[0].values[1]).toBeCloseTo(cost(), 8);
  });
});

describe("la fila de cierre", () => {
  it("se rotula TOTAL en consolidado y SUBTOTAL en el detalle", () => {
    const data = source([ENE_26], { e26: [line({ area: "VENTAS" })] });

    expect(buildSalariesGrid(data, emptyFilters(), PARAMS).total?.label).toBe("TOTAL");
    expect(buildSalariesGrid(data, withAreas(["VENTAS"]), PARAMS).total?.label).toBe("SUBTOTAL");
  });

  it("suma SOLO las filas presentes, no el universo", () => {
    const data = source([ENE_26], {
      e26: [
        line({ area: "COCINA", idCard: "1", baseSalary: 600 }),
        line({ area: "VENTAS", idCard: "2", baseSalary: 500 }),
        line({ area: "HOSPEDAJE", idCard: "3", baseSalary: 900 }),
      ],
    });

    const grid = buildSalariesGrid(data, withAreas(["COCINA", "VENTAS"]), PARAMS);

    expect(grid.total?.values[0]).toBeCloseTo(
      cost({ baseSalary: 600 }) + cost({ baseSalary: 500 }),
      8,
    );
  });

  it("una columna donde solo una fila tiene datos totaliza esa fila", () => {
    const data = source([ENE_26, FEB_26], {
      e26: [line({ area: "COCINA", idCard: "1" })],
      f26: [line({ area: "COCINA", idCard: "1" }), line({ area: "VENTAS", idCard: "2" })],
    });

    const grid = buildSalariesGrid(data, emptyFilters(), PARAMS);
    const cocina = grid.rows.find((r) => r.label === "COCINA");

    expect(grid.total?.values[0]).toBeCloseTo(cocina?.values[0] as number, 8);
  });

  it("una columna sin ninguna fila con valor no tiene total", () => {
    // Febrero registrado pero con la nómina vacía.
    const data = source([ENE_26, FEB_26], { e26: [line({ area: "COCINA" })], f26: [] });

    const grid = buildSalariesGrid(data, emptyFilters(), PARAMS);

    expect(grid.columns).toHaveLength(2);
    expect(grid.total?.values[1]).toBeNull();
  });

  it("no hay fila de cierre sin filas que cerrar", () => {
    const data = source([ENE_26], { e26: [] });

    const grid = buildSalariesGrid(data, emptyFilters(), PARAMS);

    expect(grid.rows).toEqual([]);
    expect(grid.total).toBeNull();
  });
});
