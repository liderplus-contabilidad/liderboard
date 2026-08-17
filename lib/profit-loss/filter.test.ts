import { describe, expect, it } from "vitest";
import type { DatosCell, DatosGrid, DatosRow } from "./datos-types";
import {
  accountOptions,
  collapsedForLevel,
  deepestLevel,
  emptyAccountCodes,
  focusAccounts,
  matchExpandLevel,
  movingColumnPositions,
  pruneEmptyAccounts,
  visibleAccountOptions,
} from "./filter";
import type { AccountRow } from "./types";
import { MONTHLY_ACCOUNTS } from "./parse.fixtures";

/** Minimal DatosRow builder for tree-shape tests. */
function row(code: string, level: number, children?: DatosRow[]): DatosRow {
  return {
    code,
    name: code,
    level,
    cells: [{ value: 0 }],
    ...(children ? { children } : {}),
  };
}

/** The MONTHLY_ACCOUNTS fixture as a DatosRow tree (values irrelevant to these tests). */
function sampleRows(): DatosRow[] {
  return [
    row("4", 1, [
      row("4.1", 2, [row("4.1.1", 3), row("4.1.2", 3), row("4.1.3", 3)]),
      row("4.2", 2),
    ]),
    row("5", 1, [row("5.1", 2, [row("5.1.1", 3), row("5.1.2", 3, [row("5.1.2.1", 4)])])]),
  ];
}

const RESULT_ROW: DatosRow = {
  code: "",
  name: "Utilidad o Pérdida",
  level: 1,
  isResult: true,
  cells: [{ value: 0 }],
};

const codes = (rows: DatosRow[]): string[] =>
  rows.flatMap((r) => [r.code, ...codes(r.children ?? [])]);

describe("deepestLevel", () => {
  it("returns the depth of the deepest movement account", () => {
    expect(deepestLevel(MONTHLY_ACCOUNTS)).toBe(4);
  });

  it("returns 0 for no accounts", () => {
    expect(deepestLevel([])).toBe(0);
  });

  it("cuenta los siete niveles de MicroPlus sin tope escrito", () => {
    // MicroPlus anida un nivel más que los formatos anteriores (`5.5.01.02.22.01.01`); el
    // filtro de Nivel los ofrece sin un solo cambio en su código, que solo cuenta segmentos.
    const accounts: AccountRow[] = [
      { code: "5", name: "Costos y Gastos", values: [1] },
      { code: "5.5.01.02.22.01.01", name: "Cuenta de séptimo nivel", values: [1] },
    ];
    expect(deepestLevel(accounts)).toBe(7);
    expect(accountOptions(accounts).map((o) => o.level)).toEqual([1, 7]);
  });
});

describe("accountOptions", () => {
  it("lists every account (parents included) in tree order", () => {
    const options = accountOptions(MONTHLY_ACCOUNTS);
    expect(options[0]).toEqual({ code: "4", name: "Ingresos", level: 1, hasChildren: true });
    expect(options.map((o) => o.code)).toEqual([
      "4",
      "4.1",
      "4.1.1",
      "4.1.2",
      "4.1.3",
      "4.2",
      "5",
      "5.1",
      "5.1.1",
      "5.1.2",
      "5.1.2.1",
    ]);
  });

  it("derives level from the code depth", () => {
    const byCode = new Map(accountOptions(MONTHLY_ACCOUNTS).map((o) => [o.code, o]));
    expect(byCode.get("4")?.level).toBe(1);
    expect(byCode.get("4.1")?.level).toBe(2);
    expect(byCode.get("5.1.2.1")?.level).toBe(4);
  });

  it("flags a node as hasChildren when any account nests under it", () => {
    const byCode = new Map(accountOptions(MONTHLY_ACCOUNTS).map((o) => [o.code, o]));
    const withChildren = [...byCode.values()].filter((o) => o.hasChildren).map((o) => o.code);
    expect(new Set(withChildren)).toEqual(new Set(["4", "4.1", "5", "5.1", "5.1.2"]));
    expect(byCode.get("4.1.1")?.hasChildren).toBe(false); // leaf
    expect(byCode.get("4.2")?.hasChildren).toBe(false); // leaf
    expect(byCode.get("5.1.2.1")?.hasChildren).toBe(false); // leaf
  });

  it("devuelve cada cuenta dentro de su rama aunque la lista llegue desordenada", () => {
    // El universo del filtro es una UNIÓN por primer avistamiento (los años visibles en el
    // proveedor, los centros/clientes en `mergeCenters`), así que un código que solo trae el
    // segundo aporte aterriza al final de la lista — detrás del bloque de la raíz 6. Dibujado
    // plano con sangrado por nivel, eso pinta cuentas de Ingresos colgando de No operacionales.
    const options = accountOptions([
      account("4"),
      account("4.1"),
      account("5"),
      account("6"),
      account("6.1"),
      account("4.2"),
      account("4.1.1"),
    ]);
    expect(options.map((o) => o.code)).toEqual(["4", "4.1", "4.1.1", "4.2", "5", "6", "6.1"]);
  });

  it("ordena las hermanas por segmento numérico", () => {
    expect(
      accountOptions([account("4"), account("4.1"), account("4.1.11"), account("4.1.2")]).map(
        (o) => o.code,
      ),
    ).toEqual(["4", "4.1", "4.1.2", "4.1.11"]);
  });

  it("cuelga a un huérfano de su ancestro más cercano, como hace la tabla", () => {
    // Sin `4.1` en el plan, `4.1.1` se anida bajo `4`: el mismo re-emparentado de
    // `buildAccountTree`, para que el filtro y Datos no discrepen sobre quién es hija de quién.
    expect(
      accountOptions([account("5"), account("4"), account("4.1.1")]).map((o) => o.code),
    ).toEqual(["4", "4.1.1", "5"]);
  });

  it("no repite un código duplicado", () => {
    expect(
      accountOptions([account("4"), account("4.1"), account("4.1")]).map((o) => o.code),
    ).toEqual(["4", "4.1"]);
  });
});

