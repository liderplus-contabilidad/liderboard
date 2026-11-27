/**
 * The «Ventas por servicio» download: every month of the client in ONE flat sheet, in the shape
 * `upload/parse.ts` reads, so it re-enters through the ordinary upload and leaves the base as it
 * was (`export.test.ts`). Nothing derived goes in.
 *
 * Written with SheetJS, the only output of the app that is: exceljs needs 4,6 GB for the real
 * file's rows. The price is the letterhead (`writeLetterhead` is exceljs'). UI code reaches this
 * through the Worker.
 */
import * as XLSX from "xlsx";
import type { SalesMonth } from "./types";

/** The seven labels the parser requires, written as the accounting system writes them. */
export const EXPORT_HEADER = [
  "FECHA",
  "SEGURO",
  "TIPO DE SERVICIO.",
  "COD. ARTICULO",
  "NOMBRE DEL ARTICULO",
  "VENDEDOR",
  "NETO",
] as const;

/**
 * A line's date, written as TEXT in the system's own shape: a date cell would make the round trip
 * depend on how a spreadsheet serial is decoded. The day is the coverage's `firstDay` — the module
 * stores no day per line.
 */
function dateCell(year: number, monthIndex: number, day: number): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${year}-${pad(monthIndex + 1)}-${pad(day)} 00:00:00.000`;
}

export interface SalesExportMonth extends SalesMonth {
  firstDay: number;
  companyCode: string;
}

/** One workbook, one sheet, chronological. `COD. EMPRESA` is written too: it is the module's
 *  identity, and a backup must not lose which company it belongs to. */
export function buildSalesWorkbook(months: readonly SalesExportMonth[]): XLSX.WorkBook {
  const sorted = [...months].sort((a, b) => a.year - b.year || a.monthIndex - b.monthIndex);
  const rows: (string | number)[][] = [["COD. EMPRESA", ...EXPORT_HEADER]];
  for (const month of sorted) {
    const date = dateCell(month.year, month.monthIndex, month.firstDay);
    for (const line of month.lines) {
      rows.push([
        month.companyCode,
        date,
        line.seguro,
        line.tipo,
        line.articleCode,
        line.articleName,
        line.vendor,
        line.amount,
      ]);
    }
  }
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  sheet["!cols"] = [
    { wch: 12 },
    { wch: 24 },
    { wch: 26 },
    { wch: 28 },
    { wch: 16 },
    { wch: 60 },
    { wch: 32 },
    { wch: 14 },
  ];
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "Ventas");
  return workbook;
}

/** Serializes a workbook to a Blob for `downloadBlob`. */
export function workbookToBlob(workbook: XLSX.WorkBook): Blob {
  const buffer = XLSX.write(workbook, {
    type: "array",
    bookType: "xlsx",
    compression: true,
  }) as ArrayBuffer;
  return new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

/** `VENTAS_<EMPRESA>_<AÑOS>.xlsx`, so a folder of backups reads on its own. */
export function salesExportFilename(companyCode: string, years: readonly number[]): string {
  const sorted = [...new Set(years)].sort((a, b) => a - b);
  const span =
    sorted.length > 1 ? `${sorted[0]}-${sorted[sorted.length - 1]}` : String(sorted[0] ?? "");
  const company = companyCode
    .replace(/[\\/:*?"<>|]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\s/g, "_");
  return `${["VENTAS", company, span].filter(Boolean).join("_")}.xlsx`;
}
