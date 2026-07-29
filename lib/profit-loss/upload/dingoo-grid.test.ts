import { describe, expect, it } from "vitest";
import {
  findDingooCompany,
  findDingooHeader,
  findDingooRange,
  findDingooResult,
  readDingooAccounts,
} from "./dingoo-grid";
import type { Cell } from "./grid";

const isCode = (code: string) => /^\d+(\.\d+)*$/.test(code);

/** The layout of the real file once `readGrid` has reindexed it: code, name and value one
 * column apart from each other and NOT starting at index 0. */
function grid(): Cell[][] {
  return [
    [null, null, null, "REPORTE"],
    [null, null, null, "ESTADO DE RESULTADOS"],
    [null, null, null, "DELICMAR S.A.S"],
    [null, null, null, "DELICMAR S.A.S."],
    [null, "Desde el 01/05/2026 al 31/05/2026. Estado: Aprobados"],
    [],
    [null, "Código", "", "Nombre de la cuenta", "", "", "", "Saldo"],
    [null, "4", null, "INGRESOS", null, null, null, -3500],
    [null, "4.01.11", null, "(-) DEVOLUCIONES EN VENTAS", null, null, null, 150],
    [],
    [null, "5.02.01.01.01", null, "SUELDOS", null, null, null, 240.5],
    [null, null, null, null, "Resultado del ejercicio (Utilidad o pérdida): ", null, null, -2284.5],
  ];
}

describe("findDingooHeader", () => {
  it("localiza las tres columnas por sus etiquetas, no por su posición", () => {
    expect(findDingooHeader(grid())).toEqual({ row: 6, codeCol: 1, nameCol: 3, valueCol: 7 });
  });

  it("lee igual una rejilla que sí empieza en la columna 0", () => {
    const shifted = grid().map((row) => row.slice(1));
    expect(findDingooHeader(shifted)).toEqual({ row: 6, codeCol: 0, nameCol: 2, valueCol: 6 });
  });

  it("ignora mayúsculas, acentos y espacios sobrantes", () => {
    const rows: Cell[][] = [[" CODIGO ", "NOMBRE  DE   LA CUENTA", "  saldo"]];
    expect(findDingooHeader(rows)).toEqual({ row: 0, codeCol: 0, nameCol: 1, valueCol: 2 });
  });

  it("no acepta una fila sin la columna Saldo: aquí sí es la columna del valor", () => {
    const rows: Cell[][] = [["Código", "Nombre de la cuenta"]];
    expect(findDingooHeader(rows)).toBeNull();
  });

  it("devuelve null cuando no hay fila de encabezado", () => {
    expect(findDingooHeader([[null, "4", null, "INGRESOS"]])).toBeNull();
  });
});

describe("findDingooRange", () => {
  it("lee la línea de una sola cadena con conector `al`", () => {
    expect(findDingooRange(grid())).toEqual({
      row: 4,
      range: {
        fromDay: 1,
        fromMonth: 4,
        fromYear: 2026,
        toDay: 31,
        toMonth: 4,
        toYear: 2026,
      },
    });
  });

  it("tolera cualquier cola tras la fecha final", () => {
    const rows: Cell[][] = [[null, null, "Desde el 01/05/2026 al 31/05/2026. Estado: Todos"]];
    expect(findDingooRange(rows)?.range.toDay).toBe(31);
  });

  it("no exige que la línea viva en una columna concreta", () => {
    const rows: Cell[][] = [[null, null, null, null, null, "Desde el 01/03/2026 al 31/03/2026"]];
    expect(findDingooRange(rows)?.range.fromMonth).toBe(2);
  });

  it("no acepta la línea del estado único, que usa `hasta el`", () => {
    const rows: Cell[][] = [["Desde el 01/05/2026 hasta el 31/05/2026"]];
    expect(findDingooRange(rows)).toBeNull();
  });

  it("devuelve null cuando no hay línea de rango", () => {
    expect(findDingooRange([[null, "Código", null, "Nombre de la cuenta"]])).toBeNull();
  });
});

describe("findDingooCompany", () => {
  it("salta los rótulos del propio reporte y devuelve la razón social", () => {
    expect(findDingooCompany(grid(), 4)).toBe("DELICMAR S.A.S");
  });

  it("se queda con la PRIMERA de las dos líneas de identidad, no con el nombre comercial", () => {
    expect(findDingooCompany(grid(), 4)).not.toBe("DELICMAR S.A.S.");
  });

  it("no mira por debajo de la fila de rango", () => {
    expect(findDingooCompany(grid(), 0)).toBe("");
  });

  it("devuelve cadena vacía cuando el preámbulo solo trae rótulos", () => {
    const rows: Cell[][] = [
      [null, "REPORTE"],
      [null, "Estado de Resultados"],
    ];
    expect(findDingooCompany(rows, 2)).toBe("");
  });
});

describe("findDingooResult", () => {
  it("lee el valor a la derecha de la línea de resultado", () => {
    expect(findDingooResult(grid())).toBe(-2284.5);
  });

  it("basta con el prefijo: el resto de la frase es prosa del reporte", () => {
    const rows: Cell[][] = [[null, "RESULTADO DEL EJERCICIO", null, 12.5]];
    expect(findDingooResult(rows)).toBe(12.5);
  });

  it("devuelve null cuando el archivo no trae esa línea", () => {
    expect(findDingooResult([[null, "4", null, "INGRESOS", null, null, null, -3500]])).toBeNull();
  });
});

describe("readDingooAccounts", () => {
  const rows = grid();
  const header = findDingooHeader(rows)!;

  it("lee el valor de la columna Saldo en todos los niveles", () => {
    expect(readDingooAccounts(rows, header, isCode)).toEqual([
      { code: "4", name: "INGRESOS", value: -3500 },
      { code: "4.01.11", name: "(-) DEVOLUCIONES EN VENTAS", value: 150 },
      { code: "5.02.01.01.01", name: "SUELDOS", value: 240.5 },
    ]);
  });

  it("una celda Saldo vacía vale 0 y no adopta el número de otra columna", () => {
    const withStray = rows.map((row) =>
      row[header.codeCol] === "5.02.01.01.01"
        ? [null, "5.02.01.01.01", null, "SUELDOS", null, null, 999, null]
        : row,
    );
    const sueldos = readDingooAccounts(withStray, header, isCode).find(
      (a) => a.code === "5.02.01.01.01",
    );
    expect(sueldos?.value).toBe(0);
  });

  it("ignora las filas en blanco y la línea de resultado", () => {
    expect(readDingooAccounts(rows, header, isCode)).toHaveLength(3);
  });

  it("ignora una fila cuyo código no satisface el predicado", () => {
    const withJunk: Cell[][] = [...rows, [null, "TOTAL", null, "Suma", null, null, null, 1]];
    expect(readDingooAccounts(withJunk, header, isCode)).toHaveLength(3);
  });
});
