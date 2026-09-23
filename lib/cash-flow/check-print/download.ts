/**
 * The three PDFs' names and their download. Thin on purpose: `downloadBlob` is the app's one way of
 * downloading, `render.ts` comes in through a dynamic import, and all that is decided here is what
 * each file is called — the way the firm's own checks were named, `Cheque-5751-ENI-ECUADOR-S-A.pdf`.
 */
import { downloadBlob } from "@/lib/download";
import { placeCheck, resolveCheckLayout, SAMPLE_CHECK, type CheckPrintInput } from "./layout";
import type { MeasureText, PrintPage } from "./types";
import type { BankAccount } from "../types";
import type { VoucherDocument } from "./voucher";
import { layoutVoucher } from "./voucher-layout";

/** A piece of a file name: no accents, no spaces, no punctuation. */
function slug(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toUpperCase();
}

/** The prefix is kept as written («Cheque»); what varies is slugged. */
function joinName(prefix: string, ...parts: string[]): string {
  return `${[prefix, ...parts.map(slug)].filter(Boolean).join("-")}.pdf`;
}

/** `Cheque-5751-ENI-ECUADOR-S-A.pdf` */
export function checkFilename(number: string, payee: string): string {
  return joinName("Cheque", number, payee);
}

/** `Comprobante-Egreso-562-ENI-ECUADOR-S-A.pdf` */
export function voucherFilename(voucher: string, payee: string): string {
  return joinName("Comprobante-Egreso", voucher, payee);
}

/** `Prueba-Cheque-PRODUBANCO-80010385.pdf` */
export function checkTestFilename(account: Pick<BankAccount, "bank" | "number">): string {
  return joinName("Prueba-Cheque", account.bank, account.number);
}

async function download(
  build: (measure: MeasureText) => readonly PrintPage[],
  filename: string,
): Promise<void> {
  const { renderPrintPages } = await import("./render");
  const bytes = await renderPrintPages(build);
  downloadBlob(new Blob([bytes.slice().buffer], { type: "application/pdf" }), filename);
}

export function downloadCheck(
  input: CheckPrintInput & { number: string },
  account: Pick<BankAccount, "checkLayout">,
): Promise<void> {
  const layout = resolveCheckLayout(account.checkLayout);
  return download(
    (measure) => [placeCheck(input, layout, measure)],
    checkFilename(input.number, input.payee),
  );
}

/** The alignment test: the same check with the form's outline and a labelled box per field. */
export function downloadCheckTest(
  account: Pick<BankAccount, "bank" | "number" | "checkLayout">,
  date: string,
): Promise<void> {
  const layout = resolveCheckLayout(account.checkLayout);
  return download(
    (measure) => [placeCheck({ ...SAMPLE_CHECK, date }, layout, measure, { guides: true })],
    checkTestFilename(account),
  );
}

export function downloadVoucher(
  document: VoucherDocument,
  voucher: string,
  payee: string,
): Promise<void> {
  return download((measure) => layoutVoucher(document, measure), voucherFilename(voucher, payee));
}
