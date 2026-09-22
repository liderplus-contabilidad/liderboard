/**
 * What loading a cartera DOES to the stored one — pure, so it can be proved without a database and
 * then executed by `db.applyCut` in one transaction.
 *
 * A cut REPLACES and CONSERVES: every document the file brings is written over its previous row
 * (same `id`, see `identity.ts`), taking the file's figures and keeping what the user wrote on it —
 * the mark of payment, the cash label, the schedule, the account and the four working columns. Every OPEN document
 * of the same `source` the file does NOT bring is taken as paid and marked `settled` at the cut
 * date. It is archived and never deleted, because a flow of two weeks ago still reads it.
 *
 * Only the same `source`: a Dingoo cut says nothing about what Contífico owes, and a MANUAL
 * obligation is never settled by absence — nothing exports it, so nothing can stop bringing it.
 */
import type { ParsedPayable, Payable, PayableSource } from "./types";

/** The fields a reload keeps from the stored row. Everything else is the file's. */
function keptFrom(old: Payable): Partial<Payable> {
  return {
    priority: old.priority,
    cash: old.cash,
    payOn: old.payOn,
    payFromAccountId: old.payFromAccountId,
    observation: old.observation,
    approved: old.approved,
    finalReview: old.finalReview,
    notified: old.notified,
  };
}

export interface IncomingPayable extends ParsedPayable {
  id: string;
}

export function mergeCut(
  existing: readonly Payable[],
  incoming: readonly IncomingPayable[],
  clientId: string,
  source: Exclude<PayableSource, "manual">,
  cutDate: string,
): Payable[] {
  const previous = new Map(existing.map((row) => [row.id, row]));
  const seen = new Set<string>();
  const writes: Payable[] = [];

  for (const doc of incoming) {
    seen.add(doc.id);
    const old = previous.get(doc.id);
    const fresh: Payable = {
      id: doc.id,
      clientId,
      source,
      supplier: doc.supplier,
      supplierTaxId: doc.supplierTaxId,
      docType: doc.docType,
      docNumber: doc.docNumber,
      description: doc.description,
      issuedOn: doc.issuedOn,
      dueOn: doc.dueOn,
      amount: doc.amount,
      withholdings: doc.withholdings,
      payments: doc.payments,
      balance: doc.balance,
      centerName: doc.centerName,
      priority: null,
      cash: false,
      payOn: null,
      payFromAccountId: null,
      observation: "",
      approved: null,
      finalReview: false,
      notified: false,
      status: "open",
      settledOn: null,
      cutDate,
    };
    writes.push(old ? { ...fresh, ...keptFrom(old) } : fresh);
  }

  for (const row of existing) {
    if (row.source === source && row.status === "open" && !seen.has(row.id)) {
      writes.push({ ...row, status: "settled", settledOn: cutDate });
    }
  }

  return writes;
}
