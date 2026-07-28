import { describe, expect, it } from "vitest";
import { PygParseError } from "../errors";
import { parseMonthlyFilename } from "./filename";

function errorCode(fileName: string): string {
  try {
    parseMonthlyFilename(fileName);
  } catch (error) {
    if (error instanceof PygParseError) {
      return error.code;
    }
    throw error;
  }
  throw new Error("expected parseMonthlyFilename to fail");
}

describe("parseMonthlyFilename — nombres válidos", () => {
  it("resuelve año y mes de nombres bien formados", () => {
    expect(parseMonthlyFilename("PyG-2026-01-darwolf.xlsx")).toEqual({ year: 2026, month: 0 });
    expect(parseMonthlyFilename("PyG-2026-02.xlsx")).toEqual({ year: 2026, month: 1 });
    expect(parseMonthlyFilename("PyG-2026-06-corregido-v2.xlsx")).toEqual({
      year: 2026,
      month: 5,
    });
  });

  it("acepta la extensión .xls", () => {
    expect(parseMonthlyFilename("PyG-2025-12.xls")).toEqual({ year: 2025, month: 11 });
  });

  it("ignora la caja del prefijo y de la extensión", () => {
    expect(parseMonthlyFilename("pyg-2026-03.xlsx")).toEqual({ year: 2026, month: 2 });
    expect(parseMonthlyFilename("PYG-2026-03.XLSX")).toEqual({ year: 2026, month: 2 });
  });
});

describe("parseMonthlyFilename — nombre sin periodo", () => {
  it("rechaza un nombre que no declara año y mes", () => {
    expect(errorCode("enero.xlsx")).toBe("invalid-filename");
  });

  it("rechaza un nombre con el prefijo en otro lugar", () => {
    expect(errorCode("reporte-PyG-2026-01.xlsx")).toBe("invalid-filename");
  });
});

describe("parseMonthlyFilename — mes fuera de rango", () => {
  it("rechaza un mes mayor a 12", () => {
    expect(errorCode("PyG-2026-13-x.xlsx")).toBe("month-out-of-range");
  });

  it("rechaza un mes cero", () => {
    expect(errorCode("PyG-2026-00-x.xlsx")).toBe("month-out-of-range");
  });
});
