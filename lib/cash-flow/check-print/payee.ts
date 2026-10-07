/**
 * WHAT IS ALREADY KNOWN OF A BENEFICIARY — derived, never a directory of its own. Their cédula / RUC
 * and address were typed once, on some check to them; the next check to the same beneficiary is
 * born with them. Read from the empresa's OTHER checks (the most recent that has the datum), and the
 * id also from the cartera, which brings the supplier's RUC.
 *
 * Derived rather than stored in a table of beneficiaries for the same reason every identity of the
 * app is: a second copy would go stale the day an address is corrected on one check.
 */
import { normalizeLabel } from "@/lib/workspaces";
import type { Check, Payable } from "../types";

export interface PayeeDetails {
  taxId?: string;
  address?: string;
}

export function knownPayeeDetails(
  payee: string,
  checks: readonly Check[],
  payables: readonly Pick<Payable, "supplier" | "supplierTaxId">[],
  exceptCheckId?: string,
): PayeeDetails {
  const key = normalizeLabel(payee);
  if (!key) {
    return {};
  }
  // Most recent first: a corrected address wins over the one it corrected.
  const theirs = checks
    .filter((check) => check.id !== exceptCheckId && normalizeLabel(check.payee) === key)
    .sort((a, b) => (b.issuedOn ?? "").localeCompare(a.issuedOn ?? ""));

  const taxId =
    theirs.find((check) => check.payeeTaxId?.trim())?.payeeTaxId?.trim() ??
    payables.find((payable) => payable.supplierTaxId && normalizeLabel(payable.supplier) === key)
      ?.supplierTaxId ??
    undefined;
  const address = theirs.find((check) => check.payeeAddress?.trim())?.payeeAddress?.trim();

  return { ...(taxId ? { taxId } : {}), ...(address ? { address } : {}) };
}

/** The active empresa's reusable names, read from its records rather than stored twice. */
export function knownPayeeNames(
  checks: readonly Pick<Check, "payee">[],
  payables: readonly Pick<Payable, "supplier">[],
): string[] {
  const names = new Map<string, string>();
  for (const name of [...checks.map((check) => check.payee), ...payables.map((p) => p.supplier)]) {
    const label = name.trim();
    const key = normalizeLabel(label);
    if (key && !names.has(key)) {
      names.set(key, label);
    }
  }
  return [...names.values()].sort((a, b) => a.localeCompare(b, "es"));
}
