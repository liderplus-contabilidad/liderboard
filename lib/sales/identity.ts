/**
 * Which COMPANY a client's sales belong to: the `COD. EMPRESA` its files declare (the flat report
 * writes no company name).
 *
 * DERIVED, never stored —read off the coverage— so a client with no sales has no identity and the
 * first upload adopts it. The client's LABEL never enters the comparison.
 *
 * Declared weakness: if the system writes `'01'` for every clinic, this guard distinguishes
 * nothing. It cannot be known from one file.
 */
import type { ParsedSalesMonth, SalesCoverage } from "./types";

export interface SalesIdentity {
  /** Verbatim, exactly as the file declares it — it is what the notice shows. */
  companyCode: string;
}

/** `'01'` and `'1'` are the same company; the stored value keeps its zeros. */
function normalize(code: string): string {
  const trimmed = code.trim().toUpperCase();
  const digits = /^\d+$/.test(trimmed) ? trimmed.replace(/^0+(?=\d)/, "") : trimmed;
  return digits;
}

/** The identity of what the client ALREADY has, or `null` if it has nothing. */
export function deriveSalesIdentity(coverage: readonly SalesCoverage[]): SalesIdentity | null {
  const named = coverage.find((row) => row.companyCode.trim() !== "");
  return named ? { companyCode: named.companyCode } : null;
}

/** The identity of what is arriving. `null` if no file of the batch declares a company code. */
export function incomingSalesIdentity(parsed: readonly ParsedSalesMonth[]): SalesIdentity | null {
  const named = parsed.find((month) => month.companyCode.trim() !== "");
  return named ? { companyCode: named.companyCode } : null;
}

export function sameSalesIdentity(a: SalesIdentity, b: SalesIdentity): boolean {
  return normalize(a.companyCode) === normalize(b.companyCode);
}

/** A NOTICE, not a block: the firm may have renumbered its companies. */
export function describeSalesIdentityClash(
  current: SalesIdentity,
  incoming: SalesIdentity,
  clientName: string,
): string {
  return (
    `Las ventas cargadas en «${clientName}» son de la empresa ${current.companyCode}, y estos ` +
    `archivos declaran la ${incoming.companyCode}. Si es la misma empresa con otro código, ` +
    `continúa; si no, cancela y abre el cliente al que pertenecen: cargar aquí mezclaría la ` +
    `facturación de dos compañías en un mismo cliente.`
  );
}
