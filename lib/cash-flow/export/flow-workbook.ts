/**
 * «Excel de flujo»: the report's sections on ONE sheet, each headed by its title, with the same
 * figures the paper prints, with separate Excel document fields, plus the
 * flow's cell notes as Excel comments, which the paper does not print.
 */
import ExcelJS from "exceljs";
import { writeLetterhead } from "@/lib/excel-logo";
import type { EntityLogo } from "@/lib/logos";
import type { PdfFlowSection } from "../pdf-report";
import { cellPaint, type FlowCellPaint, type FlowRowTone, type FlowReport } from "../report";

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
  "urgent-total": { font: WHITE, fill: "FF9F3038" },
  "pending-total": { font: WHITE, fill: "FF526778" },
  urgent: { font: "FF1E293B", fill: "FFFBD5D5" },
  pending: { font: "FF1E293B", fill: "FFEAF0F6" },
  outstanding: { font: "FF1E293B" },
  negative: { font: "FFDC2626" },
  positive: { font: "FF16A34A" },
};

function solid(argb: string): ExcelJS.Fill {
  return { type: "pattern", pattern: "solid", fgColor: { argb } };
}

export function buildFlowWorkbook(
  report: { header: FlowReport["header"]; sections: PdfFlowSection[] },
  logo?: EntityLogo,
): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  wb.creator = "LiderPlus";
  const ws = wb.addWorksheet("FLUJO", {
    pageSetup: {
      orientation: "landscape",
      paperSize: 9,
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
    },
  });
  const columnCount = Math.max(
    2,
    ...report.sections.map((section) => section.table.columns.length + 1),
  );
  ws.getColumn(1).width = 40;
  for (let column = 2; column <= columnCount; column += 1) {
    ws.getColumn(column).width = 18;
  }
  // One sheet shares its widths: reserve room for the payment document and full detail.
  const payments = report.sections.find((section) => section.id === "payments");
  if (payments) {
    for (const [label, width] of [
      ["Factura", 30],
      ["Detalle", 45],
      ["Cuenta", 25],
    ] as const) {
      const index = payments.table.columns.indexOf(label);
      if (index >= 0) ws.getColumn(index + 2).width = width;
    }
  }
  writeLetterhead(wb, ws, {
    leftLogo: logo,
    columns: columnCount,
    lines: [
      { text: report.header.clientName, font: { bold: true, size: 14 } },
      { text: `FLUJO DE PAGOS AL ${report.header.dateLabel}`, font: { bold: true } },
    ],
  });
  for (const section of report.sections) {
    const width = section.table.columns.length + 1;
    ws.addRow([]).height = 12;
    ws.addRow([]).height = 12;
    const title = ws.addRow([section.title]);
    ws.mergeCells(title.number, 1, title.number, width);
    title.height = 28;
    title.getCell(1).fill = solid(BRAND);
    title.getCell(1).font = { bold: true, size: 13, color: { argb: WHITE } };
    title.getCell(1).alignment = { vertical: "middle", indent: 1 };
    ws.addRow([]).height = 8;
    const header = ws.addRow([
      section.id === "payments" ? "Proveedor" : "Concepto",
      ...section.table.columns,
    ]);
    header.height = 24;
    header.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: BRAND } };
      cell.fill = solid(BRAND_SOFT);
      cell.alignment = { vertical: "middle", wrapText: true };
      cell.border = { bottom: { style: "thin", color: { argb: BRAND } } };
    });
    for (const row of section.table.rows) {
      const figureTone = section.figureRowTones?.[row.id];
      const paints = row.values.map((value, index) => {
        const column = section.table.columns[index] ?? "";
        if (section.rowTones?.[row.id] === "total")
          return cellPaint(section, row.id, column, value);
        if ((figureTone === "urgent" || figureTone === "pending") && column === "Total") {
          return figureTone === "urgent" ? "urgent-total" : "pending-total";
        }
        return cellPaint(
          figureTone
            ? { ...section, rowTones: undefined, columnTones: { [column]: figureTone } }
            : section,
          row.id,
          column,
          value,
        );
      });
      const values = row.values.map((value) => value ?? "");
      const written = ws.addRow([[row.label, row.sublabel].filter(Boolean).join("\n"), ...values]);
      written.getCell(1).alignment = { vertical: "top", wrapText: true };
      if (row.sublabel) written.height = 48;
      const detailIndex = section.table.columns.indexOf("Detalle");
      if (detailIndex >= 0) {
        const detail = row.values[detailIndex] ?? "";
        written.getCell(detailIndex + 2).alignment = { vertical: "top", wrapText: true };
        written.height = Math.max(22, Math.ceil(detail.length / 40) * 16 + 6);
      }
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
      if (figureTone === "urgent" || figureTone === "pending") {
        const { fill, font } = CELL_PAINT[figureTone];
        written.eachCell((cell) => {
          if (fill) cell.fill = solid(fill);
          cell.font = { color: { argb: font } };
        });
      }
      paints.forEach((paint, index) => {
        if (!paint) return;
        const cell = written.getCell(index + 2);
        const { font, fill } = CELL_PAINT[paint];
        // Transposed figure rows keep their semantic ink and ground.
        cell.font = {
          bold: false,
          color: { argb: font },
        };
        if (fill) {
          cell.fill = solid(fill);
        }
      });
      if (section.separatedRows?.includes(row.id)) {
        for (let column = 1; column <= values.length + 1; column++) {
          const cell = written.getCell(column);
          cell.border = { ...cell.border, top: { style: "medium", color: { argb: BRAND } } };
        }
      }
      // Values stay in regular weight, including totals; row labels retain their emphasis.
      values.forEach((_, index) => {
        const cell = written.getCell(index + 2);
        cell.font = { ...cell.font, bold: false };
      });
      // The screen's cell notes, as the comments the book's sheets carried: `column` counts from
      // the label (0), and ExcelJS counts from 1.
      for (const note of section.notes ?? []) {
        if (note.rowId === row.id) {
          const cell = written.getCell(note.column + 1);
          cell.note = typeof cell.note === "string" ? `${cell.note}\n${note.text}` : note.text;
        }
      }
    }
  }
  return wb;
}
