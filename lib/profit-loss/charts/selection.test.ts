import { describe, expect, it } from "vitest";
import {
  CHART_MAX_SERIES,
  CHART_NEUTRAL,
  CHART_PALETTE,
  CHART_SECTION,
} from "@/lib/charts/palette";
import { buildSeries } from "../analytics/series";
import { makeSource } from "../analytics/fixtures";
import { emptyFilters, type PygFilters } from "../filters";
import type { AnalyticsSource } from "../analytics/types";
import {
  activeSource,
  codeColorResolver,
  colorResolver,
  DEFAULT_FOCUS_CODE,
  shapeFor,
  toSeriesQuery,
  type SelectionContext,
} from "./selection";

const HABITACIONES = "4.1.1.1.1.1";
const RESTAURANTE = "4.1.1.2";

const MANOR = withIdentity(makeSource(), "cultura-manor", "Cultura Manor");
const PRINCIPAL = withIdentity(
  // The real second center is ~100× smaller and never reports Ventas Lavandería.
  makeSource({ centerId: "centro-de-costo-principal", scale: 0.01, omit: ["4.1.1.5"] }),
  "centro-de-costo-principal",
  "Centro de Costo Principal",
);
const CONSOLIDADO = withIdentity(makeSource(), "consolidado", "Consolidado");

const SOURCES = [CONSOLIDADO, MANOR, PRINCIPAL];

function withIdentity(source: AnalyticsSource, centerId: string, centerName: string) {
  return { ...source, centerId, centerName };
}

function makeContext(overrides: Partial<SelectionContext> = {}): SelectionContext {
  return {
    sources: SOURCES,
    activeCenterId: "cultura-manor",
    frequency: "mensual",
    year: 2026,
    centers: [
      { id: "cultura-manor", name: "Cultura Manor", kind: "centro" as const },
      {
        id: "centro-de-costo-principal",
        name: "Centro de Costo Principal",
        kind: "centro" as const,
      },
    ],
    ...overrides,
  };
}

function makeFilters(overrides: Partial<PygFilters> = {}): PygFilters {
  return { ...emptyFilters(), ...overrides };
}

describe("traducción de los filtros a una consulta", () => {
  it("asks for Ingresos on the resolved center with nothing marked", () => {
    const query = toSeriesQuery(makeFilters(), makeContext());

    expect(query.codes).toEqual([DEFAULT_FOCUS_CODE]);
    expect(query.centerIds).toEqual(["cultura-manor"]);
    expect(query.years).toEqual([2026]);
    expect(buildSeries(SOURCES, query).series).toHaveLength(1);
  });

  it("carries whatever accounts are marked", () => {
    const query = toSeriesQuery(makeFilters({ codes: [HABITACIONES] }), makeContext());

    expect(query.codes).toEqual([HABITACIONES]);
  });

  it("comparing centers is just marking several centers — no axis to declare", () => {
    const query = toSeriesQuery(
      makeFilters({
        codes: [HABITACIONES],
        centerIds: ["cultura-manor", "centro-de-costo-principal"],
      }),
      makeContext(),
    );

    expect(query.codes).toEqual([HABITACIONES]);
    expect(query.centerIds).toEqual(["cultura-manor", "centro-de-costo-principal"]);
  });

  it("produces the cartesian product of both axes whenever both are populated", () => {
    const query = toSeriesQuery(
      makeFilters({
        codes: [HABITACIONES, RESTAURANTE],
        centerIds: ["consolidado", "cultura-manor", "centro-de-costo-principal"],
      }),
      makeContext(),
    );

    expect(query.codes).toHaveLength(2);
    expect(query.centerIds).toHaveLength(3);
    expect(buildSeries(SOURCES, query).series).toHaveLength(6);
  });

  it("always takes the frequency from the shared control", () => {
    const filters = makeFilters({ codes: [HABITACIONES] });

    expect(toSeriesQuery(filters, makeContext()).frequency).toBe("mensual");
    expect(toSeriesQuery(filters, makeContext({ frequency: "trimestral" })).frequency).toBe(
      "trimestral",
    );
  });

  it("never exceeds the chart cap nor departs from the context frequency", () => {
    const everyFilterShape = [
      makeFilters(),
      makeFilters({ codes: [HABITACIONES, RESTAURANTE] }),
      makeFilters({ centerIds: ["consolidado", "cultura-manor"] }),
      makeFilters({
        codes: [HABITACIONES, RESTAURANTE],
        centerIds: ["consolidado", "cultura-manor", "centro-de-costo-principal"],
      }),
    ];

    for (const frequency of ["mensual", "trimestral", "semestral", "anual"] as const) {
      for (const filters of everyFilterShape) {
        const query = toSeriesQuery(filters, makeContext({ frequency }));
        expect(query.limit).toBe(CHART_MAX_SERIES);
        expect(query.limit).toBeLessThanOrEqual(8);
        expect(query.frequency).toBe(frequency);
      }
    }
  });

  it("narrows the X axis when periods are marked, without turning them into series", () => {
    const periods = [
      { year: 2026, frequency: "mensual" as const, index: 0 },
      { year: 2026, frequency: "mensual" as const, index: 1 },
    ];
    const query = toSeriesQuery(makeFilters({ codes: [HABITACIONES], periods }), makeContext());

    expect(query.periods).toEqual(periods);
    expect(buildSeries(SOURCES, query).periods).toHaveLength(2);
    expect(buildSeries(SOURCES, query).series).toHaveLength(1);
  });
});

