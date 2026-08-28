import { describe, expect, it } from "vitest";
import { emptyFilters, type PygFilters } from "../filters";
import { describePygReport, type ReportSummaryInput } from "./summary";

const ACCOUNTS = [
  { code: "4", name: "Ingresos" },
  { code: "4.1.1.2", name: "Ventas Restaurante" },
  { code: "5.1.5", name: "Gastos Generales" },
];

const VIEWS = [
  { id: "consolidado", name: "Consolidado" },
  { id: "albemarle", name: "Albemarle" },
  { id: "cartago", name: "Cartago" },
];

function input(overrides: Partial<ReportSummaryInput> = {}): ReportSummaryInput {
  return {
    clientName: "Manor Galápagos",
    companyName: "DARWIN & WOLF S.A.",
    sourceSystemId: "monthly-centers",
    mode: "multi",
    filters: emptyFilters(),
    accounts: ACCOUNTS,
    views: VIEWS,
    activeCenterId: "consolidado",
    visibleYears: [2025, 2026],
    frequency: "mensual",
    loadedMonthsByYear: {
      2025: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
      2026: [0, 1, 2, 3, 4, 5, 6],
    },
    generatedAt: new Date(2026, 6, 30, 14, 22),
    ...overrides,
  };
}

function withFilters(overrides: Partial<PygFilters>): PygFilters {
  return { ...emptyFilters(), ...overrides };
}

function field(fields: { label: string; value: string }[], label: string): string | undefined {
  return fields.find((entry) => entry.label === label)?.value;
}

describe("la identidad del informe", () => {
  it("distingue el nombre del cliente de la razón social del archivo", () => {
    const cover = describePygReport(input());

    // They are different things and are NEVER compared: the user calls «Manor Galápagos» what the
    // file calls «DARWIN & WOLF».
    expect(cover.clientName).toBe("Manor Galápagos");
    expect(cover.companyName).toBe("DARWIN & WOLF S.A.");
  });

  it("lleva el logo del cliente a la portada, y sin él no inventa ninguno", () => {
    const logo = {
      dataUrl: "data:image/png;base64,SGk=",
      mime: "image/png" as const,
      width: 640,
      height: 160,
    };
    expect(describePygReport(input({ logo })).logo).toEqual(logo);
    // Like the name: the logo is the user's label and does not come from any file, so a client with
    // no logo leaves the cover exactly as it was.
    expect(describePygReport(input()).logo).toBeUndefined();
  });

  it("nombra el sistema contable en vez de imprimir su id", () => {
    expect(describePygReport(input()).systemLabel).toBe("Mensual por centros de costo");
  });

  it("sin sistema declarado lo dice, en vez de inventarlo", () => {
    expect(describePygReport(input({ sourceSystemId: null })).systemLabel).toBe(
      "Sin sistema declarado",
    );
  });

  it("declara el modo del workspace", () => {
    expect(describePygReport(input()).modeLabel).toBe("Por centros de costo");
    expect(describePygReport(input({ mode: "single" })).modeLabel).toBe("Estado único");
  });

  it("fecha la generación en lenguaje corriente", () => {
    expect(describePygReport(input()).generatedAt).toBe("30 de julio de 2026, 14:22");
  });
});

describe("qué está mirando", () => {
  it("con varios centros marcados dice Consolidado y cuántos suma", () => {
    const cover = describePygReport(
      input({ filters: withFilters({ centerIds: ["albemarle", "cartago"] }) }),
    );

    expect(field(cover.scope, "Centro")).toBe("Consolidado (suma de 2 centros)");
  });

  it("con un centro resuelto lo nombra", () => {
    const cover = describePygReport(input({ activeCenterId: "cartago" }));

    expect(field(cover.scope, "Centro")).toBe("Cartago");
  });

  it("en estado único NO escribe la línea de centro", () => {
    const cover = describePygReport(input({ mode: "single", views: [] }));

    expect(field(cover.scope, "Centro")).toBeUndefined();
    expect(cover.scope.map((entry) => entry.label)).toEqual(["Años", "Granularidad", "Cobertura"]);
  });

  it("escribe la cobertura como rango cuando los meses son contiguos", () => {
    const cover = describePygReport(input());

    expect(field(cover.scope, "Cobertura")).toBe("2025: ene–dic · 2026: ene–jul");
  });

  it("con un hueco en medio los enumera, porque el hueco es lo que hay que ver", () => {
    const cover = describePygReport(
      input({ visibleYears: [2026], loadedMonthsByYear: { 2026: [0, 1, 5] } }),
    );

    expect(field(cover.scope, "Cobertura")).toBe("2026: ene, feb, jun");
  });

  it("un año sin cobertura declarada lo dice", () => {
    const cover = describePygReport(input({ visibleYears: [2026], loadedMonthsByYear: {} }));

    expect(field(cover.scope, "Cobertura")).toBe("2026: sin cobertura declarada");
  });

  it("nombra la granularidad vigente", () => {
    expect(field(describePygReport(input({ frequency: "trimestral" })).scope, "Granularidad")).toBe(
      "Trimestral",
    );
  });
});

describe("los filtros aplicados", () => {
  it("sin nada marcado escribe lo que implica NO haber marcado", () => {
    const cover = describePygReport(input());

    expect(field(cover.filters, "Cuentas")).toBe("Ninguna marcada — el árbol completo");
    expect(field(cover.filters, "Centros")).toBe("Ninguno marcado — el Consolidado");
    expect(field(cover.filters, "Años")).toBe("Ninguno marcado — todos los años cargados");
    expect(field(cover.filters, "Periodos")).toBe("Ninguno marcado — el año completo");
  });

  it("con cuentas marcadas las nombra, con su código", () => {
    const cover = describePygReport(
      input({ filters: withFilters({ codes: ["4.1.1.2", "5.1.5"] }) }),
    );

    expect(field(cover.filters, "Cuentas")).toBe(
      "4.1.1.2 Ventas Restaurante y 5.1.5 Gastos Generales",
    );
  });

  it("una cuenta que la vista resuelta ya no declara sale por su código", () => {
    const cover = describePygReport(input({ filters: withFilters({ codes: ["9.9.9"] }) }));

    expect(field(cover.filters, "Cuentas")).toBe("9.9.9");
  });

  it("con centros, años y periodos marcados los nombra", () => {
    const cover = describePygReport(
      input({
        filters: withFilters({
          centerIds: ["albemarle"],
          years: [2026],
          periods: [
            { frequency: "mensual", index: 0 },
            { frequency: "mensual", index: 2 },
          ],
        }),
      }),
    );

    expect(field(cover.filters, "Centros")).toBe("Albemarle");
    expect(field(cover.filters, "Años")).toBe("2026");
    expect(field(cover.filters, "Periodos")).toBe("Ene y Mar");
  });

  it("en estado único no escribe la línea de centros", () => {
    const cover = describePygReport(input({ mode: "single", views: [] }));

    expect(field(cover.filters, "Centros")).toBeUndefined();
  });

  it("advierte siempre qué significa una celda vacía", () => {
    expect(describePygReport(input()).coverageNote).toBe(
      "Los meses no cargados aparecen vacíos, nunca como cero.",
    );
  });
});
