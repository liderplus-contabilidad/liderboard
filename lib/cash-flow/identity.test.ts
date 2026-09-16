import { describe, expect, it } from "vitest";
import { checkId, payableId } from "./identity";

describe("payableId", () => {
  it("ignores case, accents and spacing in the supplier and type", () => {
    const a = payableId("c1", "contifico", "HERRERA BEDÓN JENNY", "FAC", "001-002-000000020");
    const b = payableId("c1", "contifico", "herrera bedon  jenny ", "fac", " 001-002-000000020");
    expect(a).toBe(b);
  });

  it("tells sources, empresas and numbers apart", () => {
    const base = payableId("c1", "contifico", "X", "FAC", "1");
    expect(payableId("c1", "dingoo", "X", "FAC", "1")).not.toBe(base);
    expect(payableId("c2", "contifico", "X", "FAC", "1")).not.toBe(base);
    expect(payableId("c1", "contifico", "X", "FAC", "2")).not.toBe(base);
  });
});

describe("checkId", () => {
  it("is the empresa plus the voucher", () => {
    expect(checkId("c1", " 4419 ")).toBe("c1::4419");
  });
});
