/**
 * Synthetic Excel fixtures for the parse/derive tests. They mirror the STRUCTURE of the
 * real accounting-system exports (see the spec's "Source format contract") with
 * invented data — tests must never depend on the git-ignored `.context/` samples.
 */
import * as XLSX from "xlsx";
import { META_SHEET_NAME } from "./excel-metadata";
import type { AccountRow } from "./types";

export type FixtureCell = string | number | null;

const MONTH_HEADERS = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];

/** 12 monthly values with only Ene–Abr set, so sums stay hand-checkable. */
function months(ene = 0, feb = 0, mar = 0, abr = 0): number[] {
  return [ene, feb, mar, abr, 0, 0, 0, 0, 0, 0, 0, 0];
}

function monthlyRow(code: string, name: string, values: number[], total: number): FixtureCell[] {
  return [code, name, ...values, total];
}

const MONTHLY_BODY: FixtureCell[][] = [
  monthlyRow("4", "Ingresos", months(130, 200, 25), 355),
  monthlyRow("4.1", "Ventas", months(130, 200), 330),
  monthlyRow("4.1.1", "Ventas Habitaciones", months(100, 200), 300),
  monthlyRow("4.1.2", "Ventas Restaurante", months(50), 50),
  monthlyRow("4.1.3", "Descuentos sobre Ventas", months(-20), -20),
  monthlyRow("4.2", "Otros Ingresos", months(0, 0, 25), 25),
  monthlyRow("5", "Costos y Gastos", months(90, 0, 0, 5), 95),
  monthlyRow("5.1", "Gastos Operativos", months(90, 0, 0, 5), 95),
  monthlyRow("5.1.1", "Sueldos", months(80), 80),
  monthlyRow("5.1.2", "Servicios", months(10, 0, 0, 5), 15),
  monthlyRow("5.1.2.1", "Energía Eléctrica", months(10, 0, 0, 5), 15),
  // Accent-less "Perdida" on purpose — the real exports do this too.
  [null, "Utilidad o Perdida", ...months(40, 200, 25, -5), 260],
];

/** Standard monthly export, no cost centers. Header at row index 5, like the samples. */
export const MONTHLY_AOA: FixtureCell[][] = [
  ["HOTELERA ANDES S.A."],
  ["Estado de Resultados"],
  ["Desde el 01/01/2026 hasta el 31/12/2026"],
  [null],
  [null],
  [null, null, ...MONTH_HEADERS, "Total"],
  [null],
  ...MONTHLY_BODY,
];

/** Sucursal export: extra "Centro de Costo" line shifts the header down one row. */
export const SUCURSAL_AOA: FixtureCell[][] = [
  ["HOTELERA ANDES S.A."],
  ["Estado de Resultados"],
  ["Centro de Costo: SUCURSAL NORTE"],
  ["Desde el 01/01/2026 hasta el 31/12/2026"],
  [null],
  [null],
  [null, null, ...MONTH_HEADERS, "Total"],
  [null],
  ...MONTHLY_BODY,
];

/** A second sucursal (different center) sharing the chart of accounts — for merge/workspace tests. */
export const SUCURSAL_SUR_AOA: FixtureCell[][] = [
  ["HOTELERA ANDES S.A."],
  ["Estado de Resultados"],
  ["Centro de Costo: SUCURSAL SUR"],
  ["Desde el 01/01/2026 hasta el 31/12/2026"],
  [null],
  [null],
  [null, null, ...MONTH_HEADERS, "Total"],
  [null],
  monthlyRow("4", "Ingresos", months(30, 20), 50),
  monthlyRow("4.1", "Ventas", months(30, 20), 50),
  monthlyRow("4.1.1", "Ventas Habitaciones", months(30, 20), 50),
  monthlyRow("5", "Costos y Gastos", months(10), 10),
  monthlyRow("5.1", "Gastos Operativos", months(10), 10),
  monthlyRow("5.1.1", "Sueldos", months(10), 10),
  [null, "Utilidad o Perdida", ...months(20, 20), 40],
];

/** Annual export: a single "Total" value column. */
export const ANNUAL_AOA: FixtureCell[][] = [
  ["HOTELERA ANDES S.A."],
  ["Estado de Resultados"],
  ["Desde el 01/01/2026 hasta el 31/12/2026"],
  [null],
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

/**
 * Consolidated-by-cost-center export: text value columns (GENERAL + centers + sin-centro),
 * annual values. GENERAL == sum of the other columns, as the real files guarantee.
 */
export const CONSOLIDATED_AOA: FixtureCell[][] = [
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

/** Monthly file whose "4.1" parent row disagrees with the sum of its children. */
export const MISMATCHED_PARENT_AOA: FixtureCell[][] = MONTHLY_AOA.map((row) =>
  row[0] === "4.1" ? monthlyRow("4.1", "Ventas", months(999, 200), 1199) : row,
);

/** Monthly export with only Enero–Junio columns (missing months zero-fill + warn). */
export const PARTIAL_MONTHS_AOA: FixtureCell[][] = [
  ["HOTELERA ANDES S.A."],
  ["Estado de Resultados"],
  ["Desde el 01/01/2026 hasta el 30/06/2026"],
  [null],
  [null, null, ...MONTH_HEADERS.slice(0, 6), "Total"],
  ["4", "Ingresos", 130, 200, 25, 0, 0, 0, 355],
  ["4.1.1", "Ventas Habitaciones", 130, 200, 25, 0, 0, 0, 355],
  ["5", "Costos y Gastos", 90, 0, 0, 5, 0, 0, 95],
  [null, "Utilidad o Perdida", 40, 200, 25, -5, 0, 0, 260],
];

/** Preamble only — no account rows at all. */
export const NO_ACCOUNTS_AOA: FixtureCell[][] = [["HOTELERA ANDES S.A."], ["Estado de Resultados"]];

/** The monthly fixture as parsed `AccountRow[]` — direct input for derive tests. */
export const MONTHLY_ACCOUNTS: AccountRow[] = MONTHLY_BODY.filter(
  (row): row is FixtureCell[] & { 0: string } => typeof row[0] === "string",
).map((row) => ({
  code: row[0] as string,
  name: row[1] as string,
  values: row.slice(2, 14).map((cell) => Number(cell ?? 0)),
}));

/** The monthly fixture's expected Utilidad values. */
export const MONTHLY_RESULT: number[] = months(40, 200, 25, -5);

/** Round-trips an AoA through a real workbook so parse tests exercise XLSX.read. */
export function aoaToXlsxBuffer(aoa: FixtureCell[][]): ArrayBuffer {
  const sheet = XLSX.utils.aoa_to_sheet(aoa);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "Consulta Personas");
  return XLSX.write(workbook, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
}

/** Same, plus a hidden metadata sheet — exercises parse's comment re-import path. */
export function aoaToXlsxBufferWithMeta(
  aoa: FixtureCell[][],
  metaRows: (string | number)[][],
): ArrayBuffer {
  const workbook = XLSX.utils.book_new();
  // Data sheet first so SheetNames[0] stays the data sheet.
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(aoa), "Consulta Personas");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(metaRows), META_SHEET_NAME);
  return XLSX.write(workbook, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
}
