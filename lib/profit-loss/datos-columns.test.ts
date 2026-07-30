import { describe, expect, it } from "vitest";
import type { DatosColumn } from "./datos-types";
import { loadedColumnPositions, visibleColumnPositions } from "./datos-columns";

/** Dos años seguidos, cada uno con sus meses y su Total al cierre. */
function twoYears(): DatosColumn[] {
  return [
    { kind: "period", label: "Ene 25", year: 2025, index: 0 },
    { kind: "period", label: "Feb 25", year: 2025, index: 1 },
    { kind: "total", label: "Total 25", year: 2025 },
    { kind: "period", label: "Ene 26", year: 2026, index: 0 },
    { kind: "period", label: "Feb 26", year: 2026, index: 1 },
    { kind: "total", label: "Total 26", year: 2026 },
  ];
}

describe("qué columnas deja ver el filtro de periodo", () => {
  it("sin periodos marcados, todas", () => {
    expect(visibleColumnPositions(twoYears(), [])).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it("un periodo marcado acota TODOS los años a la vez", () => {
    // Marcar «Ene» es un slot sin año: acota 2025 y 2026 por igual.
    expect(visibleColumnPositions(twoYears(), [{ frequency: "mensual", index: 0 }])).toEqual([
      0, 2, 3, 5,
    ]);
  });

  it("un Total nunca se recorta: es el total del año, no uno de sus periodos", () => {
    const positions = visibleColumnPositions(twoYears(), [{ frequency: "mensual", index: 1 }]);

    expect(positions).toContain(2);
    expect(positions).toContain(5);
  });
});

describe("qué columnas están realmente cargadas", () => {
  it("resuelve la cobertura contra el año de CADA columna", () => {
    const loaded = loadedColumnPositions({
      columns: twoYears(),
      // Enero cargado en 2025, febrero en 2026: nada que ver entre sí.
      loadedMonthsByYear: { 2025: [0], 2026: [1] },
      baseFrequency: "mensual",
      frequency: "mensual",
    });

    // Ene 25 (0) sí, Feb 25 (1) no; Ene 26 (3) NO aunque enero sí exista en 2025, y Feb 26 (4)
    // sí. Los dos Totales (2 y 5) siempre.
    expect([...loaded].sort((a, b) => a - b)).toEqual([0, 2, 4, 5]);
  });

  it("un Total siempre cuenta como cargado: se deriva de lo que su año trajera", () => {
    const loaded = loadedColumnPositions({
      columns: twoYears(),
      loadedMonthsByYear: {},
      baseFrequency: "mensual",
      frequency: "mensual",
    });

    expect([...loaded].sort((a, b) => a - b)).toEqual([2, 5]);
  });

  it("agrega la cobertura cuando la vista es más gruesa que el archivo", () => {
    const columns: DatosColumn[] = [
      { kind: "period", label: "T1", year: 2026, index: 0 },
      { kind: "period", label: "T2", year: 2026, index: 1 },
    ];
    const loaded = loadedColumnPositions({
      columns,
      loadedMonthsByYear: { 2026: [0, 1, 2] },
      baseFrequency: "mensual",
      frequency: "trimestral",
    });

    expect(loaded.has(0)).toBe(true);
    expect(loaded.has(1)).toBe(false);
  });
});
