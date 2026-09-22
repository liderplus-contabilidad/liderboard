/**
 * «Excel de flujo»: the report's sections on ONE sheet, each headed by its title, with the same
 * figures the paper prints — `report.ts` is the one builder, so the two cannot disagree — plus the
 * flow's cell notes as Excel comments, which the paper does not print.
 */
import ExcelJS from "exceljs";
import { writeLetterhead } from "@/lib/excel-logo";
import type { EntityLogo } from "@/lib/logos";
import {
  cellPaint,
  hasFigure,
  type FlowCellPaint,
  type FlowRowTone,
  type FlowReport,
  SIGN_GLYPH,
} from "../report";

const COLUMNS = 9;

/** The colours the PDF wears, for a sheet that cannot read a CSS variable: each ARGB mirrors its
 *  `@theme` token (brand-soft is its 8 % over white, flattened). */
const BRAND = "FF1E3A5F";
const BRAND_SOFT = "FFEDEFF2";
const WHITE = "FFFFFFFF";
const ROW_PAINT: Record<FlowRowTone, { fill: string; font: string }> = {
  total: { fill: BRAND, font: WHITE },
  group: { fill: BRAND_SOFT, font: BRAND },
};
/** Only the two marks of payment take a GROUND; the rest is told by its ink. */
const CELL_PAINT: Record<FlowCellPaint, { font: string; fill?: string }> = {
  urgent: { font: "FF1E293B", fill: "FFFEF3C7" },
  pending: { font: "FF1E293B", fill: "FFEAF0F6" },
  outstanding: { font: "FFA21CAF" },
  negative: { font: "FFDC2626" },
  positive: { font: "FF16A34A" },
};

function solid(argb: string): ExcelJS.Fill {
  return { type: "pattern", pattern: "solid", fgColor: { argb } };
}

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
      const paints = row.values.map((value, index) =>
        cellPaint(section, row.id, section.table.columns[index] ?? "", value),
      );
      // A signed figure carries its glyph here as on paper: the colour never travels alone.
      const values = row.values.map((value, index) => {
        const paint = paints[index];
        return paint === "negative" || paint === "positive"
          ? `${SIGN_GLYPH[paint]} ${value}`
          : (value ?? "");
      });
      const written = ws.addRow([row.label, ...values]);
      if (row.emphasis) {
        written.font = { bold: true };
      }
      const rowTone = section.rowTones?.[row.id];
      if (rowTone) {
        const { fill, font } = ROW_PAINT[rowTone];
        for (let column = 1; column <= values.length + 1; column += 1) {
          const cell = written.getCell(column);
          cell.fill = solid(fill);
          cell.font = { bold: true, color: { argb: font } };
        }
      }
      paints.forEach((paint, index) => {
        if (!paint) return;
        const cell = written.getCell(index + 2);
        const { font, fill } = CELL_PAINT[paint];
        // A mark of payment grounds its whole column. The urgent is ALWAYS bold, its zeros too; the
        // pending only where it says something.
        cell.font = {
          bold: paint === "urgent" || hasFigure(row.values[index] ?? null),
          color: { argb: font },
        };
        if (fill) {
          cell.fill = solid(fill);
        }
      });
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
