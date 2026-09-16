/**
 * «Control de cheques»: the register's own fourteen columns, in their order and with their labels,
 * so the download re-enters through the ordinary upload and reads as the book always has. The four
 * X follow the step — REALIZADO · FIRMADO · ENTREGADO are marked up to the step reached, DEPOSITADO
 * on a cashed check — and ESTADO carries the app's label in capitals.
 */
import ExcelJS from "exceljs";
import { writeLetterhead } from "@/lib/excel-logo";
import type { EntityLogo } from "@/lib/logos";
import { checkStatusLabel, stepIndex } from "../checks";
import type { Check } from "../types";
import { AMOUNT_FMT, excelDate } from "./shared";

export const CHECKS_COLUMNS: readonly string[] = [
  "N° EGRESO",
  "BANCO",
  "NOMBRE",
  "CHEQUE",
  "VALOR",
  "FECHA DE EMISION",
  "REALIZADO",
  "FIRMADO",
  "ENTREGADO",
  "LUGAR",
  "DEPOSITADO",
  "ESTADO",
  "FECHA DE COBRO",
  "CORREO",
];

const AMOUNT_COL = 5;

export function checkRow(check: Check): (string | number)[] {
  const reached = check.voided ? -1 : stepIndex(check.step);
  const mark = (index: number) => (reached >= index ? "X" : "");
  return [
    check.voucher,
    check.bank,
    check.payee,
    check.number,
    check.amount,
    excelDate(check.issuedOn),
    mark(0),
    mark(1),
    mark(2),
    check.place,
    check.step === "cashed" && !check.voided ? "X" : "",
    checkStatusLabel(check).toUpperCase(),
    excelDate(check.cashedOn),
    "",
  ];
}

export function buildChecksWorkbook(
  checks: readonly Check[],
  companyName: string,
  logo?: EntityLogo,
): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  wb.creator = "LiderPlus";
  const ws = wb.addWorksheet("PAGO A PROVEEDORES");
  ws.getColumn(3).width = 40;
  for (const column of [1, 2, 4, 5, 6, 10, 12, 13]) {
    ws.getColumn(column).width = 16;
  }
  writeLetterhead(wb, ws, {
    leftLogo: logo,
    columns: CHECKS_COLUMNS.length,
    lines: [
      { text: companyName, font: { bold: true, size: 14 } },
      { text: "CONTROL DE CHEQUES", font: { bold: true } },
    ],
  });
  ws.addRow([]);
  const header = ws.addRow([...CHECKS_COLUMNS]);
  header.font = { bold: true };
  ws.views = [{ state: "frozen", ySplit: header.number }];
  const sorted = [...checks].sort((a, b) =>
    (a.voucher ?? "").localeCompare(b.voucher ?? "", undefined, { numeric: true }),
  );
  for (const check of sorted) {
    const row = ws.addRow(checkRow(check));
    row.getCell(AMOUNT_COL).numFmt = AMOUNT_FMT;
  }
  return wb;
}
