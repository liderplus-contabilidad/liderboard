import { describe, expect, it } from "vitest";
import type { DatosColumn, DatosGrid, DatosRow } from "../datos-types";
import { accumulateStatement, findRow, sharePct, variationPct } from "./accumulate";

/** Two years side by side, exactly as `toDatosGridMultiYear` lays them out: periods then Total. */
const COLUMNS: DatosColumn[] = [
  { kind: "period", label: "Ene 25", year: 2025, index: 0 },
  { kind: "period", label: "Feb 25", year: 2025, index: 1 },
  { kind: "period", label: "Mar 25", year: 2025, index: 2 },
  { kind: "total", label: "Total 25", year: 2025 },
  { kind: "period", label: "Ene 26", year: 2026, index: 0 },
  { kind: "period", label: "Feb 26", year: 2026, index: 1 },
  { kind: "period", label: "Mar 26", year: 2026, index: 2 },
  { kind: "total", label: "Total 26", year: 2026 },
];

const EVERY_COLUMN = COLUMNS.map((_, position) => position);

function row(code: string, values: (number | null)[], children?: DatosRow[]): DatosRow {
  return {
    code,
    name: code,
    level: code.split(".").length,
    cells: values.map((value) => ({ value })),
    ...(children ? { children } : {}),
  };
}

function grid(rows: DatosRow[], columns: DatosColumn[] = COLUMNS): DatosGrid {
  return { id: "default", title: "Estado de Resultados", columns, rows };
}

function accumulate(
  rows: DatosRow[],
  overrides: Partial<Parameters<typeof accumulateStatement>[0]> = {},
) {
  return accumulateStatement({
    grid: grid(rows),
    visibleColumns: EVERY_COLUMN,
    loadedColumns: null,
    frequency: "mensual",
    ...overrides,
  });
}

/** The values of one row, column by column. */
function values(result: ReturnType<typeof accumulateStatement>, code: string): (number | null)[] {
  return (findRow(result.grid.rows, code)?.cells ?? []).map((cell) => cell.value);
}

