import { describe, expect, it } from "vitest";
import {
  aggregate,
  allowedFrequencies,
  applyEditsToLeafAccounts,
  applyLeafEdits,
  buildAccountTree,
  computeResult,
  computeRollups,
  mergeCenters,
  periodLabels,
  planSummaries,
  toDatosGrid,
} from "./derive";
import type { DatosRow } from "./datos-types";
import { MONTHLY_ACCOUNTS, MONTHLY_RESULT } from "./parse.fixtures";
import { segmentAccounts } from "./segment";
import type { AccountRow, CellEdit, PygDataset } from "./types";

function edit(partial: Partial<CellEdit> & Pick<CellEdit, "code" | "monthIndex">): CellEdit {
  return { datasetId: "d1", updatedAt: 0, ...partial };
}

describe("buildAccountTree", () => {
  it("nests accounts by dot-prefix and derives levels", () => {
    const { roots, warnings } = buildAccountTree(MONTHLY_ACCOUNTS);
    expect(warnings).toEqual([]);
    expect(roots.map((r) => r.code)).toEqual(["4", "5"]);
    const income = roots[0];
    expect(income.children.map((c) => c.code)).toEqual(["4.1", "4.2"]);
    expect(income.children[0].children.map((c) => c.code)).toEqual(["4.1.1", "4.1.2", "4.1.3"]);
    expect(income.level).toBe(1);
    expect(income.children[0].children[0].level).toBe(3);
  });

  it("supports leaves at different depths", () => {
    const { roots } = buildAccountTree(MONTHLY_ACCOUNTS);
    const otros = roots[0].children[1]; // 4.2, leaf at level 2
    expect(otros.children).toEqual([]);
    const energia = roots[1].children[0].children[1].children[0]; // 5.1.2.1, leaf at level 4
    expect(energia.code).toBe("5.1.2.1");
    expect(energia.children).toEqual([]);
  });

  it("attaches an orphan to its nearest existing ancestor with a warning", () => {
    const rows: AccountRow[] = [
      { code: "4", name: "Ingresos", values: [0] },
      { code: "4.1.1", name: "Ventas", values: [10] }, // "4.1" missing
    ];
    const { roots, warnings } = buildAccountTree(rows);
    expect(roots[0].children.map((c) => c.code)).toEqual(["4.1.1"]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("4.1.1");
  });

  it("keeps the first of duplicate codes and warns", () => {
    const rows: AccountRow[] = [
      { code: "4", name: "Primera", values: [1] },
      { code: "4", name: "Segunda", values: [2] },
    ];
    const { roots, warnings } = buildAccountTree(rows);
    expect(roots).toHaveLength(1);
    expect(roots[0].name).toBe("Primera");
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("4");
  });
});

describe("computeRollups", () => {
  it("recomputes every parent from its children, leaves untouched", () => {
    // Zero out parent values to prove they get recomputed, not copied.
    const zeroedParents = MONTHLY_ACCOUNTS.map((row) =>
      ["4", "4.1", "5", "5.1", "5.1.2"].includes(row.code)
        ? { ...row, values: row.values.map(() => 0) }
        : row,
    );
    const { roots } = buildAccountTree(zeroedParents);
    const rolled = computeRollups(roots);
    const byCode = flatten(rolled);
    expect(byCode.get("4")?.values.slice(0, 4)).toEqual([130, 200, 25, 0]);
    expect(byCode.get("4.1")?.values.slice(0, 4)).toEqual([130, 200, 0, 0]);
    expect(byCode.get("5")?.values.slice(0, 4)).toEqual([90, 0, 0, 5]);
    expect(byCode.get("5.1.2")?.values.slice(0, 4)).toEqual([10, 0, 0, 5]);
    expect(byCode.get("4.1.1")?.values.slice(0, 4)).toEqual([100, 200, 0, 0]);
  });
});

describe("computeResult", () => {
  it("computes Utilidad as income roots minus expense roots", () => {
    const { roots } = buildAccountTree(MONTHLY_ACCOUNTS);
    const { values, warnings } = computeResult(computeRollups(roots));
    expect(values).toEqual(MONTHLY_RESULT);
    expect(warnings).toEqual([]);
  });

  it("excludes roots outside 4*/5*/6* with a warning", () => {
    const rows: AccountRow[] = [
      { code: "4", name: "Ingresos", values: [100] },
      { code: "5", name: "Gastos", values: [30] },
      { code: "9", name: "Otras cuentas", values: [999] },
    ];
    const { roots } = buildAccountTree(rows);
    const { values, warnings } = computeResult(roots);
    expect(values).toEqual([70]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("9");
  });

  it("reports no split while the statement carries no non-operating block", () => {
    const { roots } = buildAccountTree(MONTHLY_ACCOUNTS);
    const result = computeResult(computeRollups(roots));
    expect(result.operating).toEqual(result.values);
    expect(result.nonOperatingTotal).toBeNull();
    expect(result.expenses).toBeNull();
  });

  it("splits the result once the non-operating block exists", () => {
    const rows: AccountRow[] = [
      { code: "4", name: "Ingresos", values: [100] },
      { code: "5", name: "Gastos", values: [30] },
      { code: "6", name: "Gastos No Operacionales", values: [12] },
    ];
    const { roots } = buildAccountTree(rows);
    const result = computeResult(roots);

    expect(result.operating).toEqual([70]);
    // A TOTAL of expenses, reported positive like every other expense — never negated.
    expect(result.nonOperatingTotal).toEqual([12]);
    expect(result.expenses).toEqual([42]);
    expect(result.values).toEqual([58]);
    expect(result.warnings).toEqual([]);
  });

  it("closes the exercise as operating minus the non-operating total", () => {
    // The accountant's own consolidated workbook: 9.357,33 − 13.395,59 = −4.038,26 (enero).
    const { roots } = buildAccountTree([
      { code: "4", name: "Ingresos", values: [75_930.24] },
      { code: "5", name: "Costo de ventas y gastos", values: [66_572.91] },
      { code: "6", name: "Gastos", values: [13_395.59] },
    ]);
    const result = computeResult(roots);
    const round = (value: number) => Math.round(value * 100) / 100;

    expect(round(result.operating[0])).toBe(9357.33);
    expect(round((result.nonOperatingTotal as number[])[0])).toBe(13_395.59);
    expect(round(result.values[0])).toBe(-4038.26);
    expect(round(result.operating[0] - (result.nonOperatingTotal as number[])[0])).toBe(
      round(result.values[0]),
    );
  });

  it("keeps the exercise's result fixed: reclassifying only redistributes it", () => {
    const before = computeResult(
      buildAccountTree([
        { code: "4", name: "Ingresos", values: [100] },
        { code: "5", name: "Gastos", values: [30] },
      ]).roots,
    );
    const after = computeResult(
      buildAccountTree([
        { code: "4", name: "Ingresos", values: [100] },
        { code: "5", name: "Gastos", values: [18] },
        { code: "6", name: "Gastos No Operacionales", values: [12] },
      ]).roots,
    );

    expect(after.values).toEqual(before.values);
    expect(after.operating).toEqual([82]);
  });
});

describe("planSummaries", () => {
  const summary = (resultKind: DatosRow["resultKind"], anchorCode?: string): DatosRow => ({
    code: "",
    name: String(resultKind),
    level: 1,
    isResult: true,
    resultKind,
    ...(anchorCode ? { anchorCode } : {}),
    cells: [],
  });
  const account = (code: string): DatosRow => ({ code, name: code, level: 1, cells: [] });
  const rows = [
    account("4"),
    account("5"),
    account("6"),
    summary("operacional", "5"),
    summary("no-operacional", "6"),
    summary("total-gastos"),
    summary("ejercicio"),
  ];
  const roots = new Set(["4", "5", "6"]);

  it("closes each block with its own summary and the grid with the rest", () => {
    const { byAnchor, trailing } = planSummaries(rows, false, roots);

    expect(byAnchor.get("5")?.map((row) => row.resultKind)).toEqual(["operacional"]);
    expect(byAnchor.get("6")?.map((row) => row.resultKind)).toEqual(["no-operacional"]);
    expect(trailing.map((row) => row.resultKind)).toEqual(["total-gastos", "ejercicio"]);
  });

  it("sends every summary to the tail once a sort reorders the roots", () => {
    const { byAnchor, trailing } = planSummaries(rows, true, roots);

    expect(byAnchor.size).toBe(0);
    expect(trailing).toHaveLength(4);
  });

  it("keeps a summary whose anchor the account filter hid, at the tail", () => {
    const { byAnchor, trailing } = planSummaries(rows, false, new Set(["4", "5"]));

    expect(byAnchor.get("5")?.map((row) => row.resultKind)).toEqual(["operacional"]);
    expect(trailing.map((row) => row.resultKind)).toEqual([
      "no-operacional",
      "total-gastos",
      "ejercicio",
    ]);
  });

  it("leaves an unsegmented grid's single summary at the tail", () => {
    const { byAnchor, trailing } = planSummaries(
      [account("4"), account("5"), summary("ejercicio")],
      false,
      roots,
    );

    expect(byAnchor.size).toBe(0);
    expect(trailing.map((row) => row.resultKind)).toEqual(["ejercicio"]);
  });
});

describe("applyLeafEdits", () => {
  it("overrides leaf values and leaves other nodes' identity intact", () => {
    const { roots } = buildAccountTree(MONTHLY_ACCOUNTS);
    const edited = applyLeafEdits(roots, [edit({ code: "4.1.1", monthIndex: 0, value: 0 })]);
    const byCode = flatten(edited);
    expect(byCode.get("4.1.1")?.values[0]).toBe(0);
    expect(byCode.get("4.1.1")?.values[1]).toBe(200);
    // Untouched subtree keeps identity (memo-friendliness).
    expect(edited[1]).toBe(roots[1]);
  });

  it("ignores value edits on parents and treats null as 0", () => {
    const { roots } = buildAccountTree(MONTHLY_ACCOUNTS);
    const edited = applyLeafEdits(roots, [
      edit({ code: "4.1", monthIndex: 0, value: 12345 }), // parent — ignored
      edit({ code: "4.1.2", monthIndex: 0, value: null }), // null clears to 0
      edit({ code: "4.1.3", monthIndex: 0, comment: "solo comentario" }), // no value — ignored here
    ]);
    const byCode = flatten(edited);
    expect(byCode.get("4.1")?.values[0]).toBe(130);
    expect(byCode.get("4.1.2")?.values[0]).toBe(0);
    expect(byCode.get("4.1.3")?.values[0]).toBe(-20);
  });
});

/** Test helper: flatten a tree into a code → node map. */
function flatten(roots: ReturnType<typeof buildAccountTree>["roots"]) {
  const map = new Map<string, (typeof roots)[number]>();
  const walk = (nodes: typeof roots) => {
    for (const node of nodes) {
      map.set(node.code, node);
      walk(node.children);
    }
  };
  walk(roots);
  return map;
}

function monthlyDataset(): PygDataset {
  return {
    id: "d1",
    fileName: "reporte.xlsx",
    uploadedAt: 0,
    companyName: "HOTELERA ANDES S.A.",
    periodLabel: "Ene–Dic 2026",
    year: 2026,
    baseFrequency: "mensual",
    role: "single",
    accounts: MONTHLY_ACCOUNTS,
    resultFromFile: MONTHLY_RESULT,
    warnings: [],
  };
}

/**
 * A statement carrying a 5.2 subtree, already segmented — the shape Datos renders after the
 * «Segmentar gastos» button ran. Only Enero is set, so every summary is hand-checkable:
 * leaves are 4 (130), 5.1 (60) and 5.2.1.1 (30), which rolls 5 up to 90.
 */
function segmentedDataset(): PygDataset {
  const month = (value: number) => [value, ...Array.from({ length: 11 }, () => 0)];
  return {
    ...monthlyDataset(),
    accounts: segmentAccounts([
      { code: "4", name: "Ingresos", values: month(130) },
      { code: "5", name: "Costos y Gastos", values: month(90) },
      { code: "5.1", name: "Gastos Operativos", values: month(60) },
      { code: "5.2", name: "Gastos Administrativos", values: month(30) },
      { code: "5.2.1", name: "Servicios", values: month(30) },
      { code: "5.2.1.1", name: "Energía Eléctrica", values: month(30) },
    ]),
    resultFromFile: month(40),
  };
}

describe("allowedFrequencies", () => {
  it("floors the options at the base frequency", () => {
    expect(allowedFrequencies("mensual")).toEqual(["mensual", "trimestral", "semestral", "anual"]);
    expect(allowedFrequencies("anual")).toEqual(["anual"]);
    expect(allowedFrequencies("trimestral")).toEqual(["trimestral", "semestral", "anual"]);
  });
});

describe("aggregate", () => {
  const values = [130, 200, 25, 0, 0, 0, 0, 0, 0, 0, 0, 0];

  it("sums monthly values into quarters, semesters and the year", () => {
    expect(aggregate(values, "mensual", "mensual")).toEqual(values);
    expect(aggregate(values, "mensual", "trimestral")).toEqual([355, 0, 0, 0]);
    expect(aggregate([90, 0, 0, 5, 0, 0, 0, 0, 0, 0, 0, 0], "mensual", "trimestral")).toEqual([
      90, 5, 0, 0,
    ]);
    expect(aggregate(values, "mensual", "semestral")).toEqual([355, 0]);
    expect(aggregate(values, "mensual", "anual")).toEqual([355]);
  });

  it("is identity for an annual base and refuses disaggregation", () => {
    expect(aggregate([355], "anual", "anual")).toEqual([355]);
    expect(() => aggregate([355], "anual", "mensual")).toThrow();
  });
});

describe("periodLabels", () => {
  it("labels each frequency", () => {
    expect(periodLabels("mensual")).toHaveLength(12);
    expect(periodLabels("trimestral")).toEqual(["T1", "T2", "T3", "T4"]);
    expect(periodLabels("semestral")).toEqual(["S1", "S2"]);
    expect(periodLabels("anual")).toEqual(["Total"]);
  });
});

describe("toDatosGrid", () => {
  it("builds the monthly grid with recomputed parents and the result row", () => {
    const grid = toDatosGrid(monthlyDataset(), [], "mensual");
    expect(grid.months).toHaveLength(12);
    const rows = flattenGrid(grid);
    expect(rows.get("4")?.cells[0]?.value).toBe(130);
    expect(rows.get("4")?.level).toBe(1);
    const result = grid.rows.find((row) => row.isResult);
    expect(result?.cells.map((c) => c.value).slice(0, 4)).toEqual([40, 200, 25, -5]);
    expect(grid.utilidad?.positive).toBe(true);
    expect(grid.utilidad?.label).toContain("Utilidad");
  });

  it("aggregates cells per frequency", () => {
    const grid = toDatosGrid(monthlyDataset(), [], "trimestral");
    expect(grid.months).toEqual(["T1", "T2", "T3", "T4"]);
    const rows = flattenGrid(grid);
    expect(rows.get("4")?.cells.map((c) => c.value)).toEqual([355, 0, 0, 0]);
    expect(rows.get("5")?.cells.map((c) => c.value)).toEqual([90, 5, 0, 0]);
    const result = grid.rows.find((row) => row.isResult);
    expect(result?.cells.map((c) => c.value)).toEqual([265, -5, 0, 0]);
  });

  it("recomputes parents and result from leaf value edits", () => {
    const edits = [{ datasetId: "d1", code: "4.1.1", monthIndex: 0, value: 0, updatedAt: 0 }];
    const grid = toDatosGrid(monthlyDataset(), edits, "mensual");
    const rows = flattenGrid(grid);
    expect(rows.get("4.1")?.cells[0]?.value).toBe(30);
    expect(rows.get("4")?.cells[0]?.value).toBe(30);
    const result = grid.rows.find((row) => row.isResult);
    expect(result?.cells[0]?.value).toBe(-60);
  });

  it("marks aggregated cells that cover a commented month", () => {
    const edits = [
      { datasetId: "d1", code: "4.1.1", monthIndex: 1, comment: "Revisar factura", updatedAt: 0 },
    ];
    const monthly = toDatosGrid(monthlyDataset(), edits, "mensual");
    expect(flattenGrid(monthly).get("4.1.1")?.cells[1]?.comment).toBe("Revisar factura");
    const quarterly = toDatosGrid(monthlyDataset(), edits, "trimestral");
    expect(flattenGrid(quarterly).get("4.1.1")?.cells[0]?.comment).toContain("Revisar factura");
    expect(flattenGrid(quarterly).get("4.1.1")?.cells[1]?.comment).toBeUndefined();
  });

  it("marks a leaf cell with a value edit as edited", () => {
    const edits = [{ datasetId: "d1", code: "4.1.1", monthIndex: 0, value: 999, updatedAt: 0 }];
    const grid = toDatosGrid(monthlyDataset(), edits, "mensual");
    const rows = flattenGrid(grid);
    expect(rows.get("4.1.1")?.cells[0]?.edited).toBe(true);
    expect(rows.get("4.1.1")?.cells[1]?.edited).toBeUndefined();
  });

  it("never marks a parent row or the result row as edited", () => {
    const edits = [{ datasetId: "d1", code: "4.1.1", monthIndex: 0, value: 999, updatedAt: 0 }];
    const grid = toDatosGrid(monthlyDataset(), edits, "mensual");
    const rows = flattenGrid(grid);
    expect(rows.get("4.1")?.cells[0]?.edited).toBeUndefined();
    expect(rows.get("4")?.cells[0]?.edited).toBeUndefined();
    expect(grid.rows.find((row) => row.isResult)?.cells[0]?.edited).toBeUndefined();
  });

  it("does not mark a comment-only edit as edited", () => {
    const edits = [
      { datasetId: "d1", code: "4.1.1", monthIndex: 0, comment: "revisar", updatedAt: 0 },
    ];
    const grid = toDatosGrid(monthlyDataset(), edits, "mensual");
    expect(flattenGrid(grid).get("4.1.1")?.cells[0]?.edited).toBeUndefined();
  });

  it("marks an aggregated cell edited when any base month it spans was edited", () => {
    const edits = [{ datasetId: "d1", code: "4.1.1", monthIndex: 1, value: 999, updatedAt: 0 }];
    const quarterly = toDatosGrid(monthlyDataset(), edits, "trimestral");
    expect(flattenGrid(quarterly).get("4.1.1")?.cells[0]?.edited).toBe(true);
    expect(flattenGrid(quarterly).get("4.1.1")?.cells[1]?.edited).toBeUndefined();
  });

  it("marks leaf accounts as movement and parents/result as not", () => {
    const grid = toDatosGrid(monthlyDataset(), [], "mensual");
    const rows = flattenGrid(grid);
    expect(rows.get("4.1.1")?.movement).toBe(true); // leaf
    expect(rows.get("4.2")?.movement).toBe(true); // leaf at level 2
    expect(rows.get("4")?.movement).toBe(false); // parent
    expect(rows.get("4.1")?.movement).toBe(false); // parent
    expect(grid.rows.find((row) => row.isResult)?.movement).toBe(false);
  });

  it("renders an annual-base dataset as a single Total column", () => {
    const dataset: PygDataset = {
      ...monthlyDataset(),
      baseFrequency: "anual",
      accounts: MONTHLY_ACCOUNTS.map((a) => ({
        ...a,
        values: [a.values.reduce((s, v) => s + v, 0)],
      })),
      resultFromFile: [260],
    };
    const grid = toDatosGrid(dataset, [], "anual");
    expect(grid.months).toEqual(["Total"]);
    expect(flattenGrid(grid).get("4")?.cells).toHaveLength(1);
    expect(flattenGrid(grid).get("4")?.cells[0]?.value).toBe(355);
  });

  it("closes on a single «Utilidad o Pérdida» while unsegmented", () => {
    const grid = toDatosGrid(monthlyDataset(), [], "mensual");
    const results = grid.rows.filter((row) => row.isResult);
    expect(results.map((row) => row.name)).toEqual(["Utilidad o Pérdida"]);
    expect(results[0].resultKind).toBe("ejercicio");
  });

  it("closes on the four summaries once segmented, each anchored to its block", () => {
    const dataset = segmentedDataset();
    const grid = toDatosGrid(dataset, [], "mensual");
    const results = grid.rows.filter((row) => row.isResult);

    expect(results.map((row) => [row.name, row.anchorCode])).toEqual([
      ["Utilidad Operacional", "5"],
      ["Total No Operacional", "6"],
      ["Total Gastos del Ejercicio", undefined],
      ["Utilidad del Ejercicio", undefined],
    ]);
    // Nothing typed yet: the block is at 0, so the exercise still reads as the operating result.
    const value = (kind: string) => results.find((row) => row.resultKind === kind)?.cells[0]?.value;
    expect(value("operacional")).toBe(40);
    expect(value("no-operacional")).toBe(0);
    expect(value("total-gastos")).toBe(90);
    expect(value("ejercicio")).toBe(40);
  });

  it("moves the split, not the exercise, when a non-operating amount is typed", () => {
    // The pair as `twinWriteFor` writes it: 10 into 6.1.1, the same 10 out of its twin 5.2.1.1.
    const grid = toDatosGrid(
      segmentedDataset(),
      [
        { datasetId: "d1", code: "6.1.1", monthIndex: 0, value: 10, updatedAt: 0 },
        { datasetId: "d1", code: "5.2.1.1", monthIndex: 0, value: 20, updatedAt: 0 },
      ],
      "mensual",
    );
    const value = (kind: string) =>
      grid.rows.find((row) => row.resultKind === kind)?.cells[0]?.value;

    expect(value("operacional")).toBe(50);
    // The block's total, positive; the exercise below is 50 − 10.
    expect(value("no-operacional")).toBe(10);
    expect(value("total-gastos")).toBe(90);
    expect(value("ejercicio")).toBe(40);
    expect(grid.utilidad?.label).toContain("Utilidad");
  });
});

/**
 * The rows the table renders are memoized on identity, so what a rebuild REUSES is what
 * decides whether editing one cell re-renders one row or five hundred.
 */
describe("toDatosGrid: reutilización de filas", () => {
  it("devuelve las mismas filas y los mismos meses cuando nada cambió", () => {
    const first = toDatosGrid(monthlyDataset(), [], "mensual");
    const second = toDatosGrid(monthlyDataset(), [], "mensual", first);
    expect(second.months).toBe(first.months);
    for (const [code, row] of flattenGrid(first)) {
      expect(flattenGrid(second).get(code)).toBe(row);
    }
    expect(second.rows.find((r) => r.isResult)).toBe(first.rows.find((r) => r.isResult));
  });

  it("renueva solo la cuenta editada, sus ancestros y la Utilidad", () => {
    const first = toDatosGrid(monthlyDataset(), [], "mensual");
    const edits = [{ datasetId: "d1", code: "4.1.1", monthIndex: 0, value: 0, updatedAt: 0 }];
    const second = toDatosGrid(monthlyDataset(), edits, "mensual", first);

    const before = flattenGrid(first);
    const after = flattenGrid(second);
    // La hoja editada y su cadena de padres cambian de valor, luego de identidad.
    expect(after.get("4.1.1")).not.toBe(before.get("4.1.1"));
    expect(after.get("4.1")).not.toBe(before.get("4.1"));
    expect(after.get("4")).not.toBe(before.get("4"));
    expect(second.rows.find((r) => r.isResult)).not.toBe(first.rows.find((r) => r.isResult));
    // La rama de costos no participa del cambio y conserva su objeto.
    expect(after.get("5")).toBe(before.get("5"));
    expect(after.get("5.1")).toBe(before.get("5.1"));
    expect(after.get("5.1.1")).toBe(before.get("5.1.1"));
    // Y una hoja hermana de la editada tampoco se toca.
    expect(after.get("4.2")).toBe(before.get("4.2"));
  });

  it("un comentario renueva su fila y su cadena de padres, no las ramas ajenas", () => {
    const first = toDatosGrid(monthlyDataset(), [], "mensual");
    const edits = [
      { datasetId: "d1", code: "4.1.1", monthIndex: 1, comment: "Revisar", updatedAt: 0 },
    ];
    const second = toDatosGrid(monthlyDataset(), edits, "mensual", first);
    expect(flattenGrid(second).get("4.1.1")).not.toBe(flattenGrid(first).get("4.1.1"));
    // Un comentario no mueve importes, pero el padre SÍ cambia de objeto: su `children` pasa a
    // contener otra referencia, y una fila que dice "estos son mis hijos" no puede reutilizarse
    // cuando esos hijos ya no son los mismos.
    expect(flattenGrid(second).get("4.1")).not.toBe(flattenGrid(first).get("4.1"));
    expect(flattenGrid(second).get("4.1")?.cells).toEqual(flattenGrid(first).get("4.1")?.cells);
    // La rama de costos no comparte ningún hijo con la comentada y conserva su objeto.
    expect(flattenGrid(second).get("5")).toBe(flattenGrid(first).get("5"));
    expect(flattenGrid(second).get("4.2")).toBe(flattenGrid(first).get("4.2"));
  });

  it("no reutiliza nada al cambiar de frecuencia: las celdas ya no son las mismas", () => {
    const monthly = toDatosGrid(monthlyDataset(), [], "mensual");
    const quarterly = toDatosGrid(monthlyDataset(), [], "trimestral", monthly);
    expect(quarterly.months).not.toBe(monthly.months);
    expect(quarterly.months).toEqual(["T1", "T2", "T3", "T4"]);
    expect(flattenGrid(quarterly).get("4")).not.toBe(flattenGrid(monthly).get("4"));
  });

  it("produce el mismo grid con o sin predecesor — reutilizar no cambia lo que dice", () => {
    const edits = [{ datasetId: "d1", code: "4.1.1", monthIndex: 0, value: 7, updatedAt: 0 }];
    const first = toDatosGrid(monthlyDataset(), [], "mensual");
    const withPrevious = toDatosGrid(monthlyDataset(), edits, "mensual", first);
    const withoutPrevious = toDatosGrid(monthlyDataset(), edits, "mensual");
    expect(withPrevious).toEqual(withoutPrevious);
  });
});

/** Test helper: flatten a DatosGrid's tree into a code → row map. */
function flattenGrid(grid: ReturnType<typeof toDatosGrid>) {
  const map = new Map<string, (typeof grid.rows)[number]>();
  const walk = (rows: typeof grid.rows) => {
    for (const row of rows) {
      map.set(row.code, row);
      if (row.children) {
        walk(row.children);
      }
    }
  };
  walk(grid.rows);
  return map;
}

describe("mergeCenters", () => {
  it("unions accounts by code and sums leaf values column-wise", () => {
    const a = [
      { code: "4", name: "Ingresos", values: [10, 0] },
      { code: "4.1", name: "Ventas", values: [10, 0] },
      { code: "4.2", name: "Otros", values: [0, 0] },
    ];
    const b = [
      { code: "4", name: "Ingresos", values: [5, 7] },
      { code: "4.1", name: "Ventas", values: [5, 7] },
      { code: "4.3", name: "Extra", values: [0, 0] },
    ];
    const { accounts, warnings } = mergeCenters([a, b]);
    const byCode = new Map(accounts.map((x) => [x.code, x.values]));
    // 4.1 is a leaf in both → summed; 4.2 only in a, 4.3 only in b → carried through.
    expect(byCode.get("4.1")).toEqual([15, 7]);
    expect(byCode.get("4.2")).toEqual([0, 0]);
    expect(byCode.get("4.3")).toEqual([0, 0]);
    // Union keeps every code exactly once.
    expect(accounts.map((x) => x.code).sort()).toEqual(["4", "4.1", "4.2", "4.3"]);
    expect(warnings).toEqual([]);
  });

  it("warns when a code is a leaf in one center and a parent in another", () => {
    const a = [{ code: "4", name: "Ingresos", values: [10] }]; // 4 is a leaf here
    const b = [
      { code: "4", name: "Ingresos", values: [8] },
      { code: "4.1", name: "Ventas", values: [8] }, // 4 is a parent here
    ];
    const { warnings } = mergeCenters([a, b]);
    expect(warnings.some((w) => w.includes("4"))).toBe(true);
  });
});

describe("applyEditsToLeafAccounts", () => {
  it("overrides leaf values, ignores parents and comment-only edits", () => {
    const accounts = [
      { code: "4", name: "Ingresos", values: [10, 0] },
      { code: "4.1", name: "Ventas", values: [10, 0] }, // leaf
    ];
    const edited = applyEditsToLeafAccounts(accounts, [
      { datasetId: "d", code: "4.1", monthIndex: 1, value: 55, updatedAt: 0 },
      { datasetId: "d", code: "4", monthIndex: 0, value: 999, updatedAt: 0 }, // parent — ignored
      { datasetId: "d", code: "4.1", monthIndex: 0, comment: "x", updatedAt: 0 }, // no value — ignored
    ]);
    const byCode = new Map(edited.map((a) => [a.code, a.values]));
    expect(byCode.get("4.1")).toEqual([10, 55]);
    expect(byCode.get("4")).toEqual([10, 0]);
  });

  it("returns the same reference when there are no value edits", () => {
    const accounts = [{ code: "4", name: "Ingresos", values: [1] }];
    expect(applyEditsToLeafAccounts(accounts, [])).toBe(accounts);
  });
});