/** Minimal AccountRow builder for the ordering tests. */
function account(code: string): AccountRow {
  return { code, name: code, values: [] };
}

describe("visibleAccountOptions", () => {
  const visibleCodes = (accounts: AccountRow[], collapsed: Set<string>) =>
    visibleAccountOptions(accountOptions(accounts), collapsed).map((o) => o.code);

  it("returns the same reference when nothing is collapsed", () => {
    const options = accountOptions(MONTHLY_ACCOUNTS);
    expect(visibleAccountOptions(options, new Set())).toBe(options);
  });

  it("hides the descendants of a collapsed node but keeps the node itself", () => {
    expect(visibleCodes(MONTHLY_ACCOUNTS, new Set(["4.1"]))).toEqual([
      "4",
      "4.1",
      "4.2",
      "5",
      "5.1",
      "5.1.1",
      "5.1.2",
      "5.1.2.1",
    ]);
  });

  it("hides an entire subtree when a top node is collapsed", () => {
    expect(visibleCodes(MONTHLY_ACCOUNTS, new Set(["4"]))).toEqual([
      "4",
      "5",
      "5.1",
      "5.1.1",
      "5.1.2",
      "5.1.2.1",
    ]);
  });

  it("does nothing when a leaf is collapsed", () => {
    expect(visibleCodes(MONTHLY_ACCOUNTS, new Set(["4.2"]))).toEqual(
      accountOptions(MONTHLY_ACCOUNTS).map((o) => o.code),
    );
  });

  it("applies several collapsed nodes at once", () => {
    expect(visibleCodes(MONTHLY_ACCOUNTS, new Set(["4.1", "5.1"]))).toEqual([
      "4",
      "4.1",
      "4.2",
      "5",
      "5.1",
    ]);
  });

  it("hides descendants that nest under a collapsed node through a missing ancestor", () => {
    // 4.1 is absent, so 4.1.1 nests under 4 in the tree; collapsing 4 must still hide it.
    expect(visibleCodes([account("4"), account("4.1.1")], new Set(["4"]))).toEqual(["4"]);
  });
});

describe("focusAccounts", () => {
  it("returns the same rows when nothing is selected", () => {
    const rows = sampleRows();
    expect(focusAccounts(rows, new Set())).toBe(rows);
  });

  it("keeps the selected account with its whole subtree", () => {
    const kept = focusAccounts(sampleRows(), new Set(["4.1"]));
    // 4 kept as context, 4.1 with all its children, 4.2 and the whole 5 branch pruned.
    expect(codes(kept)).toEqual(["4", "4.1", "4.1.1", "4.1.2", "4.1.3"]);
  });

  it("keeps ancestor context rows but prunes their unselected siblings", () => {
    const kept = focusAccounts(sampleRows(), new Set(["5.1.2.1"]));
    expect(codes(kept)).toEqual(["5", "5.1", "5.1.2", "5.1.2.1"]);
  });

  it("keeps a selected leaf even with no descendants", () => {
    const kept = focusAccounts(sampleRows(), new Set(["4.2"]));
    expect(codes(kept)).toEqual(["4", "4.2"]);
  });

  it("always keeps the Utilidad result row", () => {
    const kept = focusAccounts([...sampleRows(), RESULT_ROW], new Set(["4.1"]));
    expect(kept.at(-1)).toBe(RESULT_ROW);
  });

  it("preserves node references for fully-kept subtrees", () => {
    const rows = sampleRows();
    const kept = focusAccounts(rows, new Set(["4"]));
    expect(kept[0]).toBe(rows[0]);
  });
});

