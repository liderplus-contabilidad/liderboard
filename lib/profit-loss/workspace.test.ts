import { describe, expect, it } from "vitest";
import type { ParsedDataset } from "./types";
import { listCenters } from "./workspace";

function center(centerId: string, year: number, extra: Partial<ParsedDataset> = {}): ParsedDataset {
  return {
    id: `${centerId}-${year}`,
    fileName: "PyG.xlsx",
    uploadedAt: 0,
    companyName: "MANOR S.A.",
    periodLabel: "—",
    year,
    baseFrequency: "mensual",
    role: "center",
    centerId,
    costCenterName: centerId.toUpperCase(),
    accounts: [],
    resultFromFile: [],
    warnings: [],
    ...extra,
  };
}

describe("listCenters", () => {
  it("lista cada centro UNA vez aunque tenga varios años", () => {
    const centers = listCenters([
      center("restaurante", 2025, { order: 0 }),
      center("restaurante", 2026, { order: 0 }),
    ]);
    expect(centers.map((c) => c.id)).toEqual(["restaurante"]);
  });

  // The same order `assignCenterSlots` fixes and the selector already shows: a second idea of what
  // order the centers go in would leave the logo dialog ordered differently from the bar.
  it("va en el orden del selector, no en el de llegada", () => {
    const centers = listCenters([
      center("hospedaje", 2026, { order: 2 }),
      center("restaurante", 2026, { order: 0 }),
      center("sin-centro-de-costo", 2026, { order: 3, role: "sin-centro" }),
      center("cocina", 2026, { order: 1 }),
    ]);
    expect(centers.map((c) => c.id)).toEqual([
      "restaurante",
      "cocina",
      "hospedaje",
      "sin-centro-de-costo",
    ]);
  });

  it("el nombre lo pone el año más reciente: un centro renombrado se lista como se llama hoy", () => {
    const centers = listCenters([
      center("cocina", 2025, { costCenterName: "COCINA" }),
      center("cocina", 2026, { costCenterName: "COCINA CENTRAL" }),
    ]);
    expect(centers[0].name).toBe("COCINA CENTRAL");
  });

  it("un centro sin nombre declarado se lista por su slug en vez de quedarse en blanco", () => {
    const centers = listCenters([center("cartago", 2026, { costCenterName: undefined })]);
    expect(centers[0].name).toBe("cartago");
  });

  it("lleva el color del selector, para que la fila se reconozca desde la barra", () => {
    const centers = listCenters([center("restaurante", 2026, { centerColor: "#1e3a5f" })]);
    expect(centers[0].color).toBe("#1e3a5f");
  });

  // A single statement has no centers, and offering «logos por centro de costo» there would be
  // offering an empty list under a title that promises one.
  it("un workspace de estado único no declara ningún centro", () => {
    expect(listCenters([center("x", 2026, { role: "single", centerId: undefined })])).toEqual([]);
  });
});
