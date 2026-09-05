/**
 * The Excel of «Reportería de ingresos» — two workbooks, and NEITHER computes a figure of its own.
 *
 * Both walk the same `ChartCardSpec.table` the screen draws, which is the only thing that guarantees
 * the file and the screen cannot disagree: a second derivation of the growth would drift from the
 * first with nothing giving it away, and the firm checks the download against its own workbook cell
 * by cell.
 *
 * - **«Comparativo completo»**: one sheet per reading, in the order they are read on screen.
 * - **«Datos externos»**: the captured matrix, for reconciling against whatever the firm keeps.
 */
import ExcelJS from "exceljs";
import type { ChartCardSpec } from "@/lib/charts/types";
import { MONTHS_FULL_ES } from "@/lib/date";
import {
  buildAnnualCard,
  flatComparisonCard,
  buildGrowthCard,
  buildRatioCard,
  type RevenueCardsInput,
} from "./cards";
import { RATIO_DESCRIPTORS } from "./series";
import { MONTHS_IN_YEAR, type RevenueYearInput } from "./types";

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
      writeCardSheet(wb, buildRatioCard(descriptor, input), header, descriptor.title);
    }
  }

  return revenueWorkbookToBlob(wb);
}

/**
 * «Datos externos»: the captured matrix, month by month and year by year — the sheet the firm
 * reconciles against its own records.
 *
 * It writes what is STORED and nothing derived: no percentage, no average. The totals row is the one
 * exception and it is a sum of the column, which is what makes the sheet checkable at a glance.
 */
export async function buildExternalWorkbook(
  years: readonly RevenueYearInput[],
  header: RevenueExportHeader,
): Promise<Blob> {
  const wb = newWorkbook();
  const ws = wb.addWorksheet("Datos externos");

  ws.addRow([header.clientName]).font = { bold: true, size: 14 };
  ws.addRow(["Datos externos registrados"]).font = {
    bold: true,
    color: { argb: LETTERHEAD_INK },
  };
  ws.addRow([]);

  const columns = ["Año", "Mes", "Cobros TC", "Comisiones TC", "Publicidad Facebook"];
  const head = ws.addRow(columns);
  head.font = { bold: true };
  head.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } };
  });

  const totals = { cardRevenue: 0, cardFees: 0, adSpend: 0 };
  for (const year of [...years].sort((a, b) => a.year - b.year)) {
    for (let month = 0; month < MONTHS_IN_YEAR; month++) {
      const cardRevenue = year.external.cardRevenue[month];
      const cardFees = year.external.cardFees[month];
      const adSpend = year.external.adSpend[month];
      // A month with nothing captured is NOT written as a row of zeros: an empty row and no row have
      // to mean the same thing here as they do in the database.
      if (cardRevenue === null && cardFees === null && adSpend === null) {
        continue;
      }
      totals.cardRevenue += cardRevenue ?? 0;
      totals.cardFees += cardFees ?? 0;
      totals.adSpend += adSpend ?? 0;
      ws.addRow([
        year.year,
        MONTHS_FULL_ES[month],
        cardRevenue ?? "",
        cardFees ?? "",
        adSpend ?? "",
      ]);
    }
  }

  const total = ws.addRow(["", "Total", totals.cardRevenue, totals.cardFees, totals.adSpend]);
  total.font = { bold: true };

  ws.getColumn(1).width = 10;
  ws.getColumn(2).width = 16;
  for (let column = 3; column <= 5; column++) {
    ws.getColumn(column).width = 20;
    ws.getColumn(column).numFmt = "#,##0.00";
  }

  return revenueWorkbookToBlob(wb);
}

/** `Reportería de ingresos <cliente> <periodo>.xlsx`, filesystem-safe. */
export function revenueExportFilename(header: RevenueExportHeader, suffix = ""): string {
  const sanitize = (value: string) => value.replace(/[\\/:*?"<>|]/g, " ").trim();
  const name = sanitize(header.clientName) || "LiderPlus";
  const period = sanitize(header.periodLabel);
  return `Reporteria de ingresos ${name}${period ? ` ${period}` : ""}${suffix}.xlsx`;
}
