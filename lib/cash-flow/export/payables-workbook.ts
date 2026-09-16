/**
 * «Reporte CxP»: ONE sheet with the columns of the `FORMATO IDEAL`'s `REPORTE CXP`, in its order and
 * with its labels — the sheet the firm already reads — with the aging DERIVED at the cut date
 * (`aging.ts`), never copied from the file that brought the document, and the four working columns
 * as they stand. What is written is what passed the screen's filters.
 *
 * The three empty «Columna1..3» the original carries between the two sides are not reproduced: they
 * held nothing, and a reader locating by label does not miss them.
 */
import ExcelJS from "exceljs";
import { writeLetterhead } from "@/lib/excel-logo";
import type { EntityLogo } from "@/lib/logos";
import { AGING_BUCKETS, agingOf, type AgingBucket } from "../aging";
import { documentLabel } from "../derive";
import type { Payable } from "../types";
import { AMOUNT_FMT, excelDate } from "./shared";

const bucketHeader = (side: "due" | "overdue", bucket: AgingBucket) => {
  const span = bucket === "120+" ? ">120 DÍAS" : `${bucket} DÍAS`;
  return side === "due" ? `POR VENCER ${span}` : `VENCIDA POR ${span}`;
};

/** The header, in the order of the `REPORTE CXP`: por vencer descends from >120 to 30, vencida climbs. */
export const REPORTE_CXP_COLUMNS: readonly string[] = [
  "RAZÓN SOCIAL",
  "DOCUMENTO",
  "F. EMISIÓN",
  "F. VENCIM.",
  ...[...AGING_BUCKETS].reverse().map((bucket) => bucketHeader("due", bucket)),
  "POR VENCER TOTAL",
  ...AGING_BUCKETS.map((bucket) => bucketHeader("overdue", bucket)),
  "VENCIDA TOTAL POR PAGAR",
  "CUENTAS POR PAGAR TOTAL",
  "VALOR DOCUM.",
  "RETENCIÓN",
  "PAGOS",
  "DESCRIPCIÓN",
  "CENTRO DE COSTOS",
  "OBSERVACIÓN DE CONTABILIDAD",
  "APROBACIÓN PRIMERA REVISIÓN",
  "APROBACIÓN REVISIÓN FINAL",
  "NOTIFICACION DE PAGO",
];

const FIRST_AMOUNT_COL = 5;
const LAST_AMOUNT_COL = 20;

/** One row of the sheet, as values — the pure half, which is what the test checks. */
export function reporteCxpRow(payable: Payable, asOf: string): (string | number)[] {
  const aging = agingOf(payable.dueOn, asOf);
  const due = [...AGING_BUCKETS]
    .reverse()
    .map((bucket) => (aging.side === "due" && aging.bucket === bucket ? payable.balance : 0));
  const overdue = AGING_BUCKETS.map((bucket) =>
    aging.side === "overdue" && aging.bucket === bucket ? payable.balance : 0,
  );
  return [
    payable.supplier,
    documentLabel(payable),
    excelDate(payable.issuedOn),
    excelDate(payable.dueOn),
    ...due,
    aging.side === "due" ? payable.balance : 0,
    ...overdue,
    aging.side === "overdue" ? payable.balance : 0,
    payable.balance,
    payable.amount,
    payable.withholdings,
    payable.payments,
    payable.description,
    payable.centerName ?? "",
    payable.observation,
    payable.approved ?? "",
    payable.finalReview ? "OK" : "",
    payable.notified ? "OK" : "",
  ];
}

export function buildPayablesWorkbook(
  payables: readonly Payable[],
  asOf: string,
  companyName: string,
  logo?: EntityLogo,
): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  wb.creator = "LiderPlus";
  const ws = wb.addWorksheet("REPORTE CXP");
  ws.getColumn(1).width = 36;
  ws.getColumn(2).width = 24;
  for (let column = 3; column <= REPORTE_CXP_COLUMNS.length; column += 1) {
    ws.getColumn(column).width = column >= 24 ? 28 : 14;
  }
  writeLetterhead(wb, ws, {
    leftLogo: logo,
    columns: REPORTE_CXP_COLUMNS.length,
    lines: [
      { text: companyName, font: { bold: true, size: 14 } },
      { text: `REPORTE DE CUENTAS POR PAGAR · al ${excelDate(asOf)}`, font: { bold: true } },
    ],
  });
  ws.addRow([]);
  const header = ws.addRow([...REPORTE_CXP_COLUMNS]);
  header.font = { bold: true };
  ws.views = [{ state: "frozen", ySplit: header.number }];

  const sorted = [...payables].sort(
    (a, b) => a.supplier.localeCompare(b.supplier) || (a.dueOn ?? "").localeCompare(b.dueOn ?? ""),
  );
  for (const payable of sorted) {
    const row = ws.addRow(reporteCxpRow(payable, asOf));
    for (let column = FIRST_AMOUNT_COL; column <= LAST_AMOUNT_COL; column += 1) {
      row.getCell(column).numFmt = AMOUNT_FMT;
    }
    row.getCell(REPORTE_CXP_COLUMNS.length - 2).numFmt = AMOUNT_FMT;
  }

  const totals = ws.addRow([
    "Total",
    "",
    "",
    "",
    ...Array.from({ length: LAST_AMOUNT_COL - FIRST_AMOUNT_COL + 1 }, (_, index) =>
      sorted.reduce(
        (acc, payable) =>
          acc + Number(reporteCxpRow(payable, asOf)[FIRST_AMOUNT_COL - 1 + index] || 0),
        0,
      ),
    ),
  ]);
  totals.font = { bold: true };
  for (let column = FIRST_AMOUNT_COL; column <= LAST_AMOUNT_COL; column += 1) {
    totals.getCell(column).numFmt = AMOUNT_FMT;
  }
  return wb;
}
