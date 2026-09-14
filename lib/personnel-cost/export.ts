/**
 * The «Excel con tus datos» of «Análisis costo personal» — a COPY of what the module stores, so it can
 * leave the browser and come back through the ordinary upload unchanged (`./upload.ts` reads exactly
 * this shape, by label).
 *
 * It carries ONLY what is written by hand: a sheet per typed exercise —the four lines of the old
 * sheet, one month per column— and one sheet for the nómina de familia, a year per row. Nothing
 * derived from the estado de resultados goes in: those tables are PyG's, they are recomputed on every
 * render, and a file that carried them would invite uploading them back over what PyG says.
 *
 * The «Ventas» row of a typed exercise is written as a REFERENCE (it is what the percentage on screen
 * divides by) and is rotulated so, because the reader skips it: this module does not store ventas.
 *
 * exceljs is imported statically here; UI code must reach this through a dynamic `import()`.
 */
import ExcelJS from "exceljs";
import { MONTHS_SHORT_ES } from "@/lib/date";
import { PERSONNEL_LEGACY_COST_ROWS, type PersonnelLegacySeries } from "./legacy";
import {
  FAMILY_HEADER_LABEL,
  FAMILY_SHEET_TITLE,
  LEGACY_HEADER_LABEL,
  LEGACY_SHEET_TITLE,
} from "./backup-shape";

/** What is stored for one client, as the workbook writes it. */
export interface PersonnelCostBackup {
  clientName: string;
  legacy: readonly {
    year: number;
    series: PersonnelLegacySeries;
    /** The resolved divisor — written for reference, never read back. */
    revenue: readonly (number | null)[];
  }[];
  family: readonly { year: number; amounts: readonly (number | null)[] }[];
}

const AMOUNT_FMT = "#,##0.00;-#,##0.00";
const HEADER_FILL = "FFF3F6F9";
const LETTERHEAD_INK = "FF64748B";
const REVENUE_LABEL = "Ventas (referencia)";

function letterhead(ws: ExcelJS.Worksheet, clientName: string, title: string, note: string): void {
  ws.addRow([clientName]).font = { bold: true, size: 14 };
  // The TITLE is what the reader locates; the sheet's name is only a convenience for the tab.
  ws.addRow([title]).font = { bold: true };
  ws.addRow([note]).font = { color: { argb: LETTERHEAD_INK }, italic: true };
  ws.addRow([]);
}

function header(ws: ExcelJS.Worksheet, first: string, trailing: string[] = []): void {
  const row = ws.addRow([first, ...MONTHS_SHORT_ES, ...trailing]);
  row.font = { bold: true };
  row.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } };
  });
  ws.views = [{ state: "frozen", xSplit: 1, ySplit: row.number }];
  ws.getColumn(1).width = 24;
  for (let column = 2; column <= 1 + MONTHS_SHORT_ES.length + trailing.length; column += 1) {
    ws.getColumn(column).width = 13;
  }
}

function amounts(row: ExcelJS.Row, from: number, count: number): void {
  for (let offset = 0; offset < count; offset += 1) {
    row.getCell(from + offset).numFmt = AMOUNT_FMT;
  }
}

/** Excel refuses a sheet name over 31 chars or carrying `[]:*?/\`. */
function sheetName(name: string): string {
  return name.replace(/[[\]:*?/\\]/g, " ").slice(0, 31);
}

export function buildPersonnelCostWorkbook(backup: PersonnelCostBackup): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  wb.creator = "LiderPlus";

  for (const exercise of [...backup.legacy].sort((a, b) => a.year - b.year)) {
    const ws = wb.addWorksheet(sheetName(`${LEGACY_SHEET_TITLE} ${exercise.year}`));
    letterhead(
      ws,
      backup.clientName,
      `${LEGACY_SHEET_TITLE} ${exercise.year}`,
      "Cuatro líneas escritas a mano, un mes por columna. Se vuelve a cargar tal cual; la fila " +
        "de ventas es solo referencia.",
    );
    header(ws, LEGACY_HEADER_LABEL, ["Total"]);
    for (const line of PERSONNEL_LEGACY_COST_ROWS) {
      const values = exercise.series[line.id];
      const written = values.filter((value): value is number => value !== null);
      const total = written.length > 0 ? written.reduce((sum, value) => sum + value, 0) : null;
      const row = ws.addRow([line.label, ...values, total]);
      amounts(row, 2, MONTHS_SHORT_ES.length + 1);
    }
    const revenue = ws.addRow([
      REVENUE_LABEL,
      ...exercise.revenue.map((value) => value ?? null),
      exercise.revenue.reduce<number>((sum, value) => sum + (value ?? 0), 0) || null,
    ]);
    revenue.font = { color: { argb: LETTERHEAD_INK } };
    amounts(revenue, 2, MONTHS_SHORT_ES.length + 1);
  }

  if (backup.family.length > 0) {
    const ws = wb.addWorksheet(sheetName(FAMILY_SHEET_TITLE));
    letterhead(
      ws,
      backup.clientName,
      FAMILY_SHEET_TITLE,
      "La nómina de la familia por año, un mes por columna. Se vuelve a cargar tal cual.",
    );
    header(ws, FAMILY_HEADER_LABEL);
    for (const entry of [...backup.family].sort((a, b) => a.year - b.year)) {
      const row = ws.addRow([entry.year, ...entry.amounts.map((value) => value ?? null)]);
      amounts(row, 2, MONTHS_SHORT_ES.length);
    }
  }

  return wb;
}

/** Serializes a workbook to a Blob for `downloadBlob`. */
export async function personnelCostWorkbookToBlob(wb: ExcelJS.Workbook): Promise<Blob> {
  const buffer = await wb.xlsx.writeBuffer();
  return new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

/** `COSTO_PERSONAL_<CLIENTE>_<AÑOS>.xlsx`, so a folder of backups reads on its own. */
export function personnelCostExportFilename(clientName: string, years: readonly number[]): string {
  const sorted = [...new Set(years)].sort((a, b) => a - b);
  const span =
    sorted.length > 1 ? `${sorted[0]}-${sorted[sorted.length - 1]}` : String(sorted[0] ?? "");
  const client = clientName
    .replace(/[\\/:*?"<>|]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\s/g, "_");
  return `${["COSTO_PERSONAL", client, span].filter(Boolean).join("_")}.xlsx`;
}