describe("tope de series de una gráfica", () => {
  it("draws everything and warns about nothing when the selection fits", () => {
    const codes = [...MANOR.valuesByCode.keys()].slice(0, 6);
    const bundle = buildSeries(SOURCES, toSeriesQuery(makeFilters({ codes }), makeContext()));

    expect(bundle.series).toHaveLength(6);
    expect(bundle.truncated).toBe(0);
    expect(bundle.warnings).toEqual([]);
  });

  it("draws eight and says in Spanish how many it dropped when the selection is wider", () => {
    // 4 accounts × 4 centers would be 16 series; the palette has eight slots.
    const codes = [...MANOR.valuesByCode.keys()].slice(0, 4);
    const filters = makeFilters({
      codes,
      centerIds: ["consolidado", "cultura-manor", "centro-de-costo-principal"],
    });
    const bundle = buildSeries(SOURCES, toSeriesQuery(filters, makeContext()));

    expect(bundle.series).toHaveLength(CHART_MAX_SERIES);
    expect(bundle.truncated).toBe(4);
    expect(bundle.warnings[0]).toContain("se descartaron 4");
  });
});

describe("shapeFor", () => {
  it("clamps a shape the transformation does not admit", () => {
    expect(shapeFor("index100", "pastel")).toBe("linea");
    expect(shapeFor("pct-contenedor", "linea")).toBe("barras-100");
    expect(shapeFor("montos", "linea")).toBe("linea");
  });

  it("no le ofrece otra forma a la cascada", () => {
    // Una cascada dibujada como pastel o como línea no dice nada: la única forma es la suya.
    expect(shapeFor("cascada", "pastel")).toBe("cascada");
    expect(shapeFor("cascada", "linea")).toBe("cascada");
  });
});

