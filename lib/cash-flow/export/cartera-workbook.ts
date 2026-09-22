/**
 * «Cartera para recargar»: the empresa's whole cartera — open and settled, from every source —
 * in the module's OWN sheet, the one `upload/liderplus.ts` reads back through the ordinary «Cargar
 * cartera». It is a copy of what is stored, marks included, so what leaves and what comes back are
 * the same rows: the identity is recomposed from the row (`payableId`), the account is named by
 * label, the dates travel in ISO and the booleans as «SI» / blank, so nothing depends on the
 * reader's locale. It is the module's one Excel of the cartera: the data, marks included.
 *
 * `CARTERA_COLUMNS` is the contract the writer and the reader share, located by label.
 */
import ExcelJS from "exceljs";
import type { BankAccount, Payable } from "../types";
import { AMOUNT_FMT } from "./shared";

export const CARTERA_MARK = "LIDERPLUS · CARTERA POR PAGAR";
export const CARTERA_SHEET = "CARTERA";

export const CARTERA_COLUMNS = [
  "Origen",
  "Proveedor",
  "Identificación",
  "Tipo",
  "Documento",
  "Descripción",
  "Emisión",
  "Vencimiento",
  "Valor documento",
  "Retenciones",
  "Pagos",
  "Saldo",
  "Centro",
  "Clase",
  "Prioridad",
  "Cash",
  "Programado",
  "Pagar desde",
  "Observación",
  "Aprobado",
  "Revisión final",
  "Notificación",
  "Estado",
  "Liquidado el",
  "Corte",
] as const;

const AMOUNT_COLUMNS = [9, 10, 11, 12, 20];

/** «PRODUBANCO · 80010385» — how a row names an account; the number may be empty. */
export function accountRef(account: Pick<BankAccount, "bank" | "number">): string {
  return [account.bank.trim(), account.number.trim()].filter(Boolean).join(" · ");
}

export function accountRefs(
  accounts: readonly BankAccount[],
): (accountId: string | null) => string {
  const byId = new Map(accounts.map((account) => [account.id, accountRef(account)]));
  return (accountId) => (accountId ? (byId.get(accountId) ?? "") : "");
}

const yes = (value: boolean) => (value ? "SI" : "");
const orBlank = (value: string | number | null | undefined) => value ?? "";

/** One stored document as a row of the sheet — the pure half, which is what the test checks. */
export function carteraRow(
  row: Payable,
  ref: (accountId: string | null) => string,
): (string | number)[] {
  return [
    row.source,
    row.supplier,
    orBlank(row.supplierTaxId),
    row.docType,
    row.docNumber,
    row.description,
    orBlank(row.issuedOn),
    orBlank(row.dueOn),
    row.amount,
    row.withholdings,
    row.payments,
    row.balance,
    orBlank(row.centerName),
    row.kind ?? "",
    row.priority ?? "",
    yes(row.cash),
    orBlank(row.payOn),
    ref(row.payFromAccountId),
    row.observation,
    orBlank(row.approved),
    yes(row.finalReview),
    yes(row.notified),
    row.status,
    orBlank(row.settledOn),
    row.cutDate,
  ];
}

export function buildCarteraWorkbook(
  payables: readonly Payable[],
  accounts: readonly BankAccount[],
  companyName: string,
): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  wb.creator = "LiderPlus";
  const ws = wb.addWorksheet(CARTERA_SHEET);
  CARTERA_COLUMNS.forEach((column, index) => {
    ws.getColumn(index + 1).width = Math.max(14, Math.min(44, column.length + 8));
  });
  ws.addRow([companyName]).font = { bold: true, size: 14 };
  ws.addRow([CARTERA_MARK]).font = { bold: true };
  ws.addRow([]);
  const header = ws.addRow([...CARTERA_COLUMNS]);
  header.font = { bold: true };
  ws.views = [{ state: "frozen", ySplit: header.number }];
  const ref = accountRefs(accounts);
  const sorted = [...payables].sort(
    (a, b) => a.supplier.localeCompare(b.supplier) || (a.dueOn ?? "").localeCompare(b.dueOn ?? ""),
  );
  for (const row of sorted) {
    const written = ws.addRow(carteraRow(row, ref));
    for (const column of AMOUNT_COLUMNS) {
      written.getCell(column).numFmt = AMOUNT_FMT;
    }
  }
  return wb;
}
