/**
 * Synthetic fixtures for the monthly-by-cost-centers strategy, mirroring the STRUCTURE the
 * design verified against `.context/centros/2026/` (see the change's design.md): same grid as
 * the old annual consolidated export — GENERAL + centers + SIN CENTRO DE COSTO — but no date
 * line in the preamble, ever. Invented data; tests must never depend on the git-ignored samples.
 */
import * as XLSX from "xlsx";
import type { Cell as FixtureCell } from "./grid";

/** Well-formed month slice: GENERAL, two centers, and the sin-centro bucket. GENERAL = Σ(rest). */
export const MONTHLY_CENTERS_AOA: FixtureCell[][] = [
  ["HOTELERA ANDES S.A."],
  ["Estado de Resultados"],
  [null],
  [null, null, "GENERAL", "SUCURSAL NORTE", "SUCURSAL SUR", "SIN CENTRO DE COSTO"],
  ["4", "Ingresos", 355, 300, 45, 10],
  ["4.1", "Ventas", 355, 300, 45, 10],
  ["4.1.1", "Ventas Habitaciones", 355, 300, 45, 10],
  ["5", "Costos y Gastos", 95, 80, 10, 5],
  ["5.1", "Gastos Operativos", 95, 80, 10, 5],
  ["5.1.1", "Sueldos", 95, 80, 10, 5],
  [null, "Utilidad o Perdida", 260, 220, 35, 5],
];

/** Same shape, no `GENERAL` label at column index 2 — every column reads as a plain center. */
export const MISSING_GENERAL_AOA: FixtureCell[][] = MONTHLY_CENTERS_AOA.map((row) =>
  row[2] === "GENERAL" ? [row[0], row[1], "SUCURSAL CENTRO", ...row.slice(3)] : row,
);

/** A trailing blank header column, as real exports sometimes carry. */
export const TRAILING_BLANK_HEADER_AOA: FixtureCell[][] = MONTHLY_CENTERS_AOA.map((row, i) =>
  i === 3 ? [...row, null, null] : row,
);

/** Second month of the same centers, for merge tests: only Marzo-shaped totals differ. */
export const MONTHLY_CENTERS_MONTH2_AOA: FixtureCell[][] = [
  ["HOTELERA ANDES S.A."],
  ["Estado de Resultados"],
  [null],
  [null, null, "GENERAL", "SUCURSAL NORTE", "SUCURSAL SUR", "SIN CENTRO DE COSTO"],
  ["4", "Ingresos", 400, 340, 50, 10],
  ["4.1", "Ventas", 400, 340, 50, 10],
  ["4.1.1", "Ventas Habitaciones", 400, 340, 50, 10],
  ["5", "Costos y Gastos", 100, 85, 10, 5],
  ["5.1", "Gastos Operativos", 100, 85, 10, 5],
  ["5.1.1", "Sueldos", 100, 85, 10, 5],
  [null, "Utilidad o Perdida", 300, 255, 40, 5],
];

/** Preamble only — no account rows. */
export const NO_ACCOUNTS_AOA: FixtureCell[][] = [["HOTELERA ANDES S.A."], ["Estado de Resultados"]];

export function aoaToXlsxBuffer(aoa: FixtureCell[][]): ArrayBuffer {
  const sheet = XLSX.utils.aoa_to_sheet(aoa);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "Reporte");
  return XLSX.write(workbook, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
}
