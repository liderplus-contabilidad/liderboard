import { describe, expect, it } from "vitest";
import { DEFAULT_PAYROLL_PARAMETERS as PARAMS } from "../engine/parameters";
import type { PayrollEmployeeLine } from "../types";
import { emptyFilters, type SalariesFilters } from "./filters";
import type { SalariesSource } from "./grid";
import { buildSalariesReport } from "./report";

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
    provisionsThirteenth: false,
    provisionsFourteenth: false,
    days: 30,
    ...overrides,
  };
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
const ENE_25 = { id: "e25", year: 2025, monthIndex: 0 };

function report(
  data: SalariesSource,
  filters: SalariesFilters = emptyFilters(),
  generatedAt = new Date(2026, 7, 18, 14, 5),
) {
  return buildSalariesReport({
    clientName: "Manor Galápagos",
    source: data,
    filters,
    parameters: PARAMS,
    generatedAt,
  });
}

describe("buildSalariesReport", () => {
  it("el consolidado va primero", () => {
    const data = source([ENE_26], {
      e26: [line({ area: "COCINA" }), line({ area: "VENTAS", idCard: "2" })],
    });

    expect(report(data).sections[0].id).toBe("consolidado");
  });

  it("una sección por área, en el orden del universo", () => {
    const data = source([ENE_26], {
      e26: [
        line({ area: "VENTAS", idCard: "1" }),
        line({ area: "HOSPEDAJE", idCard: "2" }),
        line({ area: "COCINA", idCard: "3" }),
      ],
    });

    const { sections } = report(data);

    expect(sections.map((s) => s.id)).toEqual([
      "consolidado",
      "area:HOSPEDAJE",
      "area:COCINA",
      "area:VENTAS",
    ]);
  });

  it("un área sin cifras en el rango visible no produce sección", () => {
    const data = source([ENE_25, ENE_26], {
      e25: [line({ area: "VENTAS" })],
      e26: [line({ area: "COCINA" })],
    });

    const { sections } = report(data, { ...emptyFilters(), years: [2026] });

    expect(sections.map((s) => s.id)).toEqual(["consolidado", "area:COCINA"]);
  });

  it("el consolidado se pide con areas: [] y cada área con [area]", () => {
    const data = source([ENE_26], {
      e26: [line({ area: "COCINA" }), line({ area: "VENTAS", idCard: "2" })],
    });

    const { sections } = report(data);
    const consolidado = sections.find((s) => s.id === "consolidado");
    const cocina = sections.find((s) => s.id === "area:COCINA");

    // Mismo grid + tarjeta que la pantalla ya construye: el título de `buildSalariesCard` delata
    // el modo con el que se pidió cada sección.
    expect(consolidado?.card.title).toBe("Sueldos por área");
    expect(cocina?.card.title).toBe("Área COCINA");
  });

  it("las marcas de año y mes viajan tal cual y la de área se ignora", () => {
    const data = source([ENE_26, FEB_26], {
      e26: [line({ area: "COCINA" }), line({ area: "VENTAS", idCard: "2" })],
      f26: [line({ area: "COCINA" }), line({ area: "VENTAS", idCard: "2" })],
    });

    // Marcar VENTAS como si se estuviera viendo su detalle en pantalla no recorta el informe:
    // trae igual el consolidado y las DOS áreas.
    const withArea = report(data, { ...emptyFilters(), areas: ["VENTAS"] });
    expect(withArea.sections.map((s) => s.id)).toEqual([
      "consolidado",
      "area:COCINA",
      "area:VENTAS",
    ]);

    // Marcar un mes sí acota las columnas de cada tabla.
    const withMonth = report(data, { ...emptyFilters(), months: [0] });
    const cocina = withMonth.sections.find((s) => s.id === "area:COCINA");
    expect(cocina?.card.table.columns).toEqual(["Ene"]);
  });

  it("la cabecera escribe cliente, rango, número de áreas y fecha", () => {
    const data = source([ENE_26, FEB_26], {
      e26: [line({ area: "COCINA" }), line({ area: "VENTAS", idCard: "2" })],
      f26: [line({ area: "COCINA" }), line({ area: "VENTAS", idCard: "2" })],
    });

    const { header } = report(data, emptyFilters(), new Date(2026, 7, 18, 14, 5));

    expect(header.clientName).toBe("Manor Galápagos");
    expect(header.rangeLabel).toBe("Ene 2026 – Feb 2026");
    expect(header.areaCount).toBe(2);
    expect(header.generatedAt).toBe("18 de agosto de 2026, 14:05");
  });

  it("un rango con hueco se escribe como lista, no como intervalo", () => {
    const data = source([ENE_26, ENE_25], {
      e26: [line()],
      e25: [line()],
    });

    // Enero de dos años distintos: no son meses consecutivos.
    expect(report(data).header.rangeLabel).toBe("Ene 2025, Ene 2026");
  });

  it("un cliente sin nómina da un informe sin secciones", () => {
    const data = source([ENE_26], { e26: [] });

    const { sections, header } = report(data);

    expect(sections).toEqual([]);
    expect(header.areaCount).toBe(0);
  });
});
