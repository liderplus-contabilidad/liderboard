/**
 * THE GRID, DRAWN. The only file of the download that touches `exceljs`, and the one that decides
 * nothing: which cell carries what is already resolved in `rol-grid.ts`, and here only width, format
 * and colour are set. It is the same separation as the payslip in PDF, where `render.ts` walks boxes.
 *
 * The library comes in through a DYNAMIC import, like `lib/profit-loss/export.ts` and
 * `payslip/render.ts`: whoever does not download the rol does not pay its bytes.
 */
import type ExcelJS from "exceljs";
import { letterheadLogos } from "@/lib/cost-center";
import { writeLetterhead, type LetterheadLine } from "@/lib/excel-logo";
import type { EntityLogo } from "@/lib/logos";
import { columnIndexOf, type RolCellFormat, type RolExportColumn } from "./columns";
import { buildRolGrid, type RolExportInput, type RolExportRow } from "./rol-grid";

const SHEET = "GENERAL";

/** Excel's masks. Money goes with no symbol, as in the accountant's book: the whole sheet is in
 *  dollars and repeating it eighty times per row only gets in the way. */
const NUMBER_FORMATS: Record<RolCellFormat, string | null> = {
  money: "#,##0.00",
  hours: "#,##0.00",
  integer: "0",
  date: "dd/mm/yyyy",
  text: null,
};

/** Header grey and block grey — the same tones as PyG's downloads. */
const HEADER_FILL = "FFF1F5F9";
const AREA_FILL = "FFE2E8F0";
const RULE_COLOR = "FF94A3B8";
/** The letterhead's ink: the grey the app writes a secondary datum with. */
const LETTERHEAD_INK = "FF64748B";

/** Width of a column the catalogue does not declare (the book's gaps). */
const GAP_WIDTH = 6;

/** The column the title block lives in: **B**, which is where `findCompany` looks for it. */
const COMPANY_COLUMN = 2;

/**
 * One letterhead row of the grid, on the line `writeLetterhead` centres. The name leads and the
 * letterhead's lines are its identity footer —small size, soft ink—, the same step as in the payslip
 * in PDF.
 */
function letterheadLineOf(row: RolExportRow): LetterheadLine {
  const text = String(row.cells[COMPANY_COLUMN - 1] ?? "");
  return row.kind === "company"
    ? { text, font: { bold: true, size: 13 } }
    : { text, font: { size: 9, color: { argb: LETTERHEAD_INK } } };
}

function paintRow(
  row: ExcelJS.Row,
  kind: RolExportRow["kind"],
  columns: readonly RolExportColumn[],
): void {
  if (kind === "labels") {
    row.font = { bold: true, size: 9 };
    row.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    row.eachCell({ includeEmpty: false }, (cell) => {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } };
    });
    row.height = 30;
    return;
  }
  if (kind === "area") {
    row.font = { bold: true };
    row.getCell(2).fill = { type: "pattern", pattern: "solid", fgColor: { argb: AREA_FILL } };
    return;
  }
  if (kind === "subtotal" || kind === "suman") {
    row.font = { bold: true };
    // The top rule is what closes the block, just as in PyG's estado de resultados.
    for (const column of columns) {
      row.getCell(columnIndexOf(column.letter) + 1).border = {
        top: { style: kind === "suman" ? "double" : "thin", color: { argb: RULE_COLOR } },
      };
    }
  }
}

/**
 * The whole workbook, ready to download.
 *
 * The WIDTHS are set before any row, because `writeLogoHeader` needs them to anchor the letterhead
 * and because opening the logo's gap writes rows: doing it afterwards would force moving whatever was
 * already there.
 */
export async function buildRolWorkbook(
  input: RolExportInput,
  logo?: EntityLogo | null,
): Promise<ArrayBuffer> {
  const { Workbook } = await import("exceljs");
  const grid = buildRolGrid(input);

  const wb = new Workbook();
  const ws = wb.addWorksheet(SHEET);

  const widths: number[] = [];
  for (const column of grid.columns) {
    widths[columnIndexOf(column.letter)] = column.width;
  }
  const lastColumn = widths.length;
  ws.columns = Array.from({ length: lastColumn }, (_, index) => ({
    width: widths[index] ?? GAP_WIDTH,
  }));

  // The client's on the left and its center's on the right, the same rule —and the same function—
  // that places the payslip PDF's. With no center with a logo, one alone on the left, exactly as
  // before.
  // The client's on the left and its center's on the right, the same rule —and the same function—
  // that places the payslip PDF's. With no center with a logo, one alone on the left, exactly as
  // before.
  //
  // The title block is merged from **column B**, not from A: `findCompany` looks for the company
  // there on re-reading the file, and a merged cell's value lives in its top-left corner. Merging
  // from A would leave the composed label in a column that reader does not look at, and a downloaded
  // rol would come back in with no company.
  const logos = letterheadLogos(logo, input.costCenter);
  const head = grid.rows.filter((row) => row.kind === "company" || row.kind === "letterhead");
  writeLetterhead(wb, ws, {
    leftLogo: logos.left,
    rightLogo: logos.right,
    columns: lastColumn,
    firstColumn: COMPANY_COLUMN,
    lines: head.map(letterheadLineOf),
  });

  /** The last row of labels, counted over what is WRITTEN and not over the grid: the letterhead no
   *  longer travels in it, so a grid index is no longer a row number. */
  let lastLabelRow = 0;
  for (const row of grid.rows) {
    if (row.kind === "company" || row.kind === "letterhead") {
      continue;
    }
    const written = ws.addRow([...row.cells]);
    if (row.kind === "labels") {
      lastLabelRow = written.number;
    }
    if (row.kind === "employee" || row.kind === "subtotal" || row.kind === "suman") {
      for (const column of grid.columns) {
        const format = NUMBER_FORMATS[column.format];
        if (format) {
          written.getCell(columnIndexOf(column.letter) + 1).numFmt = format;
        }
      }
    }
    paintRow(written, row.kind, grid.columns);
  }

  // Eighty columns are read by scrolling to the right, so the name has to stay in sight; and below
  // the labels, to know what is being looked at. Where the labels end is COUNTED while writing and
  // not estimated: the letterhead measures differently depending on how many lines the client brings,
  // and one frozen row too many would cover the first area.
  ws.views = [{ state: "frozen", xSplit: 3, ySplit: lastLabelRow }];

  return wb.xlsx.writeBuffer() as Promise<ArrayBuffer>;
}
