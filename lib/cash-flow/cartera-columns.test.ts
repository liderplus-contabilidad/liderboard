import { describe, expect, it } from "vitest";
import {
  CARTERA_COLUMNS,
  DEFAULT_CARTERA_COLUMNS,
  moveCarteraColumn,
  sanitizeCarteraColumns,
  visibleCarteraColumns,
} from "./cartera-columns";

describe("cartera columns", () => {
  it("restores saved order and visibility while keeping document identification", () => {
    const saved = sanitizeCarteraColumns({
      order: ["balance", "document"],
      hidden: ["document", "issuedOn", "payments"],
    });
    expect(visibleCarteraColumns(saved).map((column) => column.id)).toEqual([
      "balance",
      "document",
      "detail",
      "dueOn",
      "amount",
      "payOn",
      "approval",
    ]);
  });

  it("repairs obsolete saved columns and restores defaults for missing preferences", () => {
    const saved = sanitizeCarteraColumns({
      order: ["approval", "removed", "approval"],
      hidden: ["removed", "balance", "balance"],
    });
    expect(saved.order).toEqual([
      "approval",
      ...CARTERA_COLUMNS.map((column) => column.id).filter((id) => id !== "approval"),
    ]);
    expect(saved.hidden).toEqual(["balance"]);
    expect(sanitizeCarteraColumns(null)).toEqual(DEFAULT_CARTERA_COLUMNS);
  });

  it("moves hidden columns too, preserving all columns and visibility", () => {
    const saved = sanitizeCarteraColumns({ hidden: ["detail"] });
    expect(moveCarteraColumn(saved, "detail", -1)).toEqual({
      ...saved,
      order: [
        "detail",
        "document",
        "issuedOn",
        "dueOn",
        "amount",
        "payments",
        "balance",
        "payOn",
        "approval",
      ],
    });
    expect(moveCarteraColumn(saved, "document", -1)).toBe(saved);
    expect(moveCarteraColumn(saved, "approval", 1)).toBe(saved);
  });
});
