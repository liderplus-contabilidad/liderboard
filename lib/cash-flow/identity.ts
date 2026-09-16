/**
 * What makes a stored row THE SAME row the next time the file comes in.
 *
 * A document's id is composed from what the cartera says about it and nothing the user can edit:
 * empresa · source · supplier (normalized) · doc type · doc number. Stable across cuts, it is what
 * lets `mergeCut` upsert a reloaded document over the previous one and KEEP its marks and its four
 * working columns. A document that changes number or supplier between cuts is, by this rule, a new
 * one — which is what the file says.
 *
 * A check's id is the empresa plus its N° EGRESO: the register's own running number, unique in the
 * book, so reloading the whole history upserts instead of duplicating twelve thousand rows.
 */
import { normalizeLabel } from "@/lib/workspaces";
import type { PayableSource } from "./types";

export function payableId(
  clientId: string,
  source: Exclude<PayableSource, "manual">,
  supplier: string,
  docType: string,
  docNumber: string,
): string {
  return [
    clientId,
    source,
    normalizeLabel(supplier),
    normalizeLabel(docType),
    docNumber.trim(),
  ].join("::");
}

export function checkId(clientId: string, voucher: string): string {
  return `${clientId}::${voucher.trim()}`;
}
