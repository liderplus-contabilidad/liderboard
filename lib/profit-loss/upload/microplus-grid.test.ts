import { describe, expect, it } from "vitest";
import type { Cell } from "./grid";
import {
  findMicroplusCompany,
  findMicroplusHeader,
  findMicroplusRange,
  findMicroplusResult,
  microplusLabel,
  readMicroplusAccounts,
  toMicroplusNumber,
} from "./microplus-grid";

/** The strategy's own code shape, passed in the same way the real one does. */
const ACCOUNT_CODE = (code: string): boolean => /^\d+(\.\d+)*\.?$/.test(code);

/** A bare grid shaped like MicroPlus': preamble spread across arbitrary cells, range in
 * separate cells, header, then an indented body. Deliberately NOT the real columns — every
 * test here exists to prove the reading is anchored on labels, not coordinates. */
function grid(): Cell[][] {
  const rows: Cell[][] = [];
  const at = (row: number, cells: [number, Cell][]): void => {
    const line: Cell[] = [];
    for (const [col, value] of cells) {
      while (line.length < col) {
        line.push(null);
      }
      line[col] = value;
    }
    rows[row] = line;
  };
  at(0, []);
  at(1, [
    [3, "HOSPITAL GENERAL PRIVADO DURAN"],
    [23, "Página:"],
    [26, "1 de 5"],
  ]);
  at(2, []);
  at(3, [
    [3, "BALANCE DE PERDIDAS Y GANANCIAS"],
    [23, "Fecha:"],
    [26, 46220.0000000001],
  ]);
  at(4, []);
  at(5, [
    [3, "Desde:"],
    [5, "01/05/2026"],
    [9, "Hasta:"],
    [10, "31/05/2026"],
  ]);
  at(6, []);
  at(7, [
    [1, "CODIGO"],
    [7, "NOMBRE DE LA CUENTA"],
    [18, "SALDO"],
  ]);
  at(8, []);
  at(9, [
    [1, "4."],
    [7, " INGRESOS"],
    [23, "1,221,507.82"],
  ]);
  at(10, []);
  at(11, []);
  at(12, [
    [1, "4.1.01.01.01"],
    [7, "          Ventas Bienes Tarifa   0%."],
    [16, "118,499.42"],
  ]);
  at(13, []);
  at(14, [
    [0, "RESULTADO:"],
    [21, 168622.2833],
  ]);
  at(15, [
    [2, "Presidente"],
    [11, "Gerente"],
    [21, "Contador"],
  ]);
  for (let i = 0; i < rows.length; i++) {
    rows[i] ??= [];
  }
  return rows;
}

function withRow(row: number, cells: [number, Cell][]): Cell[][] {
  const rows = grid();
  const line: Cell[] = [];
  for (const [col, value] of cells) {
    while (line.length < col) {
      line.push(null);
    }
    line[col] = value;
  }
  rows[row] = line;
  return rows;
}

function accountsOf(rows: Cell[][]) {
  const header = findMicroplusHeader(rows);
  if (!header) {
    throw new Error("expected a header row");
  }
  return readMicroplusAccounts(rows, header, ACCOUNT_CODE);
}

describe("microplusLabel — etiquetas sin mayúsculas, acentos ni espacios sobrantes", () => {
  it("iguala mayúsculas, acentos y espacios de más", () => {
    expect(microplusLabel("  NOMBRE  DE LA  CUENTA ")).toBe("nombre de la cuenta");
    expect(microplusLabel("Página:")).toBe("pagina:");
    expect(microplusLabel(null)).toBe("");
  });
});

describe("findMicroplusHeader", () => {
  it("localiza la fila y las dos columnas por sus etiquetas", () => {
    expect(findMicroplusHeader(grid())).toEqual({ row: 7, codeCol: 1, nameCol: 7 });
  });

  it("lee igual una plantilla que desplaza sus columnas", () => {
    const rows = withRow(7, [
      [0, "código"],
      [3, "Nombre de la Cuenta"],
    ]);
    expect(findMicroplusHeader(rows)).toEqual({ row: 7, codeCol: 0, nameCol: 3 });
  });

  it("no acierta cuando ninguna fila trae las dos etiquetas a la vez", () => {
    const rows = withRow(7, [
      [1, "CODIGO"],
      [18, "SALDO"],
    ]);
    expect(findMicroplusHeader(rows)).toBeNull();
  });
});