describe("resolución de color", () => {
  it("follows the WORKSPACE's center order, not the marked order, so a dropped center repaints nothing", () => {
    const filters = makeFilters({ centerIds: ["cultura-manor", "centro-de-costo-principal"] });
    const color = colorResolver(filters, makeContext());

    // The Consolidado is slot 0 of the workspace even though it is not marked here.
    expect(color({ code: HABITACIONES, centerId: "cultura-manor", year: 2026 })).toBe(
      CHART_PALETTE[1],
    );
    expect(color({ code: HABITACIONES, centerId: "centro-de-costo-principal", year: 2026 })).toBe(
      CHART_PALETTE[2],
    );
  });

  it("does not repaint the remaining centers when one leaves the selection", () => {
    const three = makeFilters({
      centerIds: ["consolidado", "cultura-manor", "centro-de-costo-principal"],
    });
    const two = makeFilters({ centerIds: ["cultura-manor", "centro-de-costo-principal"] });
    const key = { code: HABITACIONES, centerId: "centro-de-costo-principal", year: 2026 };

    expect(colorResolver(two, makeContext())(key)).toBe(colorResolver(three, makeContext())(key));
  });

  it("gives each compared account its own slot, in the order the query names them", () => {
    const filters = makeFilters({ codes: [HABITACIONES, RESTAURANTE] });
    const color = colorResolver(filters, makeContext());

    expect(color({ code: HABITACIONES, centerId: "cultura-manor", year: 2026 })).toBe(
      CHART_PALETTE[0],
    );
    expect(color({ code: RESTAURANTE, centerId: "cultura-manor", year: 2026 })).toBe(
      CHART_PALETTE[1],
    );
  });

  it("orders by-center colors by the workspace, not by the filter's own list", () => {
    const filters = makeFilters({ centerIds: ["centro-de-costo-principal", "cultura-manor"] });
    const key = { code: HABITACIONES, centerId: "centro-de-costo-principal", year: 2026 };

    // SOURCES is [consolidado, cultura-manor, centro-de-costo-principal] — slot 2, regardless
    // of which order the two centers were marked in.
    expect(colorResolver(filters, makeContext())(key)).toBe(CHART_PALETTE[2]);
  });

  it("colors by the (cuenta, centro) pair once both axes are populated", () => {
    const filters = makeFilters({
      codes: [HABITACIONES, RESTAURANTE],
      centerIds: ["cultura-manor", "centro-de-costo-principal"],
    });
    const color = colorResolver(filters, makeContext());

    const first = color({ code: HABITACIONES, centerId: "cultura-manor", year: 2026 });
    const second = color({ code: HABITACIONES, centerId: "centro-de-costo-principal", year: 2026 });
    const third = color({ code: RESTAURANTE, centerId: "cultura-manor", year: 2026 });

    expect(new Set([first, second, third]).size).toBe(3);
  });

  it("colors a preset's own codes rather than the whole chart of accounts", () => {
    // "5.1" sits far down the file; against the full account list it would land past the eighth
    // slot and come out neutral, which is why the universe is what the query names.
    const color = codeColorResolver(["4.1", "5.1"]);

    expect(color({ code: "4.1", centerId: "cultura-manor", year: 2026 })).toBe(CHART_PALETTE[0]);
    expect(color({ code: "5.1", centerId: "cultura-manor", year: 2026 })).toBe(CHART_PALETTE[1]);
  });

  it("comparar las RAÍCES pinta cada bloque con su color de Datos", () => {
    // Ahí el color deja de ser identidad arbitraria y dice de qué bloque habla la serie — y tiene
    // que querer decir lo mismo que en la tabla.
    const color = codeColorResolver(["4", "5", "6"]);

    expect(color({ code: "4", centerId: "cultura-manor", year: 2026 })).toBe(CHART_SECTION.income);
    expect(color({ code: "5", centerId: "cultura-manor", year: 2026 })).toBe(CHART_SECTION.cost);
    expect(color({ code: "6", centerId: "cultura-manor", year: 2026 })).toBe(CHART_SECTION.other);
  });

  it("pero cuentas de un mismo bloque vuelven a tomar ranura, o serían todas del mismo verde", () => {
    const color = codeColorResolver(["4.1.01", "4.1.02", "4.1.03"]);

    expect(color({ code: "4.1.01", centerId: "cultura-manor", year: 2026 })).toBe(CHART_PALETTE[0]);
    expect(color({ code: "4.1.02", centerId: "cultura-manor", year: 2026 })).toBe(CHART_PALETTE[1]);
    expect(color({ code: "4.1.03", centerId: "cultura-manor", year: 2026 })).toBe(CHART_PALETTE[2]);
  });

  it("gives a ninth entity the neutral rather than a generated color", () => {
    const codes = [...MANOR.valuesByCode.keys()].slice(0, 12);
    const filters = makeFilters({ codes });
    const color = colorResolver(filters, makeContext());

    expect(color({ code: codes[8], centerId: "cultura-manor", year: 2026 })).toBe(CHART_NEUTRAL);
  });
});

describe("activeSource", () => {
  it("finds the source matching the resolved center", () => {
    expect(activeSource(makeContext())?.centerId).toBe("cultura-manor");
    expect(activeSource(makeContext({ activeCenterId: "consolidado" }))?.centerId).toBe(
      "consolidado",
    );
  });
});
