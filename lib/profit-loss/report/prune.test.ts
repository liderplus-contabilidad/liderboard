import { describe, expect, it } from "vitest";
import type { DatosCell, DatosGrid, DatosRow } from "../datos-types";
import { pruneEmptyRows, pruneVerticalRows } from "./prune";

function cells(...values: (number | null)[]): DatosCell[] {
  return values.map((value) => ({ value }));
}

function row(code: string, values: (number | null)[], children?: DatosRow[]): DatosRow {
  return {
    code,
    name: code,
    level: code.split(".").length,
    cells: cells(...values),
    ...(children ? { children } : {}),
  };
}

function grid(rows: DatosRow[]): DatosGrid {
  return {
    id: "default",
    title: "Estado de Resultados",
    columns: [
      { kind: "period", label: "Ene", year: 2026, index: 0 },
      { kind: "period", label: "Feb", year: 2026, index: 1 },
      { kind: "total", label: "Total", year: 2026 },
    ],
    rows,
  };
}

/** Depth-first list of the codes that survived. */
function codes(rows: readonly DatosRow[]): string[] {
  return rows.flatMap((entry) => [entry.code, ...codes(entry.children ?? [])]);
}

describe("la poda del estado de resultados", () => {
  it("quita la cuenta declarada que nunca se usó", () => {
    const pruned = pruneEmptyRows(grid([row("4.1.1", [100, 200, 300]), row("4.1.2", [0, 0, 0])]));

    expect(codes(pruned.rows)).toEqual(["4.1.1"]);
  });

  it("quita también su subárbol entero", () => {
    const pruned = pruneEmptyRows(
      grid([
        row("4", [100, 0, 100], [row("4.1", [100, 0, 100], [row("4.1.1", [100, 0, 100])])]),
        row("5", [0, 0, 0], [row("5.1", [0, 0, 0], [row("5.1.1", [0, 0, 0])])]),
      ]),
    );

    expect(codes(pruned.rows)).toEqual(["4", "4.1", "4.1.1"]);
  });

  it("conserva al padre en cero cuyo descendiente sí se movió", () => {
    // Pasa de verdad: un padre cuyo rollup se cancela entre un cargo y un abono.
    const pruned = pruneEmptyRows(
      grid([row("5", [0, 0, 0], [row("5.1", [0, 0, 0], [row("5.1.1", [500, -500, 0])])])]),
    );

    // Sin el padre, el descendiente que sí importa quedaría colgando de nada.
    expect(codes(pruned.rows)).toEqual(["5", "5.1", "5.1.1"]);
  });

  it("poda solo la rama muerta de un padre con hijos mixtos", () => {
    const pruned = pruneEmptyRows(
      grid([row("5", [900, 0, 900], [row("5.1", [900, 0, 900]), row("5.2", [0, 0, 0])])]),
    );

    expect(codes(pruned.rows)).toEqual(["5", "5.1"]);
  });

  it("nunca poda una fila de resumen, ni aunque cierre en cero", () => {
    const utilidad: DatosRow = {
      code: "",
      name: "Utilidad o Pérdida",
      level: 1,
      isResult: true,
      resultKind: "ejercicio",
      cells: cells(0, 0, 0),
    };
    const pruned = pruneEmptyRows(grid([row("4.1", [0, 0, 0]), utilidad]));

    // Un resultado de cero sigue siendo el resultado; un estado sin su cierre no es un estado.
    expect(pruned.rows).toHaveLength(1);
    expect(pruned.rows[0].isResult).toBe(true);
  });

  it("una cuenta con un solo mes cargado sobrevive con sus celdas SIN cobertura intactas", () => {
    const pruned = pruneEmptyRows(grid([row("4.1", [1200, null, 1200])]));

    expect(codes(pruned.rows)).toEqual(["4.1"]);
    // La distinción null/0 se conserva en las filas que sí se imprimen: febrero no cargado sigue
    // siendo vacío, no un cero.
    expect(pruned.rows[0].cells.map((cell) => cell.value)).toEqual([1200, null, 1200]);
  });

  it("una cuenta cuyas celdas son todas nulas se poda igual que una en cero", () => {
    const pruned = pruneEmptyRows(
      grid([row("4.1", [100, 100, 200]), row("4.2", [null, null, null])]),
    );

    expect(codes(pruned.rows)).toEqual(["4.1"]);
  });

  it("un valor negativo es movimiento", () => {
    const pruned = pruneEmptyRows(grid([row("4.1.4", [-507, 0, -507])]));

    expect(codes(pruned.rows)).toEqual(["4.1.4"]);
  });

  it("no toca las columnas", () => {
    const original = grid([row("4.1", [100, 0, 100])]);

    expect(pruneEmptyRows(original).columns).toEqual(original.columns);
  });
});

describe("la poda del análisis vertical", () => {
  function vertical(rows: { code: string; values: (number | null)[]; total: number | null }[]) {
    return {
      base: { code: "4", label: "Ingresos" },
      periods: [],
      warnings: [],
      rows: rows.map((r) => ({
        code: r.code,
        label: r.code,
        level: r.code.split(".").length,
        hasChildren: false,
        values: r.values,
        total: r.total,
      })),
    };
  }

  it("quita la cuenta que pesa cero en todos los periodos", () => {
    const pruned = pruneVerticalRows(
      vertical([
        { code: "5.1", values: [12.5, 11.0], total: 11.8 },
        { code: "6.2.1", values: [0, 0], total: 0 },
      ]),
    );

    expect(pruned.rows.map((r) => r.code)).toEqual(["5.1"]);
  });

  it("conserva la cuenta que pesa algo aunque sea en un solo periodo", () => {
    const pruned = pruneVerticalRows(vertical([{ code: "5.2", values: [0, 3.4], total: 1.7 }]));

    expect(pruned.rows.map((r) => r.code)).toEqual(["5.2"]);
  });

  it("nunca quita la cuenta base: todo lo demás se lee contra ella", () => {
    // La base sobre sí misma es 100 %, pero si el periodo no tiene cobertura sale nula.
    const pruned = pruneVerticalRows(
      vertical([
        { code: "4", values: [null, null], total: null },
        { code: "5.1", values: [0, 0], total: 0 },
      ]),
    );

    expect(pruned.rows.map((r) => r.code)).toEqual(["4"]);
  });
});
