import { describe, expect, it } from "vitest";
import { PygParseError } from "../errors";
import { applyBatch, validateBatch } from "./batch";
import type { MonthSlice } from "./batch";

function slice(month: number, year = 2026, companyName = "HOTELERA ANDES S.A."): MonthSlice {
  return {
    kind: "month-slice",
    mode: "centers",
    system: "monthly-centers",
    year,
    month,
    companyName,
    centers: [
      {
        name: "SUCURSAL NORTE",
        centerId: "sucursal-norte",
        accounts: [{ code: "4", name: "Ingresos", values: [100] }],
      },
    ],
    general: [{ code: "4", name: "Ingresos", values: [100] }],
    warnings: [],
  };
}

function singleSlice(month: number, year = 2026): MonthSlice {
  return {
    kind: "month-slice",
    mode: "single",
    system: "monthly-single",
    year,
    month,
    companyName: "NOMIK HOTELS S.A.S.",
    centers: [
      { name: "", centerId: null, accounts: [{ code: "4", name: "Ingresos", values: [100] }] },
    ],
    warnings: [],
  };
}

describe("validateBatch — identidad del propio lote", () => {
  it("rejects a batch mixing single-mode and centers-mode files", () => {
    try {
      validateBatch([slice(0), singleSlice(1)]);
      throw new Error("expected validateBatch to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(PygParseError);
      expect((error as PygParseError).code).toBe("mixed-identity");
    }
  });

  it("rejects a batch mixing accounting systems", () => {
    // Misma empresa, mismo año, meses distintos: sin esta comprobación el lote entraría y
    // fusionaría dos planes de cuentas incompatibles.
    try {
      validateBatch([
        { ...singleSlice(0), companyName: "HOSPITAL X" },
        { ...singleSlice(1), companyName: "HOSPITAL X", system: "microplus" },
      ]);
      throw new Error("expected validateBatch to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(PygParseError);
      expect((error as PygParseError).code).toBe("mixed-identity");
      expect((error as PygParseError).message).toContain("sistemas contables distintos");
    }
  });

  it("rejects a batch mixing companies, naming both", () => {
    try {
      validateBatch([slice(0, 2026, "NOMIK"), slice(1, 2026, "DARWIN & WOLF")]);
      throw new Error("expected validateBatch to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(PygParseError);
      expect((error as PygParseError).code).toBe("mixed-identity");
      expect((error as PygParseError).message).toContain("NOMIK");
      expect((error as PygParseError).message).toContain("DARWIN & WOLF");
    }
  });
});

describe("validateBatch — varios años", () => {
  it("accepts a batch mixing years: each one lands on its own", () => {
    expect(() => validateBatch([slice(0, 2026), slice(10, 2025)])).not.toThrow();
  });

  it("accepts the same month of two different years", () => {
    // `(2025, marzo)` y `(2026, marzo)` son dos columnas de dos datasets distintos.
    expect(() => validateBatch([slice(2, 2025), slice(2, 2026)])).not.toThrow();
  });

  it("rejects the same (year, month) twice, naming both", () => {
    try {
      validateBatch([slice(2, 2026), slice(2, 2026)]);
      throw new Error("expected validateBatch to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(PygParseError);
      expect((error as PygParseError).code).toBe("duplicate-month");
      expect((error as PygParseError).message).toContain("Marzo");
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
    const { datasets, loadedMonthsByYear } = applyBatch([], {}, slices);
    expect(loadedMonthsByYear).toEqual({ 2026: [0, 1, 2] });
    const norte = datasets.find((d) => d.centerId === "sucursal-norte");
    expect(norte?.accounts.find((a) => a.code === "4")?.values.slice(0, 3)).toEqual([
      100, 100, 100,
    ]);
  });

  it("throws (writing nothing usable) when the batch itself is invalid", () => {
    expect(() => applyBatch([], {}, [slice(2), slice(2)])).toThrow(PygParseError);
  });

  it("un lote de dos años deja un dataset por centro-año y cobertura separada", () => {
    const { datasets, loadedMonthsByYear } = applyBatch([], {}, [
      slice(0, 2025),
      slice(1, 2025),
      slice(0, 2026),
    ]);
    expect(loadedMonthsByYear).toEqual({ 2025: [0, 1], 2026: [0] });
    const norte2025 = datasets.filter((d) => d.centerId === "sucursal-norte" && d.year === 2025);
    const norte2026 = datasets.filter((d) => d.centerId === "sucursal-norte" && d.year === 2026);
    expect(norte2025).toHaveLength(1);
    expect(norte2026).toHaveLength(1);
    // Cada año escribe SOLO sus meses: febrero de 2026 nunca se cargó.
    expect(norte2025[0].accounts.find((a) => a.code === "4")?.values[1]).toBe(100);
    expect(norte2026[0].accounts.find((a) => a.code === "4")?.values[1]).toBe(0);
  });

  it("no toca los años que el lote no trae", () => {
    const first = applyBatch([], {}, [slice(0, 2025)]);
    const second = applyBatch(first.datasets, first.loadedMonthsByYear, [slice(0, 2026)]);
    expect(second.loadedMonthsByYear).toEqual({ 2025: [0], 2026: [0] });
    expect(second.datasets.filter((d) => d.year === 2025)).toHaveLength(first.datasets.length);
  });
});
