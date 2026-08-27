/**
 * Synthetic MicroPlus fixtures, mirroring the STRUCTURE verified against `.context/microplus/
 * mayo.xls` (see the change's design.md): a preamble spread across arbitrary cells, the range in
 * SEPARATE cells (`Desde:` · date · `Hasta:` · date), a `CODIGO` / `NOMBRE DE LA CUENTA` header,
 * a body indented to the right one column per level, blank rows between accounts, and a
 * `RESULTADO:` line. Invented data; tests must never depend on the git-ignored samples.
 *
 * The numbers reproduce the sample's shape at hand-checkable scale: expenses NEGATIVE, a
 * positive counter-account inside branch 5, parents equal to the sum of their children, and
 * `RESULTADO = 4 + 5`.
 */
import * as XLSX from "xlsx";
import type { Cell as FixtureCell } from "./grid";

/** Places cells at their column indexes, leaving the gaps MicroPlus actually leaves. */
function row(cells: [number, FixtureCell][]): FixtureCell[] {
  const line: FixtureCell[] = [];
  for (const [col, value] of cells) {
    while (line.length < col) {
      line.push(null);
    }
    line[col] = value;
  }
  return line;
}

const PREAMBLE = (from: string, to: string): FixtureCell[][] => [
  [],
  row([
    [3, "HOSPITAL GENERAL PRIVADO DURAN"],
    [23, "Página:"],
    [26, "1 de 5"],
  ]),
  [],
  row([
    [3, "BALANCE DE PERDIDAS Y GANANCIAS"],
    [23, "Fecha:"],
    // A print date well outside the reported period, as an Excel serial — never the period.
    [26, 46220.0000000001],
  ]),
  [],
  row([
    [3, "Desde:"],
    [5, from],
    [9, "Hasta:"],
    [10, to],
  ]),
  [],
  row([
    [1, "CODIGO"],
    [7, "NOMBRE DE LA CUENTA"],
    [18, "SALDO"],
  ]),
  [],
];

/** Code · name · value, at the column the account's own level is indented to. */
function account(code: string, name: string, valueCol: number, value: FixtureCell): FixtureCell[] {
  return row([
    [1, code],
    [7, `${" ".repeat(valueCol - 14)}${name}`],
    [valueCol, value],
  ]);
}

/** Ingresos 3,500.00 · Gastos −1,240.50 (with a positive counter-account) · RESULTADO 2,259.50. */
const BODY: FixtureCell[][] = [
  account("4.", "INGRESOS", 23, "3,500.00"),
  [],
  account("4.1.", "INGRESOS DE ACTIVIDADES ORDINARIAS", 22, "3,500.00"),
  [],
  account("4.1.01.", "VENTA DE BIENES", 19, "2,000.00"),
  [],
  account("4.1.01.01", "Ventas Bienes Tarifa 0%.", 17, "1,200.00"),
  [],
  account("4.1.01.02", "Ventas Bienes Tarifa 12%.", 17, "800.00"),
  [],
  account("4.1.02.", "VENTA DE SERVICIOS", 19, "1,500.00"),
  [],
  account("4.1.02.01", "Servicios Hospitalarios", 17, "1,500.00"),
  [],
  account("5.", "COSTOS Y GASTOS", 23, "-1,240.50"),
  [],
  account("5.1.", "COSTO DE VENTAS", 22, "-1,000.00"),
  [],
  account("5.1.01", "Costo de Medicinas", 16, "-1,000.00"),
  [],
  account("5.2.", "GASTOS DE ADMINISTRACION", 22, "-240.50"),
  [],
  account("5.2.01", "Sueldos y Salarios", 16, "-390.50"),
  [],
  // The counter-account the file marks in its own name: positive inside a negative branch.
  account("5.2.03", "(-) DESCUENTO EN COMPRAS", 16, "150.00"),
  [],
  row([
    [0, "RESULTADO:"],
    [21, 2259.5],
  ]),
  row([
    [2, "Presidente"],
    [11, "Gerente"],
    [21, "Contador"],
  ]),
];

/** A well-formed month: `01/05/2026` – `31/05/2026`. */
export const MICROPLUS_AOA: FixtureCell[][] = [...PREAMBLE("01/05/2026", "31/05/2026"), ...BODY];

/** The accumulated export the sample actually is: five months in one file. */
export const MICROPLUS_ACCUMULATED_AOA: FixtureCell[][] = [
  ...PREAMBLE("01/01/2026", "31/05/2026"),
  ...BODY,
];

/** A month cut short on the 15th. */
export const MICROPLUS_PARTIAL_MONTH_AOA: FixtureCell[][] = [
  ...PREAMBLE("01/05/2026", "15/05/2026"),
  ...BODY,
];

/** No `Desde:` line anywhere in the preamble. */
export const MICROPLUS_NO_RANGE_AOA: FixtureCell[][] = [
  ...PREAMBLE("01/05/2026", "31/05/2026").filter(
    (line) => !line.some((cell) => typeof cell === "string" && cell.trim() === "Desde:"),
  ),
  ...BODY,
];

/** A parent marker that lies: `5.2.03.` is dotted but nothing is nested under it. */
export const MICROPLUS_STRAY_MARKER_AOA: FixtureCell[][] = MICROPLUS_AOA.map((line) =>
  line[1] === "5.2.03"
    ? row([
        [1, "5.2.03."],
        [7, "(-) DESCUENTO EN COMPRAS"],
        [16, "150.00"],
      ])
    : line,
);

/** The file's own `RESULTADO:` disagrees with the sum of its accounts. */
export const MICROPLUS_MISMATCHED_RESULT_AOA: FixtureCell[][] = MICROPLUS_AOA.map((line) =>
  line[0] === "RESULTADO:"
    ? row([
        [0, "RESULTADO:"],
        [21, 999],
      ])
    : line,
);

/** Preamble and header only — no account rows. */
export const MICROPLUS_NO_ACCOUNTS_AOA: FixtureCell[][] = PREAMBLE("01/05/2026", "31/05/2026");

/** The sample's own sheet name: `Sheet1`, which is no more contract than the file name is. */
export function aoaToXlsxBuffer(aoa: FixtureCell[][]): ArrayBuffer {
  const sheet = XLSX.utils.aoa_to_sheet(aoa);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "Sheet1");
  return XLSX.write(workbook, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
}
