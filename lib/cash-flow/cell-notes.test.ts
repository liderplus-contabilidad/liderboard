import { describe, expect, it } from "vitest";
import { applyNotes, balanceNoteKey, overdraftNoteKey, payableNoteKey } from "./cell-notes";

describe("cell note keys", () => {
  it("names each captured cell apart", () => {
    const keys = [
      balanceNoteKey("a"),
      overdraftNoteKey("a"),
      balanceNoteKey("b"),
      payableNoteKey("a", "priority"),
      payableNoteKey("a", "account"),
      payableNoteKey("a", "payOn"),
      payableNoteKey("a", "urgent"),
      payableNoteKey("a", "pending"),
    ];
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("applyNotes", () => {
  it("writes trimmed text, removes null and blanks, and leaves the rest alone", () => {
    expect(
      applyNotes(
        { "balance:a": "Uno", "balance:b": "Dos", "balance:c": "Tres" },
        { "balance:a": "  Nuevo  ", "balance:b": null, "balance:c": "   ", "balance:d": "Cuatro" },
      ),
    ).toEqual({ "balance:a": "Nuevo", "balance:d": "Cuatro" });
  });

  it("reads a flow without notes as none", () => {
    expect(applyNotes(undefined, undefined)).toEqual({});
  });
});
