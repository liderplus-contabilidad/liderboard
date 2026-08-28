import { describe, expect, it } from "vitest";
import type { DatosColumn } from "./datos-types";
import {
  columnHeaderLabel,
  loadedColumnPositions,
  sliceColumns,
  visibleColumnPositions,
} from "./datos-columns";
import type { DatosGrid } from "./datos-types";

/** Two consecutive years, each with its months and its Total at the close. */
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
    // Marking «Ene» is a slot with no year: it narrows 2025 and 2026 alike.
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
      // January loaded in 2025, February in 2026: nothing to do with each other.
      loadedMonthsByYear: { 2025: [0], 2026: [1] },
      baseFrequency: "mensual",
      frequency: "mensual",
    });

    // Ene 25 (0) yes, Feb 25 (1) no; Ene 26 (3) NO even though January does exist in 2025, and Feb 26
    // (4) yes. Both Totals (2 and 5) always.
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

describe("cómo se nombra una columna", () => {
  const total = twoYears()[2] as DatosColumn;
  const period = twoYears()[0] as DatosColumn;

  it("un Total sin recorte se llama como venía", () => {
    expect(columnHeaderLabel(total, false)).toBe("Total 25");
  });

  it("un Total recortado dice que es del AÑO, no de lo que se ve", () => {
    expect(columnHeaderLabel(total, true)).toBe("Total año 25");
  });

  it("una columna de periodo no cambia con el recorte", () => {
    expect(columnHeaderLabel(period, true)).toBe("Ene 25");
    expect(columnHeaderLabel(period, false)).toBe("Ene 25");
  });
});

describe("quedarse con unas columnas", () => {
  const grid: DatosGrid = {
    id: "default",
    title: "Estado",
    columns: twoYears(),
    rows: [
      {
        code: "4",
        name: "Ingresos",
        level: 1,
        cells: [{ value: 1 }, { value: 2 }, { value: 3 }, { value: 4 }, { value: 5 }, { value: 6 }],
        children: [
          {
            code: "4.1",
            name: "Ventas",
            level: 2,
            cells: [
              { value: 1 },
              { value: 2 },
              { value: 3 },
              { value: 4 },
              { value: 5 },
              { value: 6 },
            ],
          },
        ],
      },
    ],
  };

  it("realinea las celdas de toda la rama", () => {
    const sliced = sliceColumns(grid, [3, 4, 5]);
    expect(sliced.columns.map((column) => column.label)).toEqual(["Ene 26", "Feb 26", "Total 26"]);
    expect(sliced.rows[0]?.cells.map((cell) => cell.value)).toEqual([4, 5, 6]);
    expect(sliced.rows[0]?.children?.[0]?.cells.map((cell) => cell.value)).toEqual([4, 5, 6]);
  });

  it("devuelve el mismo grid cuando no hay nada que quitar", () => {
    expect(sliceColumns(grid, [0, 1, 2, 3, 4, 5])).toBe(grid);
  });
});
