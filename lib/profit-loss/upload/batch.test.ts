import { describe, expect, it } from "vitest";
import { PygParseError } from "../errors";
import { applyBatch, validateBatch } from "./batch";
import type { MonthSlice } from "./batch";

function slice(month: number, year = 2026): MonthSlice {
  return {
    kind: "month-slice",
    year,
    month,
    companyName: "HOTELERA ANDES S.A.",
    centers: [
      { name: "SUCURSAL NORTE", accounts: [{ code: "4", name: "Ingresos", values: [100] }] },
    ],
    general: [{ code: "4", name: "Ingresos", values: [100] }],
    warnings: [],
  };
}

describe("validateBatch — un solo año", () => {
  it("rejects a batch mixing years, naming both", () => {
    try {
      validateBatch([slice(0, 2026), slice(10, 2025)]);
      throw new Error("expected validateBatch to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(PygParseError);
      expect((error as PygParseError).code).toBe("mixed-years");
      expect((error as PygParseError).message).toContain("2025");
      expect((error as PygParseError).message).toContain("2026");
    }
  });

  it("accepts a batch of a single year", () => {
    expect(() => validateBatch([slice(0), slice(1), slice(5)])).not.toThrow();
  });
});

describe("validateBatch — meses repetidos", () => {
  it("rejects two files declaring the same month", () => {
    try {
      validateBatch([slice(2), slice(2)]);
      throw new Error("expected validateBatch to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(PygParseError);
      expect((error as PygParseError).code).toBe("duplicate-month");
      expect((error as PygParseError).message).toContain("Marzo");
    }
  });
});

describe("applyBatch — seis meses de golpe", () => {
  it("applies every slice in ascending month order with one final result", () => {
    const slices = [slice(2), slice(0), slice(1)];
    const { datasets, loadedMonths } = applyBatch([], [], slices);
    expect(loadedMonths).toEqual([0, 1, 2]);
    const norte = datasets.find((d) => d.centerId === "sucursal-norte");
    expect(norte?.accounts.find((a) => a.code === "4")?.values.slice(0, 3)).toEqual([
      100, 100, 100,
    ]);
  });

  it("throws (writing nothing usable) when the batch itself is invalid", () => {
    expect(() => applyBatch([], [], [slice(2), slice(2)])).toThrow(PygParseError);
  });
});