describe("collapsedForLevel", () => {
  it("collapses every parent at or below the level", () => {
    // level 2 → parents at level >= 2 collapse (their children hide): 4.1, 5.1, 5.1.2.
    expect(collapsedForLevel(MONTHLY_ACCOUNTS, 2)).toEqual(new Set(["4.1", "5.1", "5.1.2"]));
  });

  it("level 1 collapses all parents (only roots visible)", () => {
    expect(collapsedForLevel(MONTHLY_ACCOUNTS, 1)).toEqual(
      new Set(["4", "4.1", "5", "5.1", "5.1.2"]),
    );
  });
});

describe("matchExpandLevel", () => {
  const deepest = deepestLevel(MONTHLY_ACCOUNTS);

  it("maps an empty collapsed set to the deepest level (fully expanded)", () => {
    expect(matchExpandLevel(MONTHLY_ACCOUNTS, new Set(), deepest)).toBe(deepest);
  });

  it("maps a level's collapsed set back to that level", () => {
    const collapsed = collapsedForLevel(MONTHLY_ACCOUNTS, 2);
    expect(matchExpandLevel(MONTHLY_ACCOUNTS, collapsed, deepest)).toBe(2);
  });

  it("returns null for a custom collapse state", () => {
    expect(matchExpandLevel(MONTHLY_ACCOUNTS, new Set(["4.1"]), deepest)).toBeNull();
  });
});

/** A row whose cells are given straight, so a test can say exactly what each column holds. */
function valued(code: string, cells: DatosCell[], children?: DatosRow[]): DatosRow {
  return {
    code,
    name: code,
    level: code.split(".").length,
    cells,
    ...(children ? { children } : {}),
  };
}

/** `n` cells, all zero — the shape a "sin movimiento" row has. */
function zeros(n = 3): DatosCell[] {
  return Array.from({ length: n }, () => ({ value: 0 }) as DatosCell);
}

describe("pruneEmptyAccounts", () => {
  it("drops a branch with no movement anywhere in it", () => {
    const rows = [
      valued("4", [{ value: 10 }], [valued("4.1", [{ value: 10 }])]),
      valued("5", [{ value: 0 }], [valued("5.1", [{ value: 0 }]), valued("5.2", [{ value: 0 }])]),
    ];
    expect(codes(pruneEmptyAccounts(rows, null))).toEqual(["4", "4.1"]);
  });

  it("keeps a parent that rolls up to zero because its children cancel out", () => {
    const rows = [
      valued(
        "4",
        [{ value: 0 }],
        [valued("4.1", [{ value: 100 }]), valued("4.2", [{ value: -100 }])],
      ),
    ];
    expect(codes(pruneEmptyAccounts(rows, null))).toEqual(["4", "4.1", "4.2"]);
  });

  it("treats an unloaded month (null) exactly as a zero", () => {
    const rows = [valued("4", [{ value: null }, { value: null }])];
    expect(pruneEmptyAccounts(rows, null)).toEqual([]);
  });

  it("keeps a zero row that carries a comment", () => {
    const rows = [valued("4", [{ value: 0 }, { value: 0, comment: "Sin ventas en febrero" }])];
    expect(codes(pruneEmptyAccounts(rows, null))).toEqual(["4"]);
  });

  it("keeps a row whose zero was PRODUCED by an adjustment", () => {
    // 500 → 0. Omitting it from a download would lose the adjustment and its original value.
    const rows = [valued("4", [{ value: 0, edited: true }, { value: 0 }])];
    expect(codes(pruneEmptyAccounts(rows, null))).toEqual(["4"]);
  });

  it("never drops a result row, even at zero", () => {
    const rows = [valued("4", zeros()), RESULT_ROW];
    expect(pruneEmptyAccounts(rows, null)).toEqual([RESULT_ROW]);
  });

  it("judges only the given column positions", () => {
    const rows = [valued("4", [{ value: 0 }, { value: 80 }])];
    expect(codes(pruneEmptyAccounts(rows, [1]))).toEqual(["4"]);
    expect(pruneEmptyAccounts(rows, [0])).toEqual([]);
  });

  it("keeps a parent alive on its own comment, as a leaf", () => {
    const rows = [
      valued("4", [{ value: 0, comment: "Cuenta sin uso este año" }], [valued("4.1", zeros(1))]),
    ];
    const pruned = pruneEmptyAccounts(rows, null);
    expect(codes(pruned)).toEqual(["4"]);
    expect(pruned[0].children).toEqual([]);
  });

  it("returns the very same array when nothing is pruned", () => {
    const rows = [valued("4", [{ value: 10 }], [valued("4.1", [{ value: 10 }])])];
    const pruned = pruneEmptyAccounts(rows, null);
    expect(pruned).toBe(rows);
    expect(pruned[0]).toBe(rows[0]);
  });

  it("preserves the reference of an untouched sibling subtree", () => {
    const kept = valued("4", [{ value: 10 }], [valued("4.1", [{ value: 10 }])]);
    const rows = [kept, valued("5", zeros(1))];
    const pruned = pruneEmptyAccounts(rows, null);
    expect(pruned).not.toBe(rows);
    expect(pruned[0]).toBe(kept);
  });
});

