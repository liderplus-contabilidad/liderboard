import { describe, expect, it } from "vitest";
import type { DatosRow } from "./datos-types";
import {
  accountOptions,
  collapsedForLevel,
  deepestLevel,
  focusAccounts,
  matchExpandLevel,
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
});

describe("accountOptions", () => {
  it("lists every account (parents included) in file order", () => {
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
});

describe("visibleAccountOptions", () => {
  const account = (code: string): AccountRow => ({ code, name: code, values: [] });
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
