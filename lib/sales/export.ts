/**
 * The «Ventas por servicio» download: the client's months, one sheet each, in the SAME shape
 * `upload/parse.ts` reads. It is a copy of what is stored and nothing else — the invoice lines and
 * what the month keeps about itself (the razón social, the total the original report declared) —
 * so a file downloaded here re-enters through the ordinary upload and leaves the base as it was.
 * `export.test.ts` proves it by `toEqual`, not by sampling fields.
 *
 * Three things follow from «what is stored, verbatim»:
 *
 *   - The razón social is written WITHOUT a fallback. Writing «LiderPlus» where the month kept
 *     nothing would change the month's identity on the way back.
 *   - A `declaredTotal` of `null` writes NO closing row. Writing the sum would invent a total the
 *     original report never declared, and the month would come back squaring against itself.
 *   - Nothing derived goes in: the breakdown by service and the concentration by payer are
 *     recomputed on every read, and the PDF report is already their paper.
 *
 * The grid is located by LABEL on the way in, so the way out need not reproduce the report's
 * columns nor its centred-over-merged-cells misalignment: the labels have to be there, and each
 * line has to carry code · service · payer · quantity · amount in that order.
 *
 * exceljs is imported statically here; UI code must reach this through a dynamic `import()`.
 */
import ExcelJS from "exceljs";
import { MONTHS_FULL_ES, monthBounds } from "@/lib/date";
import { writeLetterhead } from "@/lib/excel-logo";
import type { EntityLogo } from "@/lib/logos";
import type { SalesMonth } from "./types";

/** The report's title, as the parser's `REPORT_TITLE` compacts it. */
const TITLE = "VENTA DE SERVICIOS POR FACTURA";

const CODE_COL = 1;
const SERVICE_COL = 2;
const PAYER_COL = 3;
const QUANTITY_COL = 4;
const AMOUNT_COL = 5;
const COLUMNS = 5;

const AMOUNT_FMT = "#,##0.00;-#,##0.00";

/**
 * One workbook, one sheet per month, chronological whatever order the months arrive in. The logo
 * heads every sheet the way it heads PyG's raw month: it is an image, not a cell, so the reading
 * never meets it.
 */
export function buildSalesWorkbook(
  months: readonly SalesMonth[],
  logo?: EntityLogo,
): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  wb.creator = "LiderPlus";
  const sorted = [...months].sort((a, b) => a.year - b.year || a.monthIndex - b.monthIndex);
  for (const month of sorted) {
    writeMonthSheet(wb, month, logo);
  }
  return wb;
}

function writeMonthSheet(wb: ExcelJS.Workbook, month: SalesMonth, logo?: EntityLogo): void {
  const ws = wb.addWorksheet(`${MONTHS_FULL_ES[month.monthIndex]} ${month.year}`);

  // The widths, before the letterhead: the logo's anchor comes from them.
  ws.getColumn(CODE_COL).width = 10;
  ws.getColumn(SERVICE_COL).width = 30;
  ws.getColumn(PAYER_COL).width = 44;
  ws.getColumn(QUANTITY_COL).width = 12;
  ws.getColumn(AMOUNT_COL).width = 16;

  // The razón social is the first TEXT line of the preamble — `findSalesCompany`'s rule — and the
  // title comes after it for that reason: written first, it would be skipped as the title and the
  // company would still be found, but the order is what the real report prints.
  writeLetterhead(wb, ws, {
    leftLogo: logo,
    columns: COLUMNS,
    lines: [
      ...(month.companyName ? [{ text: month.companyName, font: { bold: true, size: 14 } }] : []),
      { text: TITLE, font: { bold: true } },
    ],
  });

  // Label and date in SEPARATE cells: the form `findLabelledDate` reads first.
  const bounds = monthBounds(month.year, month.monthIndex);
  ws.addRow(["Desde:", bounds.start, "Hasta:", bounds.end]);
  ws.addRow([]);

  const header = ws.addRow(["CODIGO", "NOMBRE", "", "CANTIDAD", "VENTA TOTAL"]);
  header.font = { bold: true };
  ws.views = [{ state: "frozen", ySplit: header.number }];

  for (const line of month.lines) {
    // The code as TEXT, so `\01` keeps its backslash and its zero; an empty payer is an empty cell,
    // which is the four-cell line the parser already reads.
    const row = ws.addRow([
      line.serviceCode,
      line.serviceName,
      line.payer || null,
      line.quantity,
      line.amount,
    ]);
    row.getCell(AMOUNT_COL).numFmt = AMOUNT_FMT;
  }

  if (month.declaredTotal !== null) {
    // The report's own close: the count of LINES with its label, then the total with NO label under
    // the amount column — `findDeclaredTotal` reads it there, and only there.
    ws.addRow(["TOTAL ITEMS", month.lines.length]);
    const total = ws.addRow(["", "", "", sumQuantity(month), month.declaredTotal]);
    total.font = { bold: true };
    total.getCell(AMOUNT_COL).numFmt = AMOUNT_FMT;
  }
}

function sumQuantity(month: SalesMonth): number {
  return month.lines.reduce((sum, line) => sum + line.quantity, 0);
}

/** Serializes a workbook to a Blob for `downloadBlob`. */
export async function workbookToBlob(wb: ExcelJS.Workbook): Promise<Blob> {
  const buffer = await wb.xlsx.writeBuffer();
  return new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

/** `VENTAS_<EMPRESA>_<AÑOS>.xlsx`, so a folder of backups reads on its own. */
export function salesExportFilename(companyName: string, years: readonly number[]): string {
  const sorted = [...new Set(years)].sort((a, b) => a - b);
  const span =
    sorted.length > 1 ? `${sorted[0]}-${sorted[sorted.length - 1]}` : String(sorted[0] ?? "");
  const company = companyName
    .replace(/[\\/:*?"<>|]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\s/g, "_");
  return `${["VENTAS", company, span].filter(Boolean).join("_")}.xlsx`;
}