describe("emptyAccountCodes", () => {
  const grid = (rows: DatosRow[]): DatosGrid => ({
    id: "g",
    title: "Estado de Resultados",
    columns: [{ kind: "period", label: "Ene", year: 2026, index: 0 }],
    rows,
  });

  it("keeps a code that has movement in ANY sheet of the workbook", () => {
    // "4.2" only moves in the second sheet; the first must still write it, so both sheets keep
    // the same chart of accounts and can be read side by side.
    const norte = grid([
      valued("4", [{ value: 10 }], [valued("4.1", [{ value: 10 }]), valued("4.2", zeros(1))]),
    ]);
    const sur = grid([
      valued("4", [{ value: 7 }], [valued("4.1", zeros(1)), valued("4.2", [{ value: 7 }])]),
    ]);
    expect(emptyAccountCodes([norte, sur])).toEqual(new Set());
  });

  it("omits a code with no movement in any sheet", () => {
    const norte = grid([
      valued("4", [{ value: 10 }], [valued("4.1", [{ value: 10 }]), valued("4.9", zeros(1))]),
    ]);
    const sur = grid([
      valued("4", [{ value: 7 }], [valued("4.1", [{ value: 7 }]), valued("4.9", zeros(1))]),
    ]);
    expect(emptyAccountCodes([norte, sur])).toEqual(new Set(["4.9"]));
  });

  it("never omits a result row's code", () => {
    expect(emptyAccountCodes([grid([valued("4", zeros(1)), RESULT_ROW])])).toEqual(new Set(["4"]));
  });
});

describe("movingColumnPositions", () => {
  const ALL = [0, 1, 2];

  it("returns the very same array when every column moves", () => {
    const rows = [valued("4", [{ value: 1 }, { value: 2 }, { value: 3 }])];
    expect(movingColumnPositions(rows, ALL)).toBe(ALL);
  });

  it("drops the columns nothing moved in", () => {
    const rows = [
      valued("4", [{ value: 0 }, { value: 5 }, { value: 0 }]),
      valued("5", [{ value: 0 }, { value: 0 }, { value: 0 }]),
    ];
    expect(movingColumnPositions(rows, ALL)).toEqual([1]);
  });

  it("looks inside the whole tree, not just the top rows", () => {
    const rows = [
      valued("4", zeros(), [valued("4.1", [{ value: 0 }, { value: 0 }, { value: 9 }])]),
    ];
    expect(movingColumnPositions(rows, ALL)).toEqual([2]);
  });

  it("counts a comment and an adjustment as movement, like the row rule", () => {
    const rows = [
      valued("4", [{ value: 0, comment: "cerrada" }, { value: 0, edited: true }, { value: 0 }]),
    ];
    expect(movingColumnPositions(rows, ALL)).toEqual([0, 1]);
  });

  it("judges only the positions it is given", () => {
    const rows = [valued("4", [{ value: 7 }, { value: 0 }, { value: 7 }])];
    expect(movingColumnPositions(rows, [1])).toEqual([]);
  });

  it("leaves no row alive with its only figure hidden", () => {
    // El invariante que hace que juzgar filas y columnas a la vez sea seguro: la celda que salva
    // a «4.1» salva también a su columna, así que la fila nunca queda sin nada que enseñar.
    const rows = [
      valued("4", [{ value: 0 }, { value: 4 }], [valued("4.1", [{ value: 0 }, { value: 4 }])]),
    ];
    const columns = movingColumnPositions(rows, [0, 1]);
    const kept = pruneEmptyAccounts(rows, [0, 1]);
    for (const row of codes(kept)) {
      expect(row).toBeTruthy();
    }
    expect(columns).toEqual([1]);
    expect(codes(kept)).toEqual(["4", "4.1"]);
  });
});
