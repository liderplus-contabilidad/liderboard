/**
 * What the register's book says about the empresa's BANKS, so the upload can propose the accounts
 * instead of asking the user to type what the file already knows.
 *
 * The book's BANCO column mixes real banks (PRODUBANCO · PICHINCHA · PACIFICO · AUSTRO) with what is
 * not one — the cash boxes (CAJA, CAJA GASTOS, CAJA MAYORISTA), the cross-payments (CRUCE), the
 * annulments (ANULADO) and the card collections (RECAUDACION TC). Those are still listed, because
 * only the user can say whether a box deserves an account, but they are NOT suggested. Spelling
 * variants («PICHINCHA », «pichincha») are one label, written the way the book writes it most.
 */
import { normalizeLabel } from "@/lib/workspaces";
import type { BankAccount, ParsedCheck } from "../types";

/** Labels that name something other than a bank account. Matched on the normalized label's start. */
const NOT_A_BANK = /^(caja|cruce|anulad|recaudaci|cxp)/;

export interface DetectedBank {
  /** The label as the book writes it most often, trimmed. */
  bank: string;
  /** Checks that carry it — voided ones included, so the count matches the book. */
  count: number;
  /** An account of the empresa already answers to this label. */
  known: boolean;
  /** Proposed for creation: a bank by name, and not yet known. */
  suggested: boolean;
}

export function detectBanks(
  checks: readonly ParsedCheck[],
  accounts: readonly BankAccount[],
): DetectedBank[] {
  const known = new Set(accounts.map((account) => normalizeLabel(account.bank)));
  const groups = new Map<string, { spellings: Map<string, number>; count: number }>();
  for (const check of checks) {
    const key = normalizeLabel(check.bank);
    if (!key) {
      continue;
    }
    const group = groups.get(key) ?? { spellings: new Map(), count: 0 };
    const spelling = check.bank.trim();
    group.spellings.set(spelling, (group.spellings.get(spelling) ?? 0) + 1);
    group.count += 1;
    groups.set(key, group);
  }
  return [...groups.entries()]
    .map(([key, group]) => {
      const bank = [...group.spellings.entries()].sort((a, b) => b[1] - a[1])[0][0];
      const isKnown = known.has(key);
      return {
        bank,
        count: group.count,
        known: isKnown,
        suggested: !isKnown && !NOT_A_BANK.test(key),
      };
    })
    .sort((a, b) => b.count - a.count || a.bank.localeCompare(b.bank));
}
