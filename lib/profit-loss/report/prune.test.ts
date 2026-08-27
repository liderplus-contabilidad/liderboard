import { describe, expect, it } from "vitest";
import type { DatosCell, DatosGrid, DatosRow } from "../datos-types";
import { pruneEmptyColumns, pruneEmptyRows, pruneVerticalRows } from "./prune";

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
    // It really happens: a parent whose rollup cancels out between a debit and a credit.
    const pruned = pruneEmptyRows(
      grid([row("5", [0, 0, 0], [row("5.1", [0, 0, 0], [row("5.1.1", [500, -500, 0])])])]),
    );

    // Without the parent, the descendant that does matter would be left hanging off nothing.
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

    // A result of zero is still the result; a statement with no close is not a statement.
    expect(pruned.rows).toHaveLength(1);
    expect(pruned.rows[0].isResult).toBe(true);
  });

  it("una cuenta con un solo mes cargado sobrevive con sus celdas SIN cobertura intactas", () => {
    const pruned = pruneEmptyRows(grid([row("4.1", [1200, null, 1200])]));

    expect(codes(pruned.rows)).toEqual(["4.1"]);
    // The null/0 distinction is kept in the rows that do get printed: an unloaded February is still
    // empty, not a zero.
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
    // The base over itself is 100 %, but if the period has no coverage it comes out null.
    const pruned = pruneVerticalRows(
      vertical([
        { code: "4", values: [null, null], total: null },
        { code: "5.1", values: [0, 0], total: 0 },
      ]),
    );

    expect(pruned.rows.map((r) => r.code)).toEqual(["4"]);
  });
});

describe("pruneEmptyColumns", () => {
  const gridWith = (rows: DatosRow[], columnCount: number): DatosGrid => ({
    id: "g",
    title: "Estado de Resultados",
    columns: [
      ...Array.from({ length: columnCount - 1 }, (_, index) => ({
        kind: "period" as const,
        label: `P${index}`,
        year: 2026,
        index,
      })),
      { kind: "total" as const, label: "Total", year: 2026 },
    ],
    rows,
  });

  it("returns the very same grid when every column moved", () => {
    const input = gridWith([row("4", [1, 2, 3])], 3);
    expect(pruneEmptyColumns(input)).toBe(input);
  });

  it("drops a period nothing moved in", () => {
    const input = gridWith([row("4", [5, 0, 5])], 3);
    expect(pruneEmptyColumns(input).columns.map((c) => c.label)).toEqual(["P0", "Total"]);
  });

  it("treats an unloaded period (null) as an empty one", () => {
    const input = gridWith([row("4", [5, null, 5])], 3);
    expect(pruneEmptyColumns(input).columns.map((c) => c.label)).toEqual(["P0", "Total"]);
  });

  it("looks inside the whole tree", () => {
    const input = gridWith([row("4", [0, 0, 7], [row("4.1", [0, 7, 7])])], 3);
    expect(pruneEmptyColumns(input).columns.map((c) => c.label)).toEqual(["P1", "Total"]);
  });

  it("keeps the printed periods adding up to the Total", () => {
    const input = gridWith([row("4", [30, 0, 20, 50])], 4);
    const pruned = pruneEmptyColumns(input);
    const cells = pruned.rows[0].cells.map((cell) => cell.value ?? 0);
    const total = cells[cells.length - 1];
    expect(cells.slice(0, -1).reduce((sum, value) => sum + value, 0)).toBe(total);
  });

  it("drops the Total too when the whole year is empty", () => {
    expect(pruneEmptyColumns(gridWith([row("4", [0, 0, 0])], 3)).columns).toEqual([]);
  });
});
