/**
 * Synthetic fixtures for the monthly single-statement strategy, mirroring the STRUCTURE verified
 * against `.context/unitario/enero.xls` (see the change's design.md): a single `Total` value
 * column, and a `Desde el DD/MM/AAAA hasta el DD/MM/AAAA` range line the file's own period comes
 * from — no filename convention, no sheet-name convention. Invented data; tests must never
 * depend on the git-ignored samples.
 */
import * as XLSX from "xlsx";
import type { Cell as FixtureCell } from "./grid";

/** Well-formed month: a real calendar month, GENERAL == Σ leaves, matches the shared numbers
 * used across the other upload fixtures so totals stay hand-checkable. */
export const MONTHLY_SINGLE_AOA: FixtureCell[][] = [
  ["NOMIK HOTELS S.A.S."],
  ["Estado de Resultados"],
  ["Desde el 01/01/2026 hasta el 31/01/2026"],
  [null],
  [null, null, "Total"],
  [null],
  ["4", "Ingresos", 355],
  ["4.1", "Ventas", 330],
  ["4.1.1", "Ventas Habitaciones", 300],
  ["4.1.2", "Ventas Restaurante", 50],
  ["4.1.3", "Descuentos sobre Ventas", -20],
  ["4.2", "Otros Ingresos", 25],
  ["5", "Costos y Gastos", 95],
  ["5.1", "Gastos Operativos", 95],
  ["5.1.1", "Sueldos", 80],
  ["5.1.2", "Servicios", 15],
  ["5.1.2.1", "Energía Eléctrica", 15],
  [null, "Utilidad o Perdida", 260],
];

/** Same body, February of a non-leap year — range ends the 28th. */
export const FEBRUARY_AOA: FixtureCell[][] = MONTHLY_SINGLE_AOA.map((row) =>
  row[0] === "Desde el 01/01/2026 hasta el 31/01/2026"
    ? ["Desde el 01/02/2026 hasta el 28/02/2026"]
    : row,
);

/** Same body, a leap February — range ends the 29th. */
export const LEAP_FEBRUARY_AOA: FixtureCell[][] = MONTHLY_SINGLE_AOA.map((row) =>
  row[0] === "Desde el 01/01/2026 hasta el 31/01/2026"
    ? ["Desde el 01/02/2028 hasta el 29/02/2028"]
    : row,
);

/** A leap February cut short at the 28th — one day short of the real last day. */
export const LEAP_FEBRUARY_CUT_SHORT_AOA: FixtureCell[][] = MONTHLY_SINGLE_AOA.map((row) =>
  row[0] === "Desde el 01/01/2026 hasta el 31/01/2026"
    ? ["Desde el 01/02/2028 hasta el 28/02/2028"]
    : row,
);

/** A year-to-date accumulated export: six months in one `Total` column. */
export const ACCUMULATED_AOA: FixtureCell[][] = MONTHLY_SINGLE_AOA.map((row) =>
  row[0] === "Desde el 01/01/2026 hasta el 31/01/2026"
    ? ["Desde el 01/01/2026 hasta el 30/06/2026"]
    : row,
);

/** A partial month: starts the 1st but stops on the 15th. */
export const PARTIAL_MONTH_AOA: FixtureCell[][] = MONTHLY_SINGLE_AOA.map((row) =>
  row[0] === "Desde el 01/01/2026 hasta el 31/01/2026"
    ? ["Desde el 01/01/2026 hasta el 15/01/2026"]
    : row,
);

/** Crosses two months without starting on day 1. */
export const CROSS_MONTH_AOA: FixtureCell[][] = MONTHLY_SINGLE_AOA.map((row) =>
  row[0] === "Desde el 01/01/2026 hasta el 31/01/2026"
    ? ["Desde el 15/01/2026 hasta el 14/02/2026"]
    : row,
);

/** No range line at all in the preamble. */
export const NO_DATE_RANGE_AOA: FixtureCell[][] = MONTHLY_SINGLE_AOA.filter(
  (row) => row[0] !== "Desde el 01/01/2026 hasta el 31/01/2026",
);

/** The result row disagrees with the sum of its roots (355 − 95 = 260, not 999). */
export const MISMATCHED_RESULT_AOA: FixtureCell[][] = MONTHLY_SINGLE_AOA.map((row) =>
  row[1] === "Utilidad o Perdida" ? [null, "Utilidad o Perdida", 999] : row,
);

/** Preamble only — no account rows. */
export const NO_ACCOUNTS_AOA: FixtureCell[][] = [
  ["NOMIK HOTELS S.A.S."],
  ["Estado de Resultados"],
  ["Desde el 01/01/2026 hasta el 31/01/2026"],
];

export function aoaToXlsxBuffer(aoa: FixtureCell[][]): ArrayBuffer {
  const sheet = XLSX.utils.aoa_to_sheet(aoa);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "Consulta Personas");
  return XLSX.write(workbook, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
}
