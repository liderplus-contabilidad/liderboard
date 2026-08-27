/**
 * Synthetic Dingoo fixtures, mirroring the STRUCTURE verified against `.context/bongoo/
 * RptEstadoResultados.xlsx` (see the change's design.md): a preamble that opens with the
 * report's own titles (`REPORTE`, `ESTADO DE RESULTADOS`) before naming the client, the period
 * as ONE line with an `al` connector and a free tail, a `Código` / `Nombre de la cuenta` /
 * `Saldo` header, a body where EVERY level values in the `Saldo` column, and a
 * `Resultado del ejercicio` line. Invented data; tests must never depend on the git-ignored
 * samples.
 *
 * Everything sits one column to the RIGHT of column 0, the way the real file does (its codes
 * live in the sheet's column B). A reader that assumed "code at index 0" — the assumption the
 * other single-statement format licenses — fails here instead of in production.
 *
 * The numbers reproduce the sample's shape at hand-checkable scale: INCOME negative, a positive
 * counter-account inside branch 4, a negative counter-account inside branch 5, five levels of
 * depth with two-digit segments, and `Resultado = 4 + 5`.
 *
 * The real sample was run end to end through `resolveUpload` while writing this, and the figures
 * are recorded here because the file itself is git-ignored and no test may read it: system
 * `dingoo`, mode `single`, mayo 2026, company `DELICMAR S.A.S`, 47 accounts, ZERO warnings —
 * branch 4 negated to `+45.048,03`, branch 5 untouched at `+37.157,06`, `(-) DEVOLUCIONES EN
 * VENTAS` at `−341,25`, `DESCUENTOS EN COMPRAS` at `−25,00`, and `Utilidad = 7.890,97`, the
 * file's own `−7.890,97` negated, matching to the cent.
 */
import * as XLSX from "xlsx";
import type { Cell as FixtureCell } from "./grid";

/** Places cells at their column indexes, leaving column 0 empty as the real export does. */
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

const CODE_COL = 1;
const NAME_COL = 3;
const VALUE_COL = 7;

/** `REPORTE` and `ESTADO DE RESULTADOS` are the report talking about ITSELF; the razón social
 * and the nombre comercial follow, differing only in a trailing dot, exactly as in the sample. */
const IDENTITY: FixtureCell[][] = [
  [],
  row([[NAME_COL, "REPORTE"]]),
  row([[NAME_COL, "ESTADO DE RESULTADOS"]]),
  row([[NAME_COL, "DELICMAR S.A.S"]]),
  row([[NAME_COL, "DELICMAR S.A.S."]]),
  row([[NAME_COL, "TUNGURAHUA / AMBATO / AMBATO / LUIS ANIBAL GRANJA"]]),
  row([[NAME_COL, "0991045439 - 0958780660"]]),
  [],
  [],
];

/** The one-line range, with the tail the report writes after the final date. */
const rangeLine = (from: string, to: string): FixtureCell[][] => [
  row([[CODE_COL, `Desde el ${from} al ${to}. Estado: Aprobados`]]),
  [],
];

const HEADER: FixtureCell[][] = [
  row([
    [CODE_COL, "Código"],
    [2, ""],
    [NAME_COL, "Nombre de la cuenta"],
    [4, ""],
    [VALUE_COL, "Saldo"],
  ]),
];

const preamble = (from: string, to: string): FixtureCell[][] => [
  ...IDENTITY,
  ...rangeLine(from, to),
  ...HEADER,
];

/** Code · name · value — the value ALWAYS in the `Saldo` column, whatever the level. */
function account(code: string, name: string, value: FixtureCell): FixtureCell[] {
  return row([
    [CODE_COL, code],
    [NAME_COL, name],
    [VALUE_COL, value],
  ]);
}

/**
 * Ingresos −3,500.00 (with a positive counter-account) · Egresos +1,215.50 (with a negative
 * counter-account) · Resultado del ejercicio −2,284.50.
 *
 * After the import, with branch 4 negated: Ingresos +3,500.00 − Gastos 1,215.50 = Utilidad 2,284.50.
 */
