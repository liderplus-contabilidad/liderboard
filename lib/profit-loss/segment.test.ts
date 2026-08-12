import { describe, expect, it } from "vitest";
import {
  canSegment,
  currentValue,
  isSegmented,
  segmentAccounts,
  twinCode,
  twinWriteFor,
} from "./segment";
import type { AccountRow, CellEdit } from "./types";

function row(code: string, name: string, ...values: number[]): AccountRow {
  return {
    code,
    name,
    values: [...values, ...Array.from({ length: 12 - values.length }, () => 0)],
  };
}

/** A statement with the 5.2 subtree the segmentation copies. */
const ACCOUNTS: AccountRow[] = [
  row("4", "Ingresos", 355),
  row("4.1", "Ventas", 355),
  row("5", "Costos y Gastos", 125),
  row("5.1", "Gastos Operativos", 95),
  row("5.1.1", "Sueldos", 95),
  row("5.2", "Gastos Administrativos", 30),
  row("5.2.1", "Servicios", 30),
  row("5.2.1.1", "Energía Eléctrica", 30),
];

function edit(code: string, monthIndex: number, extra: Partial<CellEdit> = {}): CellEdit {
  return { datasetId: "d1", code, monthIndex, updatedAt: 0, ...extra };
}

describe("segmentAccounts", () => {
  it("copies the 5.2 subtree as a zeroed root 6, re-levelled and same-named", () => {
    const out = segmentAccounts(ACCOUNTS);

    expect(out.slice(ACCOUNTS.length)).toEqual([
      { code: "6", name: "Gastos Administrativos", values: Array.from({ length: 12 }, () => 0) },
      { code: "6.1", name: "Servicios", values: Array.from({ length: 12 }, () => 0) },
      { code: "6.1.1", name: "Energía Eléctrica", values: Array.from({ length: 12 }, () => 0) },
    ]);
  });

  it("leaves the original accounts untouched", () => {
    const out = segmentAccounts(ACCOUNTS);
    expect(out.slice(0, ACCOUNTS.length)).toEqual(ACCOUNTS);
  });

  it("is one-way: a segmented statement is returned as-is", () => {
    const once = segmentAccounts(ACCOUNTS);
    expect(segmentAccounts(once)).toBe(once);
    expect(canSegment(once)).toBe(false);
    expect(isSegmented(once)).toBe(true);
  });

  it("returns the same reference when there is no 5.2 to copy", () => {
    const noSource = ACCOUNTS.filter((account) => !account.code.startsWith("5.2"));
    expect(segmentAccounts(noSource)).toBe(noSource);
    expect(canSegment(noSource)).toBe(false);
  });

  it("keeps the annual base's single column", () => {
    const annual: AccountRow[] = [
      { code: "5.2", name: "Gastos Administrativos", values: [30] },
      { code: "5.2.1", name: "Servicios", values: [30] },
    ];
    expect(segmentAccounts(annual).slice(2)).toEqual([
      { code: "6", name: "Gastos Administrativos", values: [0] },
      { code: "6.1", name: "Servicios", values: [0] },
    ]);
  });
});

describe("twinCode", () => {
  it("maps the block back into 5.2", () => {
    expect(twinCode("6")).toBe("5.2");
    expect(twinCode("6.1")).toBe("5.2.1");
    expect(twinCode("6.1.1")).toBe("5.2.1.1");
  });

  it("is null outside the block", () => {
    expect(twinCode("5.2.1")).toBeNull();
    expect(twinCode("4.1")).toBeNull();
    expect(twinCode("60")).toBeNull();
  });
});

describe("currentValue", () => {
  const accounts = segmentAccounts(ACCOUNTS);

  it("reads the file's value when nothing was edited", () => {
    expect(currentValue(accounts, [], "5.2.1.1", 0)).toBe(30);
  });

  it("prefers a value edit", () => {
    expect(currentValue(accounts, [edit("5.2.1.1", 0, { value: 70 })], "5.2.1.1", 0)).toBe(70);
  });

  it("ignores a comment-only edit", () => {
    expect(currentValue(accounts, [edit("5.2.1.1", 0, { comment: "ojo" })], "5.2.1.1", 0)).toBe(30);
  });

  it("reads a cleared cell as 0", () => {
    expect(currentValue(accounts, [edit("5.2.1.1", 0, { value: null })], "5.2.1.1", 0)).toBe(0);
  });
});

describe("twinWriteFor", () => {
  const accounts = segmentAccounts(ACCOUNTS);

  it("discounts what the non-operating cell takes from its twin", () => {
    expect(twinWriteFor(accounts, [], "6.1.1", 0, 10)).toEqual({
      code: "5.2.1.1",
      monthIndex: 0,
      value: 20,
    });
  });

  it("re-typing the same cell doesn't discount twice", () => {
    const edits = [edit("6.1.1", 0, { value: 10 }), edit("5.2.1.1", 0, { value: 20 })];
    // 10 → 25 moves 15 more, and only that.
    expect(twinWriteFor(accounts, edits, "6.1.1", 0, 25)?.value).toBe(5);
  });

  it("gives the amount back when the non-operating cell is lowered or cleared", () => {
    const edits = [edit("6.1.1", 0, { value: 10 }), edit("5.2.1.1", 0, { value: 20 })];
    expect(twinWriteFor(accounts, edits, "6.1.1", 0, 4)?.value).toBe(26);
    expect(twinWriteFor(accounts, edits, "6.1.1", 0, null)?.value).toBe(30);
  });

  describe("the pair adds up to the file's amount whichever gesture comes first", () => {
    it("does not discount again what was already emptied by hand", () => {
      const edits = [edit("5.2.1.1", 0, { value: 0 })];
      expect(twinWriteFor(accounts, edits, "6.1.1", 0, 30)?.value).toBe(0);
    });

    it("lands on the same amount with no hand-made cut at all", () => {
      expect(twinWriteFor(accounts, [], "6.1.1", 0, 30)?.value).toBe(0);
    });

    it("overrides a hand-made correction on 5.2 rather than compounding with it", () => {
      const edits = [edit("6.1.1", 0, { value: 10 }), edit("5.2.1.1", 0, { value: 70 })];
      expect(twinWriteFor(accounts, edits, "6.1.1", 0, 12)?.value).toBe(18);
    });
  });

  it("lets the twin go negative rather than clamping", () => {
    expect(twinWriteFor(accounts, [], "6.1.1", 0, 50)?.value).toBe(-20);
  });

  it("keeps the twin's comment, which the value write would otherwise drop", () => {
    const edits = [edit("5.2.1.1", 0, { comment: "revisar" })];
    expect(twinWriteFor(accounts, edits, "6.1.1", 0, 10)).toEqual({
      code: "5.2.1.1",
      monthIndex: 0,
      value: 20,
      comment: "revisar",
    });
  });

  it("is null when nothing moves", () => {
    // A comment-only edit, an account outside the block, an unchanged value, and a missing twin.
    expect(twinWriteFor(accounts, [], "6.1.1", 0, undefined)).toBeNull();
    expect(twinWriteFor(accounts, [], "5.1.1", 0, 10)).toBeNull();
    expect(twinWriteFor(accounts, [], "6.1.1", 0, 0)).toBeNull();
    expect(
      twinWriteFor([{ code: "6.9", name: "Huérfana", values: [0] }], [], "6.9", 0, 5),
    ).toBeNull();
  });
});
