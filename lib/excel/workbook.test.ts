import * as XLSX from "xlsx";
import { describe, expect, it } from "vitest";
import {
  compactLabel,
  declaredRowCount,
  normalizeLabel,
  readDenseRows,
  readGrid,
  readWorkbook,
  readWorkbookDense,
  toNumber,
} from "./workbook";

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
    // Plain text is accepted by SheetJS as a one-cell CSV; a truncated ZIP is what really makes
    // `XLSX.read` fail ("Unsupported ZIP file"), and that is what this case covers.
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

describe("readWorkbookDense / readDenseRows", () => {
  it("recorre las filas una a una, sin construir la grilla entera", () => {
    const workbook = readWorkbookDense(
      buffer([
        ["CODIGO", "NETO"],
        ["A", 1.5],
        ["B", null],
      ]),
    );
    const rows = [...(readDenseRows(workbook!, "Hoja1") ?? [])];
    expect(rows[0]).toEqual(["CODIGO", "NETO"]);
    expect(rows[1]).toEqual(["A", 1.5]);
    // Una celda vacía es `null`, no una cadena vacía: es lo que separa «no vino» de «vino vacío».
    expect(rows[2][1] ?? null).toBeNull();
  });

  it("null cuando la hoja no existe", () => {
    const workbook = readWorkbookDense(buffer([["a"]]));
    expect(readDenseRows(workbook!, "No existe")).toBeNull();
  });

  it("entrega una celda de FECHA como texto, en la forma que escribe el sistema contable", () => {
    const sheet = XLSX.utils.aoa_to_sheet([["FECHA"], [new Date(2026, 2, 15, 9, 30, 0)]]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, sheet, "Hoja1");
    const data = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
    const rows = [...(readDenseRows(readWorkbookDense(data)!, "Hoja1") ?? [])];
    // La fecha NO vuelve como número de serie ni como Date: vuelve como el texto que el parser lee.
    expect(rows[1][0]).toBe("2026-03-15 09:30:00.000");
  });

  it("funciona también sobre un workbook leído sin modo denso", () => {
    const workbook = readWorkbook(
      buffer([
        ["a", 1],
        ["b", 2],
      ]),
    );
    const rows = [...(readDenseRows(workbook!, "Hoja1") ?? [])];
    expect(rows).toEqual([
      ["a", 1],
      ["b", 2],
    ]);
  });
});

describe("declaredRowCount", () => {
  it("lee cuántas filas declara la hoja en su propio rango", () => {
    const workbook = readWorkbookDense(buffer([["a"], ["b"], ["c"]]));
    expect(declaredRowCount(workbook!, "Hoja1")).toBe(3);
  });

  it("null cuando la hoja no declara rango", () => {
    const workbook = readWorkbookDense(buffer([["a"]]));
    delete workbook!.Sheets["Hoja1"]["!ref"];
    expect(declaredRowCount(workbook!, "Hoja1")).toBeNull();
  });
});

describe("una fecha no se desplaza de mes al leerla", () => {
  it("el primero del mes a medianoche sigue siendo el primero del mes", () => {
    // La trampa real: con las partes LOCALES de la fecha, en UTC−5 esto volvía como el 28 de
    // febrero a las 19:00 y la línea quedaba archivada en el mes anterior.
    const sheet = XLSX.utils.aoa_to_sheet([["FECHA"], [new Date(2026, 2, 1, 0, 0, 0)]]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, sheet, "Hoja1");
    const data = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
    const rows = [...(readDenseRows(readWorkbookDense(data)!, "Hoja1") ?? [])];
    expect(String(rows[1][0]).slice(0, 10)).toBe("2026-03-01");
  });
});
