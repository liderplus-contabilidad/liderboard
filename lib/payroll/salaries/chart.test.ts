import { describe, expect, it } from "vitest";
import { CHART_MAX_SERIES } from "@/lib/charts/palette";
import { buildSalariesCard } from "./chart";
import type { SalariesColumn, SalariesGrid, SalariesRow } from "./grid";

function columns(...labels: string[]): SalariesColumn[] {
  return labels.map((label, index) => ({ year: 2026, monthIndex: index, label }));
}

function row(id: string, label: string, values: (number | null)[]): SalariesRow {
  return { id, label, values };
}

function grid(overrides: Partial<SalariesGrid> = {}): SalariesGrid {
  const rows = overrides.rows ?? [
    row("area:COCINA", "COCINA", [2067.75, 1595.11]),
    row("area:VENTAS", "VENTAS", [1065.41, 725.07]),
  ];
  return {
    mode: "consolidado",
    area: null,
    columns: columns("Ene", "Feb"),
    rows,
    total: row("total", "TOTAL", [3133.16, 2320.18]),
    ...overrides,
  };
}

describe("buildSalariesCard", () => {
  it("dibuja una serie por fila más el total", () => {
    const card = buildSalariesCard(grid());

    expect(card.option?.series.map((s) => s.name)).toEqual(["COCINA", "VENTAS", "TOTAL"]);
  });

  it("el título nombra el área en el detalle y no en el consolidado", () => {
    expect(buildSalariesCard(grid()).title).toBe("Sueldos por área");
    expect(buildSalariesCard(grid({ mode: "detalle", area: "VENTAS" })).title).toBe("Área VENTAS");
  });

  it("las columnas de la tabla son las del grid", () => {
    expect(buildSalariesCard(grid()).table.columns).toEqual(["Ene", "Feb"]);
  });

  it("marca la fila de total y no las demás", () => {
    const { table } = buildSalariesCard(grid());

    expect(table.rows.map((r) => r.emphasis)).toEqual([false, false, true]);
  });

  it("lleva el cargo como rótulo secundario cuando la fila lo trae", () => {
    const card = buildSalariesCard(
      grid({
        mode: "detalle",
        area: "VENTAS",
        rows: [{ id: "e1", label: "SANDOVAL", sublabel: "RECEPCIONISTA", values: [1065.41, null] }],
      }),
    );

    expect(card.table.rows[0].sublabel).toBe("RECEPCIONISTA");
    // La gráfica no lo dibuja: en una leyenda competiría con el nombre.
    expect(card.option?.series[0].name).toBe("SANDOVAL");
  });

  it("un hueco se escribe con raya, nunca como $0.00", () => {
    const card = buildSalariesCard(
      grid({ rows: [row("area:VENTAS", "VENTAS", [null, 725.07])], total: null }),
    );

    // La raya que escribe la hoja del contador, no una celda en blanco ni `$0.00`.
    expect(card.table.rows[0].values[0]).toBe("–");
    expect(card.table.rows[0].values[1]).toBe("$725.07");
  });

  it("un cero real sí se escribe", () => {
    const card = buildSalariesCard(
      grid({ rows: [row("area:VENTAS", "VENTAS", [0, 725.07])], total: null }),
    );

    expect(card.table.rows[0].values[0]).toBe("$0.00");
  });

  it("la fila y su barra comparten color", () => {
    const card = buildSalariesCard(grid());
    const cocina = card.table.rows.find((r) => r.id === "area:COCINA");
    const serie = card.option?.series.find((s) => s.id === "area:COCINA");

    expect(serie?.itemStyle?.color).toBe(cocina?.color);
  });

  it("un solo eje de valores", () => {
    const card = buildSalariesCard(grid());

    expect(card.option?.yAxis).toBeDefined();
    expect(Array.isArray(card.option?.yAxis)).toBe(false);
  });
});

describe("el tope de series", () => {
  const many = Array.from({ length: 12 }, (_, index) =>
    row(`e${index}`, `EMPLEADO ${index}`, [100 + index, 100 + index]),
  );
  const card = buildSalariesCard(
    grid({ mode: "detalle", area: "VENTAS", rows: many, total: row("total", "SUBTOTAL", [0, 0]) }),
  );

  it("la gráfica no pasa de las ranuras de la paleta", () => {
    expect(card.option?.series).toHaveLength(CHART_MAX_SERIES);
  });

  it("el cierre entra siempre, aunque sea el de menor importe", () => {
    expect(card.option?.series.at(-1)?.name).toBe("SUBTOTAL");
  });

  it("dibuja las de mayor costo acumulado", () => {
    const drawn = card.option?.series.map((s) => s.name) ?? [];

    expect(drawn).toContain("EMPLEADO 11");
    expect(drawn).not.toContain("EMPLEADO 0");
  });

  it("las dibujadas conservan el orden de la tabla, no el del ranking", () => {
    // El ranking es descendente por importe (11, 10, 9…); la tabla las lista 5, 6, 7… y la gráfica
    // tiene que seguirla para que las dos se lean en paralelo.
    const drawn = (card.option?.series.map((s) => s.name) ?? []).filter((n) => n !== "SUBTOTAL");
    const tableOrder = many.map((r) => r.label).filter((label) => drawn.includes(label));

    expect(drawn).toEqual(tableOrder);
  });

  it("la tabla lista TODAS las filas", () => {
    expect(card.table.rows).toHaveLength(13); // 12 empleados + el cierre
  });

  it("la tarjeta declara cuántas no dibujó", () => {
    // Siete ranuras para empleados (la octava es el cierre), así que quedan cinco fuera.
    expect(card.note).toContain("5 que no se dibujaron");
  });

  it("sin recorte no hay nota", () => {
    expect(buildSalariesCard(grid()).note).toBeUndefined();
  });
});

describe("un grid sin nada que dibujar", () => {
  it("no produce una gráfica vacía", () => {
    const card = buildSalariesCard(grid({ rows: [], total: null }));

    expect(card.option).toBeNull();
    expect(card.table.rows).toEqual([]);
  });

  it("tampoco con filas pero sin columnas", () => {
    const card = buildSalariesCard(grid({ columns: [], rows: [], total: null }));

    expect(card.option).toBeNull();
  });
});