const BODY: FixtureCell[][] = [
  account("4", "INGRESOS", -3500),
  account("4.01", "INGRESOS DE VENTAS ORDINARIAS", -3350),
  account("4.01.01", "VENTA DE BIENES", -3500),
  account("4.01.01.02", "VENTA DE BIENES SIN IVA", -3500),
  // The counter-account the file itself marks in its name: positive inside a negative branch, and
  // therefore subtracting revenue once negated.
  account("4.01.11", "(-) DEVOLUCIONES EN VENTAS", 150),
  account("4.01.11.01", "(-) DEVOLUCIONES EN VENTAS", 150),
  account("4.03", "OTROS INGRESOS", -150),
  account("4.03.01", "Otros Ingresos", -150),
  [],
  account("5", "EGRESOS", 1215.5),
  account("5.01", "COSTO DE VENTAS Y PRODUCCION", 975),
  account("5.01.01", "MATERIALES UTILIZADOS O PRODUCTOS VENDIDOS", 1000),
  account("5.01.01.01", "COSTOS DE VENTA", 1000),
  // Negative inside the branch that is NOT touched: it still subtracts expense after the import.
  account("5.01.02", "DESCUENTOS EN COMPRAS", -25),
  account("5.01.02.01", "DESCUENTOS EN COMPRAS", -25),
  account("5.02", "GASTOS", 240.5),
  account("5.02.01", "GASTOS GENERALES", 240.5),
  account("5.02.01.01", "SUELDOS, SALARIOS Y DEMAS REMUNERACIONES", 240.5),
  account("5.02.01.01.01", "SUELDOS", 240.5),
  [],
  row([
    [4, "Resultado del ejercicio (Utilidad o pérdida): "],
    [VALUE_COL, -2284.5],
  ]),
];

/** A well-formed month: `01/05/2026` – `31/05/2026`. */
export const DINGOO_AOA: FixtureCell[][] = [...preamble("01/05/2026", "31/05/2026"), ...BODY];

/** Five months in one file — the accumulated export. */
export const DINGOO_ACCUMULATED_AOA: FixtureCell[][] = [
  ...preamble("01/01/2026", "31/05/2026"),
  ...BODY,
];

/** A month cut short on the 15th. */
export const DINGOO_PARTIAL_MONTH_AOA: FixtureCell[][] = [
  ...preamble("01/05/2026", "15/05/2026"),
  ...BODY,
];

/** No range line anywhere in the preamble. */
export const DINGOO_NO_RANGE_AOA: FixtureCell[][] = [...IDENTITY, ...HEADER, ...BODY];

/** The range line is there, but no `Código` / `Nombre de la cuenta` row. */
export const DINGOO_NO_HEADER_AOA: FixtureCell[][] = [
  ...IDENTITY,
  ...rangeLine("01/05/2026", "31/05/2026"),
  ...BODY,
];

/** `5.02.01.01.01` comes with its `Saldo` cell empty — a zero, not a hunt for another column. */
export const DINGOO_EMPTY_VALUE_AOA: FixtureCell[][] = DINGOO_AOA.map((line) =>
  line[CODE_COL] === "5.02.01.01.01"
    ? row([
        [CODE_COL, "5.02.01.01.01"],
        [NAME_COL, "SUELDOS"],
        // A number sitting in a column that is NOT `Saldo`: it must be ignored, not adopted.
        [VALUE_COL - 1, 999],
      ])
    : line,
);

/** The file's own result row disagrees with the sum of its accounts. */
export const DINGOO_MISMATCHED_RESULT_AOA: FixtureCell[][] = DINGOO_AOA.map((line) =>
  typeof line[4] === "string" && line[4].startsWith("Resultado del ejercicio")
    ? row([
        [4, "Resultado del ejercicio (Utilidad o pérdida): "],
        [VALUE_COL, -999],
      ])
    : line,
);

/** The file carries no result row at all. */
export const DINGOO_NO_RESULT_AOA: FixtureCell[][] = DINGOO_AOA.filter(
  (line) => !(typeof line[4] === "string" && line[4].startsWith("Resultado del ejercicio")),
);

/** Preamble and header only — no account rows. */
export const DINGOO_NO_ACCOUNTS_AOA: FixtureCell[][] = preamble("01/05/2026", "31/05/2026");

/** The sample's own sheet name, which is no more contract than the file name is. */
export function aoaToXlsxBuffer(aoa: FixtureCell[][]): ArrayBuffer {
  const sheet = XLSX.utils.aoa_to_sheet(aoa);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "RptEstadoResultados");
  return XLSX.write(workbook, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
}
