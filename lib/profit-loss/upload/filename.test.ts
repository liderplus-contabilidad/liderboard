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

describe("parseMonthlyFilename — nombres que el sistema operativo renombró", () => {
  it("acepta el sufijo de descarga duplicada, que no trae guion", () => {
    expect(parseMonthlyFilename("PyG-2026-01 (1).xlsx")).toEqual({ year: 2026, month: 0 });
    expect(parseMonthlyFilename("PyG-2026-01 2.xlsx")).toEqual({ year: 2026, month: 0 });
    expect(parseMonthlyFilename("PyG-2026-01 copia.xlsx")).toEqual({ year: 2026, month: 0 });
  });

  it("acepta otros separadores entre prefijo, año y mes", () => {
    expect(parseMonthlyFilename("PyG_2026_01_abc.xlsx")).toEqual({ year: 2026, month: 0 });
    expect(parseMonthlyFilename("PyG 2026 01.xlsx")).toEqual({ year: 2026, month: 0 });
    expect(parseMonthlyFilename("PyG.2026.01.xlsx")).toEqual({ year: 2026, month: 0 });
  });

  it("acepta el ruido que anteponen el correo y los gestores de archivos", () => {
    expect(parseMonthlyFilename("Copia de PyG-2026-01.xlsx")).toEqual({ year: 2026, month: 0 });
    expect(parseMonthlyFilename("(1) PyG-2026-01.xlsx")).toEqual({ year: 2026, month: 0 });
    expect(parseMonthlyFilename("reporte-PyG-2026-01.xlsx")).toEqual({ year: 2026, month: 0 });
  });

  it("normaliza guiones tipográficos y espacios sobrantes", () => {
    expect(parseMonthlyFilename("PyG–2026–01–abc.xlsx")).toEqual({ year: 2026, month: 0 });
    expect(parseMonthlyFilename("  PyG-2026-01.xlsx  ")).toEqual({ year: 2026, month: 0 });
    expect(parseMonthlyFilename("PyG-2026-01.xlsx ")).toEqual({ year: 2026, month: 0 });
  });
});

describe("parseMonthlyFilename — nombre sin periodo", () => {
  it("rechaza un nombre que no declara año y mes", () => {
    expect(errorCode("enero.xlsx")).toBe("invalid-filename");
    expect(errorCode("consolidado-2026.xlsx")).toBe("invalid-filename");
  });

  it("rechaza el prefijo pegado dentro de otra palabra", () => {
    expect(errorCode("apygeo-2026-01.xlsx")).toBe("invalid-filename");
  });

  it("rechaza un tercer dígito tras el mes, que vuelve ambiguo el periodo", () => {
    expect(errorCode("PyG-2026-012.xlsx")).toBe("invalid-filename");
  });

  it("rechaza un nombre que no termina en Excel", () => {
    expect(errorCode("PyG-2026-01.xlsx.pdf")).toBe("invalid-filename");
    expect(errorCode("PyG-2026-01")).toBe("invalid-filename");
  });

  it("nombra el archivo recibido en el mensaje, no solo el patrón esperado", () => {
    try {
      parseMonthlyFilename("enero.xlsx");
    } catch (error) {
      expect((error as PygParseError).message).toContain("enero.xlsx");
    }
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
