/**
 * «Cargas cash»: the sheet of the book, three blocks stacked — title, the header FECHA · DETALLE ·
 * one column per center and per loan · OBSERVACION, the rows and a TOTAL — written straight off
 * the `CashMatrix` the screen paints. It is a WRITE of that derivation and not a second one: the
 * totals are the matrix's, not `SUM()` formulas. No upload reads it back: the matrix is not a
 * format that enters, the cartera and the check register are.
 */
import ExcelJS from "exceljs";
import { writeLetterhead } from "@/lib/excel-logo";
import type { EntityLogo } from "@/lib/logos";
import type { CashMatrix, CashSection } from "../cash-entries";
import { AMOUNT_FMT, excelDate } from "./shared";

const FIXED_LEAD = ["FECHA", "DETALLE"] as const;
const OBSERVATION = "OBSERVACION";

/** The header of one block: the two fixed columns, the matrix's, then the observation. */
export function sectionHeader(section: Pick<CashSection, "columns">): string[] {
  return [
    ...FIXED_LEAD,
    ...section.columns.map((column) => column.label.toUpperCase()),
    OBSERVATION,
  ];
}

export function sectionRows(section: CashSection): (string | number)[][] {
  return section.rows.map((row) => [
    excelDate(row.date || null),
    row.detail,
    ...section.columns.map((column) => row.cells[column.id] ?? ""),
    row.observation,
  ]);
}

export function sectionTotals(section: CashSection): (string | number)[] {
  return ["TOTAL", "", ...section.columns.map((column) => section.totals[column.id] ?? 0), ""];
}

export function buildCashEntriesWorkbook(
  matrix: CashMatrix,
  companyName: string,
  logo?: EntityLogo,
): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  wb.creator = "LiderPlus";
  const ws = wb.addWorksheet("CARGAS CASH");
  const width = Math.max(...matrix.sections.map((section) => section.columns.length + 3));
  ws.getColumn(1).width = 12;
  ws.getColumn(2).width = 44;
  for (let column = 3; column < width; column += 1) {
    ws.getColumn(column).width = 14;
  }
  ws.getColumn(width).width = 40;
  writeLetterhead(wb, ws, {
    leftLogo: logo,
    columns: width,
    lines: [
      { text: companyName, font: { bold: true, size: 14 } },
      { text: "CARGAS CASH PENDIENTE DE APROBACION", font: { bold: true } },
    ],
  });
  for (const section of matrix.sections) {
    ws.addRow([]);
    const title = ws.addRow([section.title.toUpperCase()]);
    title.font = { bold: true, size: 12 };
    const header = ws.addRow(sectionHeader(section));
    header.font = { bold: true };
    const amountColumns = section.columns.map((_, index) => index + FIXED_LEAD.length + 1);
    for (const values of sectionRows(section)) {
      const row = ws.addRow(values);
      for (const column of amountColumns) {
        row.getCell(column).numFmt = AMOUNT_FMT;
      }
    }
    const total = ws.addRow(sectionTotals(section));
    total.font = { bold: true };
    for (const column of amountColumns) {
      total.getCell(column).numFmt = AMOUNT_FMT;
    }
  }
  return wb;
}