describe("findMicroplusRange — el rango va en celdas separadas", () => {
  it("lee cada fecha como la siguiente celda no vacía tras su etiqueta", () => {
    expect(findMicroplusRange(grid())).toEqual({
      row: 5,
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

  it("lo lee igual con las etiquetas en otras columnas", () => {
    const rows = withRow(5, [
      [0, "desde:"],
      [1, "01/02/2026"],
      [2, "HASTA:"],
      [7, "28/02/2026"],
    ]);
    expect(findMicroplusRange(rows)?.range.fromMonth).toBe(1);
    expect(findMicroplusRange(rows)?.range.toDay).toBe(28);
  });

  it("devuelve null cuando no hay fila de rango", () => {
    expect(findMicroplusRange(withRow(5, [[3, "Otra cosa"]]))).toBeNull();
  });
});

describe("findMicroplusCompany — la paginación y la fecha de impresión se ignoran", () => {
  it("devuelve la empresa y no la etiqueta de paginación ni su valor", () => {
    expect(findMicroplusCompany(grid(), 5)).toBe("HOSPITAL GENERAL PRIVADO DURAN");
  });

  it("la ignora también cuando la paginación va primero en la fila", () => {
    const rows = withRow(1, [
      [0, "Página:"],
      [2, "1 de 5"],
      [4, "HOSPITAL GENERAL PRIVADO DURAN"],
    ]);
    expect(findMicroplusCompany(rows, 5)).toBe("HOSPITAL GENERAL PRIVADO DURAN");
  });
});

describe("findMicroplusResult", () => {
  it("lee el valor de la fila que empieza con RESULTADO:", () => {
    expect(findMicroplusResult(grid())).toBe(168622.2833);
  });

  it("devuelve null cuando el archivo no trae esa fila", () => {
    expect(findMicroplusResult(withRow(14, [[0, "Otra cosa"]]))).toBeNull();
  });
});

describe("toMicroplusNumber — texto con separador de miles", () => {
  it("lee un valor con separador de miles", () => {
    expect(toMicroplusNumber("1,221,507.82")).toBe(1221507.82);
  });

  it("lee un valor negativo", () => {
    expect(toMicroplusNumber("-545.96")).toBe(-545.96);
  });

  it("lee una celda ya numérica tal cual", () => {
    expect(toMicroplusNumber(168622.2833)).toBe(168622.2833);
  });

  it("una celda vacía vale cero", () => {
    expect(toMicroplusNumber(null)).toBe(0);
    expect(toMicroplusNumber("")).toBe(0);
  });
});

describe("readMicroplusAccounts — el valor es la única celda no nula a la derecha", () => {
  it("lee valores a distinta profundidad sin conocer la indentación", () => {
    const { accounts, warnings } = accountsOf(grid());
    expect(accounts).toEqual([
      { rawCode: "4.", name: "INGRESOS", value: 1221507.82 },
      { rawCode: "4.1.01.01.01", name: "Ventas Bienes Tarifa   0%.", value: 118499.42 },
    ]);
    expect(warnings).toEqual([]);
  });

  it("una cuenta sin ninguna celda a su derecha vale cero", () => {
    const { accounts } = accountsOf(
      withRow(12, [
        [1, "4.1.01.01.01"],
        [7, "Ventas Bienes"],
      ]),
    );
    expect(accounts[1]).toEqual({ rawCode: "4.1.01.01.01", name: "Ventas Bienes", value: 0 });
  });

  it("una fila con dos valores avisa y toma el primero", () => {
    const { accounts, warnings } = accountsOf(
      withRow(12, [
        [1, "4.1.01.01.01"],
        [7, "Ventas Bienes"],
        [16, "118,499.42"],
        [19, "999.00"],
      ]),
    );
    expect(accounts[1].value).toBe(118499.42);
    expect(warnings).toEqual([
      "La cuenta 4.1.01.01.01 trae 2 valores en su fila; se toma el primero.",
    ]);
  });

  it("ignora las filas en blanco, la fila de resultado y la de firmas", () => {
    const { accounts, warnings } = accountsOf(grid());
    expect(accounts).toHaveLength(2);
    expect(warnings).toEqual([]);
  });

  it("ignora una fila cuyo código no tiene la forma de una cuenta", () => {
    const { accounts } = accountsOf(
      withRow(12, [
        [1, "TOTAL"],
        [7, "Suma general"],
        [16, "1.00"],
      ]),
    );
    expect(accounts).toHaveLength(1);
  });
});
