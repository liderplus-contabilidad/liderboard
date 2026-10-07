import { describe, expect, it } from "vitest";
import {
  DEFAULT_MARKED_COLUMNS,
  moveMarkedColumn,
  sanitizeMarkedColumns,
  visibleMarkedColumns,
} from "./marked-columns";

describe("marked payment columns", () => {
  it("keeps the chosen order and hides optional columns without losing the document", () => {
    const preferences = sanitizeMarkedColumns({
      order: ["urgent", "document", "account"],
      hidden: ["document", "dueOn", "payOn"],
    });
    expect(visibleMarkedColumns(preferences).map((column) => column.id)).toEqual([
      "urgent",
      "document",
      "account",
      "priority",
      "balance",
      "pending",
    ]);
  });

  it("repairs stale and duplicate saved columns, adding missing columns once", () => {
    const preferences = sanitizeMarkedColumns({
      order: ["pending", "removed", "pending", null],
      hidden: ["removed", "balance", "balance", 7],
    });
    expect(preferences.order).toEqual([
      "pending",
      "document",
      "dueOn",
      "priority",
      "account",
      "payOn",
      "balance",
      "urgent",
    ]);
    expect(preferences.hidden).toEqual(["balance"]);
    expect(sanitizeMarkedColumns(null)).toEqual(DEFAULT_MARKED_COLUMNS);
  });

  it("moves a column without changing visibility or dropping other columns", () => {
    const preferences = sanitizeMarkedColumns({ ...DEFAULT_MARKED_COLUMNS, hidden: ["account"] });
    const moved = moveMarkedColumn(preferences, "balance", -1);
    expect(moved.order).toEqual([
      "document",
      "dueOn",
      "priority",
      "account",
      "balance",
      "payOn",
      "urgent",
      "pending",
    ]);
    expect(moved.hidden).toEqual(["account"]);
    expect(moveMarkedColumn(preferences, "document", -1)).toBe(preferences);
    expect(moveMarkedColumn(preferences, "pending", 1)).toBe(preferences);
  });
});
