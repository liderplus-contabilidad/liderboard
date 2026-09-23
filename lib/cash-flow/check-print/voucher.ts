/**
 * THE COMPROBANTE DE EGRESO AS FLAT DATA — Dingoo's A4 reduced to text, every amount ALREADY
 * formatted, so a test compares strings against the paper instead of numbers against another
 * computation. `voucher-layout.ts` places it and `render.ts` draws it; neither decides a word.
 *
 * It is also what the «Comprobante de egreso» window EDITS: built with what the app knows plus the
 * standard ledger codes, shown in the shape of the paper, and every string can be completed or
 * corrected there before the download — so nothing missing has to be configured beforehand.
 *
 * What the app does not hold is not invented: without a letterhead typed once, the paper carries the
 * name alone, an empty party field is not printed, without documents the table is not drawn, and the
 * «Asiento No.» of the accounting system has no equivalent here.
 */
import { formatDayMonthYear } from "@/lib/date";
import type { EntityLogo } from "@/lib/logos";
import type { BankAccount, CashFlowClient, Check, CheckPayment, Payable } from "../types";

/**
 * The entry's two accounts, as Dingoo's comprobante writes them: the standard every comprobante is
 * born with. They are not configured anywhere — a different code is typed in the window, for that
 * print.
 */
export const STANDARD_LEDGER = {
  payables: { code: "2.01.01.01.01", name: "PROVEEDORES" },
  bankCode: "1.01.01.03.02",
} as const;

const AMOUNT = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** `1,487.31` — the comprobante's amounts carry no symbol, like the accounting system's. */
export function voucherAmount(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  return AMOUNT.format(Object.is(rounded, -0) ? 0 : rounded);
}

/** `562` → `000000562`, the accounting system's nine digits. A voucher that is not a number stays as
 *  typed: the numbering is the accountant's. */
export function voucherNumber(voucher: string): string {
  const trimmed = voucher.trim();
  return /^\d{1,9}$/.test(trimmed) ? trimmed.padStart(9, "0") : trimmed;
}

/** «CUENTA BANCARIA PICHINCHA 2100350469». */
export function bankLedgerName(account: Pick<BankAccount, "bank" | "number">): string {
  return ["CUENTA BANCARIA", account.bank, account.number].filter(Boolean).join(" ").toUpperCase();
}

export interface VoucherEntryLine {
  code: string;
  name: string;
  debit: string;
  credit: string;
}

export interface VoucherDocumentLine {
  issuedOn: string;
  number: string;
  previous: string;
  amount: string;
  current: string;
}

export interface VoucherDocument {
  company: string;
  logo?: EntityLogo;
  companyLines: readonly string[];
  /** «COMPROBANTE DE EGRESO No. 000000562» */
  title: string;
  /** Beneficiario · Identificación · Dirección, always the three: an empty value is not printed. */
  party: readonly { label: string; value: string }[];
  issuedOn: string;
  entry: readonly VoucherEntryLine[];
  entryTotal: string;
  /** Empty when the check pays no document — and then the table is not drawn. */
  documents: readonly VoucherDocumentLine[];
  documentTotals: { previous: string; amount: string; current: string };
  payment: { method: string; date: string; account: string; number: string; value: string };
  /** «Generado el 22/09/2026 21:32:36» */
  generated: string;
}

function timestamp(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()} ${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

export function buildVoucherDocument({
  check,
  client,
  account,
  date,
  generatedAt,
}: {
  check: Check;
  client: Pick<CashFlowClient, "name" | "logo" | "letterhead">;
  account: BankAccount | undefined;
  /** The emission date, already resolved to the cut date when the check has none. */
  date: string;
  generatedAt: Date;
}): VoucherDocument {
  const issuedOn = formatDayMonthYear(date) ?? "";
  const value = voucherAmount(check.amount);
  const payments = check.payments ?? [];

  const party = [
    { label: "Beneficiario:", value: check.payee.trim().toUpperCase() },
    { label: "Identificación:", value: check.payeeTaxId?.trim() ?? "" },
    { label: "Dirección:", value: check.payeeAddress?.trim().toUpperCase() ?? "" },
  ];

  const bankName = account ? bankLedgerName(account) : `CUENTA BANCARIA ${check.bank}`.trim();

  const sum = (pick: (payment: CheckPayment) => number) =>
    payments.reduce((total, payment) => total + pick(payment), 0);

  return {
    // The name in bold, then the letterhead's lines — razón social first, as Dingoo prints it.
    company: client.letterhead?.name.trim() || client.name,
    ...(client.logo ? { logo: client.logo } : {}),
    companyLines: client.letterhead?.lines ?? [],
    title: `COMPROBANTE DE EGRESO No. ${voucherNumber(check.voucher)}`,
    party,
    issuedOn,
    entry: [
      { ...STANDARD_LEDGER.payables, debit: value, credit: "" },
      { code: STANDARD_LEDGER.bankCode, name: bankName, debit: "", credit: value },
    ],
    entryTotal: value,
    documents: payments.map((payment) => ({
      issuedOn: formatDayMonthYear(payment.issuedOn) ?? "",
      number: payment.docNumber,
      previous: voucherAmount(payment.balance),
      amount: voucherAmount(payment.amount),
      current: voucherAmount(payment.balance - payment.amount),
    })),
    documentTotals: {
      previous: voucherAmount(sum((payment) => payment.balance)),
      amount: voucherAmount(sum((payment) => payment.amount)),
      current: voucherAmount(sum((payment) => payment.balance - payment.amount)),
    },
    payment: {
      method: "Cheque",
      date: issuedOn,
      account: account ? [account.bank, account.number].filter(Boolean).join("/") : check.bank,
      number: check.number,
      value,
    },
    generated: `Generado el ${timestamp(generatedAt)}`,
  };
}

/**
 * Links a document to a check: a SNAPSHOT of it today, with the abono proposed as what is left of
 * the check up to the document's balance — so documents added one after another fill the check in
 * order. Never negative: a check already covered proposes zero, and the user types the abono.
 */
export function proposePayment(
  payable: Pick<Payable, "id" | "docNumber" | "issuedOn" | "balance">,
  checkAmount: number,
  existing: readonly CheckPayment[],
): CheckPayment {
  const covered = existing.reduce((total, payment) => total + payment.amount, 0);
  const left = Math.max(0, Math.round((checkAmount - covered) * 100) / 100);
  return {
    payableId: payable.id,
    docNumber: payable.docNumber,
    issuedOn: payable.issuedOn,
    balance: payable.balance,
    amount: Math.min(payable.balance, left),
  };
}
