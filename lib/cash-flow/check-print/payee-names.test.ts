import { describe, expect, it } from "vitest";
import { knownPayeeNames } from "./payee";

describe("knownPayeeNames", () => {
  it("combines checks and cartera without blank names or duplicate spellings", () => {
    expect(
      knownPayeeNames(
        [{ payee: " COMISERSA " }, { payee: "" }, { payee: "Ana" }],
        [{ supplier: "comisersa" }, { supplier: "Beta" }, { supplier: "  " }],
      ),
    ).toEqual(["Ana", "Beta", "COMISERSA"]);
  });
  it("includes a new beneficiary after their first check is saved", () => {
    expect(knownPayeeNames([{ payee: "Nuevo proveedor" }], [])).toEqual(["Nuevo proveedor"]);
  });
});
