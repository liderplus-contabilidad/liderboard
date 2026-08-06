import * as XLSX from "xlsx";
import { describe, expect, it } from "vitest";
import { compactLabel, normalizeLabel, readGrid, readWorkbook, toNumber } from "./workbook";

function buffer(aoa: (string | number | null)[][]): ArrayBuffer {
  const sheet = XLSX.utils.aoa_to_sheet(aoa);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "Hoja1");
  return XLSX.write(workbook, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
}

describe("readWorkbook", () => {
  it("lee un workbook válido", () => {
    const workbook = readWorkbook(buffer([["a", 1]]));
    expect(workbook?.SheetNames).toEqual(["Hoja1"]);
  });

  it("null en vez de lanzar cuando el buffer no es un Excel", () => {
    // Texto plano SheetJS lo acepta como CSV de una celda; un ZIP truncado es lo que hace
    // fallar `XLSX.read` de verdad ("Unsupported ZIP file"), y es lo que este caso cubre.
    const garbage = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0]).buffer;
    expect(readWorkbook(garbage)).toBeNull();
  });
});

describe("readGrid", () => {
  it("lee la hoja como una grilla de celdas", () => {
    const workbook = readWorkbook(
      buffer([
        ["a", 1],
        ["b", 2],
      ]),
    )!;
    expect(readGrid(workbook, "Hoja1")).toEqual([
      ["a", 1],
      ["b", 2],
    ]);
  });

  it("null cuando el nombre de hoja no existe en el workbook", () => {
    const workbook = readWorkbook(buffer([["a", 1]]))!;
    expect(readGrid(workbook, "NoExiste")).toBeNull();
  });

  it("null cuando el nombre de hoja es undefined", () => {
    const workbook = readWorkbook(buffer([["a", 1]]))!;
    expect(readGrid(workbook, undefined)).toBeNull();
  });
});

describe("toNumber", () => {
  it("pasa un número finito tal cual", () => {
    expect(toNumber(42.5)).toBe(42.5);
  });

  it("convierte texto numérico", () => {
    expect(toNumber("42.5")).toBe(42.5);
  });

  it("0 para null, texto no numérico o NaN/Infinity", () => {
    expect(toNumber(null)).toBe(0);
    expect(toNumber("no es un número")).toBe(0);
    expect(toNumber(Number.POSITIVE_INFINITY)).toBe(0);
  });
});

describe("normalizeLabel", () => {
  it("quita acentos y normaliza a minúsculas", () => {
    expect(normalizeLabel("Márzo")).toBe("marzo");
    expect(normalizeLabel("CÉDULA")).toBe("cedula");
  });

  it("recorta espacios externos pero conserva los internos", () => {
    expect(normalizeLabel("  Nombre  Cuenta  ")).toBe("nombre  cuenta");
  });

  it('"" para null', () => {
    expect(normalizeLabel(null)).toBe("");
  });
});

describe("compactLabel", () => {
  it("colapsa espacios internos, incluidos saltos de línea", () => {
    expect(compactLabel("CODIGO \nSECTORIAL")).toBe("codigo sectorial");
    expect(compactLabel("NOMBRE  DE LA  CUENTA")).toBe("nombre de la cuenta");
  });
});
