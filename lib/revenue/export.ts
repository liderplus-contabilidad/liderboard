/**
 * The Excel of «Reportería de ingresos» — ONE workbook, «Comparativo completo», one sheet per
 * reading and in the order they are read on screen. It computes no figure of its own.
 *
 * It walks the same `ChartCardSpec.table` the screen draws, which is the only thing that guarantees
 * the file and the screen cannot disagree: a second derivation of the growth would drift from the
 * first with nothing giving it away, and the firm checks the download against its own workbook cell
 * by cell.
 */
import ExcelJS from "exceljs";
import { flatOnly, type ChartCardSpec } from "@/lib/charts/types";
import {
  buildAnnualCard,
  flatComparisonCard,
  buildGrowthCard,
  buildRatioCard,
  type RevenueCardsInput,
} from "./cards";
import { RATIO_DESCRIPTORS } from "./series";

const HEADER_FILL = "FFF3F6F9";
const LETTERHEAD_INK = "FF64748B";

function newWorkbook(): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  wb.creator = "LiderPlus";
  return wb;
}

/** Serializes a workbook to a Blob for `downloadBlob`. */
export async function revenueWorkbookToBlob(wb: ExcelJS.Workbook): Promise<Blob> {
  const buffer = await wb.xlsx.writeBuffer();
  return new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

export interface RevenueExportHeader {
  clientName: string;
  periodLabel: string;
}

/**
 * A card's table, written as a sheet. The letterhead names WHO and WHEN, because a sheet that leaves
 * the app has none of the screen's chrome to say it.
 */
function writeCardSheet(
  wb: ExcelJS.Workbook,
  card: ChartCardSpec,
  header: RevenueExportHeader,
  sheetName: string,
): void {
  // Excel refuses a sheet name over 31 chars or carrying `[]:*?/\`.
  const safe = sheetName.replace(/[[\]:*?/\\]/g, " ").slice(0, 31);
  const ws = wb.addWorksheet(safe);

  ws.addRow([header.clientName]).font = { bold: true, size: 14 };
  ws.addRow([card.title]).font = { bold: true, color: { argb: LETTERHEAD_INK } };
  ws.addRow([card.subtitle ?? header.periodLabel]).font = { color: { argb: LETTERHEAD_INK } };
  ws.addRow([]);

  const head = ws.addRow(["Serie", ...card.table.columns]);
  head.font = { bold: true };
  head.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } };
  });

  for (const row of card.table.rows) {
    const written = ws.addRow([row.label, ...row.values.map((value) => value ?? "")]);
    if (row.emphasis) {
      written.font = { bold: true };
    }
  }

  // A note is part of the reading and not decoration: it is what says which span a percentage used.
  if (card.note) {
    ws.addRow([]);
    ws.addRow([card.note]).font = { italic: true, color: { argb: LETTERHEAD_INK } };
  }

  ws.getColumn(1).width = 26;
  for (let column = 2; column <= card.table.columns.length + 1; column++) {
    ws.getColumn(column).width = 18;
  }
}

/**
 * «Comparativo completo»: one sheet per reading.
 *
 * The growth is written in DOLLARS and the ratios in AMOUNTS, but that choice costs nothing — the
 * table twin of each card already carries both units and both shapes, so the sheet has every figure
 * whichever way the screen happened to be set.
 */
export async function buildRevenueWorkbook(
  input: RevenueCardsInput,
  header: RevenueExportHeader,
): Promise<Blob> {
  const wb = newWorkbook();

  writeCardSheet(wb, flatComparisonCard(input), header, "Comparativo por año");
  // One sheet and not two: the annual table already carries the total AND the average, so the shape
  // the screen happens to be in costs the file nothing.
  writeCardSheet(wb, buildAnnualCard(input, "total"), header, "Ventas por año");
  writeCardSheet(wb, buildGrowthCard(input, "dolares"), header, "Crecimiento");

  if (input.canCapture) {
    for (const descriptor of RATIO_DESCRIPTORS) {
      writeCardSheet(wb, flatOnly(buildRatioCard(descriptor, input)), header, descriptor.title);
    }
  }

  return revenueWorkbookToBlob(wb);
}

/** `Reportería de ingresos <cliente> <periodo>.xlsx`, filesystem-safe. */
export function revenueExportFilename(header: RevenueExportHeader): string {
  const sanitize = (value: string) => value.replace(/[\\/:*?"<>|]/g, " ").trim();
  const name = sanitize(header.clientName) || "LiderPlus";
  const period = sanitize(header.periodLabel);
  return `Reporteria de ingresos ${name}${period ? ` ${period}` : ""}.xlsx`;
}
