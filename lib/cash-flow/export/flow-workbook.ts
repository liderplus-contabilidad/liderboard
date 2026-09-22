/**
 * «Excel de flujo»: the report's sections on ONE sheet, each headed by its title, with the same
 * figures the paper prints — `report.ts` is the one builder, so the two cannot disagree — plus the
 * flow's cell notes as Excel comments, which the paper does not print.
 */
import ExcelJS from "exceljs";
import { writeLetterhead } from "@/lib/excel-logo";
import type { EntityLogo } from "@/lib/logos";
import type { FlowReport } from "../report";

const COLUMNS = 9;

export function buildFlowWorkbook(report: FlowReport, logo?: EntityLogo): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  wb.creator = "LiderPlus";
  const ws = wb.addWorksheet("FLUJO");
  ws.getColumn(1).width = 40;
  for (let column = 2; column <= COLUMNS; column += 1) {
    ws.getColumn(column).width = 18;
  }
  writeLetterhead(wb, ws, {
    leftLogo: logo,
    columns: COLUMNS,
    lines: [
      { text: report.header.clientName, font: { bold: true, size: 14 } },
      { text: `FLUJO DE PAGOS AL ${report.header.dateLabel}`, font: { bold: true } },
    ],
  });
  for (const section of report.sections) {
    ws.addRow([]);
    ws.addRow([section.title]).font = { bold: true, size: 12 };
    const header = ws.addRow(["", ...section.table.columns]);
    header.font = { bold: true };
    for (const row of section.table.rows) {
      const written = ws.addRow([row.label, ...row.values.map((value) => value ?? "")]);
      if (row.emphasis) {
        written.font = { bold: true };
      }
      // The screen's cell notes, as the comments the book's sheets carried: `column` counts from
      // the label (0), and ExcelJS counts from 1.
      for (const note of section.notes ?? []) {
        if (note.rowId === row.id) {
          written.getCell(note.column + 1).note = note.text;
        }
      }
    }
  }
  return wb;
}