describe("el acumulado del informe", () => {
  it("deja una columna por año, la más reciente primero", () => {
    //                       2025: Ene Feb Mar Tot | 2026: Ene Feb Mar Tot
    const result = accumulate([row("4", [10, 20, 30, 60, 100, 200, 300, 600])]);

    expect(result.periods.map((period) => period.year)).toEqual([2026, 2025]);
    expect(values(result, "4")).toEqual([600, 60]);
  });

  it("no suma la columna Total del año, que ya es una suma", () => {
    // Summing it would duplicate the whole year: 600 + 600. The accumulated figure comes from the
    // periods.
    const result = accumulate([row("4", [10, 20, 30, 60, 100, 200, 300, 600])]);

    expect(result.periods[0]?.positions).toEqual([4, 5, 6]);
  });

  it("nombra el tramo que acumula, no «el año»", () => {
    const result = accumulate([row("4", [10, 20, 30, 60, 100, 200, 300, 600])]);

    expect(result.periods[0]?.label).toBe("Acum. Ene–Mar 2026");
    expect(result.periods[1]?.label).toBe("Acum. Ene–Mar 2025");
  });

  it("nombra un solo periodo sin rango", () => {
    const result = accumulate([row("4", [10, 20, 30, 60, 100, 200, 300, 600])], {
      visibleColumns: [0, 4],
    });

    expect(result.periods[0]?.spanLabel).toBe("Ene");
  });

  it("enumera un tramo salteado mientras se pueda leer", () => {
    const result = accumulate([row("4", [10, 20, 30, 60, 100, 200, 300, 600])], {
      visibleColumns: [0, 2, 4, 6],
    });

    expect(result.periods[0]?.spanLabel).toBe("Ene y Mar");
  });

  it("acumula solo los periodos que el filtro deja ver", () => {
    const result = accumulate([row("4", [10, 20, 30, 60, 100, 200, 300, 600])], {
      // Ene and Feb of each year; the Totals are still on the list and are still not summed.
      visibleColumns: [0, 1, 3, 4, 5, 7],
    });

    expect(values(result, "4")).toEqual([300, 30]);
    expect(result.periods[0]?.spanLabel).toBe("Ene–Feb");
  });

  it("acumula solo los periodos que el workspace cargó", () => {
    const result = accumulate([row("4", [10, 20, 30, 60, 100, 200, 300, 600])], {
      // 2026 only has Ene loaded; 2025 has it all.
      loadedColumns: new Set([0, 1, 2, 4]),
    });

    expect(result.periods.map((period) => period.label)).toEqual([
      "Acum. Ene 2026",
      "Acum. Ene 2025",
    ]);
    expect(values(result, "4")).toEqual([100, 10]);
  });

  it("recorta el año anterior al mismo tramo, no a lo que él tenga cargado", () => {
    const result = accumulate([row("4", [10, 20, 30, 60, 100, 200, 300, 600])], {
      // 2026 runs to Feb; 2025 is complete. The comparison runs Ene–Feb in both.
      loadedColumns: new Set([0, 1, 2, 4, 5]),
    });

    expect(values(result, "4")).toEqual([300, 30]);
    expect(result.periods[1]?.label).toBe("Acum. Ene–Feb 2025");
    expect(result.notes).toEqual([]);
  });

  it("descarta el año que no llega a cubrir el tramo, y dice cuál le falta", () => {
    const result = accumulate([row("4", [10, 20, 30, 60, 100, 200, 300, 600])], {
      // 2025 only has Ene: an accumulated figure of its own over one month is not compared with three.
      loadedColumns: new Set([0, 4, 5, 6]),
    });

    expect(result.periods.map((period) => period.year)).toEqual([2026]);
    expect(result.notes).toHaveLength(1);
    expect(result.notes[0]).toContain("2025 no se compara");
    expect(result.notes[0]).toContain("Feb y Mar");
  });

  it("una fila sin ningún apunte queda en null, nunca en cero", () => {
    const result = accumulate([row("4.9", [null, null, null, null, null, null, null, null])]);

    expect(values(result, "4.9")).toEqual([null, null]);
  });

  it("un mes sin apunte dentro de un tramo cargado suma cero", () => {
    const result = accumulate([row("4.1", [null, 20, null, 20, null, 200, null, 200])]);

    expect(values(result, "4.1")).toEqual([200, 20]);
  });

  it("acumula el árbol entero, no solo las raíces", () => {
    const result = accumulate([
      row("4", [10, 20, 30, 60, 100, 200, 300, 600], [row("4.1", [1, 2, 3, 6, 10, 20, 30, 60])]),
    ]);

    expect(values(result, "4.1")).toEqual([60, 6]);
  });

  it("sin nada cargado deja la tabla vacía y lo dice", () => {
    const result = accumulate([row("4", [10, 20, 30, 60, 100, 200, 300, 600])], {
      loadedColumns: new Set<number>(),
    });

    expect(result.periods).toEqual([]);
    expect(result.grid.columns).toEqual([]);
    expect(result.notes).toHaveLength(1);
  });
});

describe("la variación entre dos acumulados", () => {
  it("es el cambio porcentual sobre el periodo anterior", () => {
    expect(variationPct(150, 100)).toBe(50);
    expect(variationPct(50, 100)).toBe(-50);
  });

  it("lee una pérdida que se achica como una mejora", () => {
    // (-50 − -100) / |-100| = +50 %. With the divisor without an absolute value it would come out
    // -50 %, which says the opposite of what happened.
    expect(variationPct(-50, -100)).toBe(50);
    expect(variationPct(-150, -100)).toBe(-50);
  });

  it("no compara contra cero ni contra un año que no está", () => {
    expect(variationPct(100, 0)).toBeNull();
    expect(variationPct(100, null)).toBeNull();
    expect(variationPct(null, 100)).toBeNull();
  });
});

describe("el porcentaje sobre una base", () => {
  it("es la parte que representa de ella", () => {
    expect(sharePct(25, 200)).toBe(12.5);
  });

  it("queda sin respuesta cuando la base es cero o no está", () => {
    expect(sharePct(25, 0)).toBeNull();
    expect(sharePct(25, null)).toBeNull();
    expect(sharePct(null, 200)).toBeNull();
  });
});
