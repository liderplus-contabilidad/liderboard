import { describe, expect, it } from "vitest";
import { makeSource } from "../analytics/fixtures";
import { buildCentersAnnex, type CentersAnnexInput } from "./centers-annex";
import type { CentersAnnex } from "./types";

/** Cultura Manor bills 25,229 against 20,121 a month, Ene–Jul; the other center is 100× smaller. */
const MANOR = makeSource();
const PRINCIPAL = makeSource({
  centerId: "centro-de-costo-principal",
  centerName: "Centro de Costo Principal",
  scale: 0.01,
  omit: ["4.1.1.5"],
});
const SEGMENTADO = makeSource({ segmented: true });

const CENTERS = [
  { id: "cultura-manor", name: "Cultura Manor" },
  { id: "centro-de-costo-principal", name: "Centro de Costo Principal" },
];

function annex(overrides: Partial<CentersAnnexInput> = {}): CentersAnnex {
  return buildCentersAnnex({
    centers: CENTERS,
    sources: [MANOR, PRINCIPAL],
    years: [2026],
    frequency: "mensual",
    ...overrides,
  });
}

function rowValues(result: CentersAnnex, id: string): (number | null)[] {
  return result.rows.find((row) => row.id === id)?.values ?? [];
}

describe("las columnas del anexo", () => {
  it("una por centro más el Consolidado que cierra", () => {
    expect(annex().columns.map((column) => column.id)).toEqual([
      "cultura-manor",
      "centro-de-costo-principal",
      "consolidado",
    ]);
  });
});

describe("las filas del anexo", () => {
  it("suma cada centro sobre todo lo que el informe cubre", () => {
    const [manor, principal] = rowValues(annex(), "ingresos");

    // Seven months loaded at 25,229 — minus the 300 of «Ventas Eventos», which the hotel does not
    // bill in February. That zero is REAL and goes into the sum as such; what would never go in is an
    // unloaded month.
    expect(manor).toBeCloseTo(25229 * 7 - 300, 6);
    // The other center is 1% of the first and also does not report «Ventas Lavandería» (327).
    expect(principal).toBeCloseTo((25229 - 327) * 7 * 0.01 - 300 * 0.01, 6);
  });

  it("el Consolidado es la suma de los centros", () => {
    const values = rowValues(annex(), "ingresos");

    expect(values[2]).toBeCloseTo((values[0] ?? 0) + (values[1] ?? 0), 6);
  });

  it("la utilidad es ingresos menos gastos, columna a columna", () => {
    const result = annex();
    const ingresos = rowValues(result, "ingresos");
    const gastos = rowValues(result, "gastos");
    const utilidad = rowValues(result, "utilidad");

    utilidad.forEach((value, index) => {
      expect(value).toBeCloseTo((ingresos[index] ?? 0) - (gastos[index] ?? 0), 6);
    });
  });

  it("un estado SIN segmentar no lleva la fila de no operacionales", () => {
    expect(annex().rows.map((row) => row.id)).toEqual(["ingresos", "gastos", "utilidad", "margen"]);
  });

  it("un estado segmentado la lleva, y la resta al resultado", () => {
    const result = annex({
      centers: [{ id: "cultura-manor", name: "Cultura Manor" }],
      sources: [SEGMENTADO],
    });

    expect(result.rows.map((row) => row.id)).toContain("no-operativos");

    const ingresos = rowValues(result, "ingresos")[0] ?? 0;
    const gastos = rowValues(result, "gastos")[0] ?? 0;
    const noOperativos = rowValues(result, "no-operativos")[0] ?? 0;

    // 900 a month in root 6: leaving it out would give a profit 6,300 higher.
    expect(noOperativos).toBeCloseTo(900 * 7, 6);
    expect(rowValues(result, "utilidad")[0]).toBeCloseTo(ingresos - gastos - noOperativos, 6);
  });
});

describe("el margen", () => {
  it("es la utilidad sobre los ingresos de SU columna", () => {
    const result = annex();
    const utilidad = rowValues(result, "utilidad");
    const ingresos = rowValues(result, "ingresos");
    const margen = rowValues(result, "margen");

    margen.forEach((value, index) => {
      expect(value).toBeCloseTo(((utilidad[index] ?? 0) / (ingresos[index] ?? 1)) * 100, 6);
    });
  });

  it("el del Consolidado es la razón de las sumas, no el promedio de los centros", () => {
    const result = annex();
    const margen = rowValues(result, "margen");
    const [manor, principal, consolidado] = margen;
    const promedio = ((manor ?? 0) + (principal ?? 0)) / 2;

    // With these two centers the average and the ratio almost coincide; what is fixed is that the
    // Consolidado is computed from its own sums and not by averaging columns.
    expect(consolidado).toBeCloseTo(
      ((rowValues(result, "utilidad")[2] ?? 0) / (rowValues(result, "ingresos")[2] ?? 1)) * 100,
      6,
    );
    expect(consolidado).not.toBe(promedio);
  });
});

describe("la cobertura", () => {
  it("un centro sin un solo periodo cubierto queda VACÍO, no en cero", () => {
    const vacio = makeSource({ centerId: "centro-vacio", centerName: "Centro Vacío", months: 0 });
    const result = annex({
      centers: [...CENTERS, { id: "centro-vacio", name: "Centro Vacío" }],
      sources: [MANOR, PRINCIPAL, vacio],
    });

    expect(rowValues(result, "ingresos")[2]).toBeNull();
    expect(rowValues(result, "margen")[2]).toBeNull();
  });

  it("un periodo marcado acota lo que se suma", () => {
    const result = annex({
      periods: [{ year: 2026, frequency: "mensual", index: 0 }],
    });

    // A single month instead of the seven.
    expect(rowValues(result, "ingresos")[0]).toBeCloseTo(25229, 6);
  });
});
