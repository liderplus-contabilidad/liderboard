/**
 * Builds check PDFs for preview and printing; vouchers retain their explicit download.
 * Rendering is imported dynamically and never writes to the account's configuration.
 */
import { downloadBlob } from "@/lib/download";
import { placeCheck, resolveCheckLayout, SAMPLE_CHECK, type CheckPrintInput } from "./layout";
import type { MeasureText, PrintPage } from "./types";
import type { BankAccount } from "../types";
import type { VoucherDocument } from "./voucher";
import { layoutVoucher } from "./voucher-layout";

export interface PdfPreview {
  blob: Blob;
  filename: string;
}

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

async function buildPdf(
  build: (measure: MeasureText) => readonly PrintPage[],
  filename: string,
): Promise<PdfPreview> {
  const { renderPrintPages } = await import("./render");
  const bytes = await renderPrintPages(build);
  return { blob: new Blob([bytes.slice().buffer], { type: "application/pdf" }), filename };
}

export function createCheckPdf(
  input: CheckPrintInput & { number: string },
  account: Pick<BankAccount, "checkLayout">,
): Promise<PdfPreview> {
  const layout = resolveCheckLayout(account.checkLayout);
  return buildPdf(
    (measure) => [placeCheck(input, layout, measure)],
    checkFilename(input.number, input.payee),
  );
}

/** The alignment test: the same check with the form's outline and a labelled box per field. */
export function createCheckTestPdf(
  account: Pick<BankAccount, "bank" | "number" | "checkLayout">,
  date: string,
): Promise<PdfPreview> {
  const layout = resolveCheckLayout(account.checkLayout);
  return buildPdf(
    (measure) => [placeCheck({ ...SAMPLE_CHECK, date }, layout, measure, { guides: true })],
    checkTestFilename(account),
  );
}

export async function downloadVoucher(
  document: VoucherDocument,
  voucher: string,
  payee: string,
): Promise<void> {
  const pdf = await buildPdf(
    (measure) => layoutVoucher(document, measure),
    voucherFilename(voucher, payee),
  );
  downloadBlob(pdf.blob, pdf.filename);
}
