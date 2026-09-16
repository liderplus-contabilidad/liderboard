/**
 * The ONE definition of «cheques girados y no cobrados», the figure the flow subtracts from an
 * account's disponible. It is a reading AT A DATE: a check counts when it has left the chequebook
 * by then (`issuedOn <= asOf`) and had not come back (`cashedOn` empty or after `asOf`), whatever
 * step of its timeline it is on and unless it was voided. That is why a flow of 5 August keeps its
 * figure after the check is cashed on the 9th, and why the register stores `cashedOn` and not only
 * the step.
 *
 * A check with no account resolved (CAJA, CRUCE, RECAUDACION TC) belongs to no sum: it is listed
 * under «Sin cuenta» and assignable in bulk, but it never moves a bank's figure in silence.
 */
import type { Check, CheckStep } from "./types";

export const CHECK_STEPS: readonly CheckStep[] = ["made", "signed", "delivered", "cashed"];

export const CHECK_STEP_LABELS: Record<CheckStep, string> = {
  made: "Realizado",
  signed: "Firmado",
  delivered: "Entregado",
  cashed: "Cobrado",
};

export function stepIndex(step: CheckStep): number {
  return CHECK_STEPS.indexOf(step);
}

/** The label the grid and the Excel print: the step, or «Anulado» over everything. */
export function checkStatusLabel(check: Pick<Check, "step" | "voided">): string {
  return check.voided ? "Anulado" : CHECK_STEP_LABELS[check.step];
}

export function isOutstandingAt(check: Check, asOf: string): boolean {
  if (check.voided) {
    return false;
  }
  if (check.issuedOn && check.issuedOn > asOf) {
    return false;
  }
  return check.cashedOn === null || check.cashedOn > asOf;
}

/** The outstanding checks of ONE account at `asOf`. */
export function outstandingChecks(
  checks: readonly Check[],
  accountId: string,
  asOf: string,
): Check[] {
  return checks.filter((check) => check.accountId === accountId && isOutstandingAt(check, asOf));
}

/** The outstanding amount of EVERY account at `asOf`, keyed by account id. Accounts with nothing
 *  outstanding are absent. Checks without an account are not in any entry. */
export function outstandingByAccount(checks: readonly Check[], asOf: string): Map<string, number> {
  const totals = new Map<string, number>();
  for (const check of checks) {
    if (check.accountId === null || !isOutstandingAt(check, asOf)) {
      continue;
    }
    totals.set(check.accountId, (totals.get(check.accountId) ?? 0) + check.amount);
  }
  return totals;
}

/** The distinct bank labels of the checks that resolved to no account, with their counts. */
export function unassignedBanks(checks: readonly Check[]): { bank: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const check of checks) {
    if (check.accountId === null) {
      counts.set(check.bank, (counts.get(check.bank) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([bank, count]) => ({ bank, count }))
    .sort((a, b) => b.count - a.count || a.bank.localeCompare(b.bank));
}

/**
 * The N° EGRESO a new check is proposed with: one past the highest numeric voucher the empresa
 * holds — the register's own running number, which the book pre-prints a thousand rows ahead. «1»
 * for an empty register. It is a PROPOSAL: the form keeps it editable, because the accountant's
 * numbering is theirs.
 */
export function nextVoucher(checks: readonly Check[]): string {
  let highest = 0;
  for (const check of checks) {
    const value = Number(check.voucher);
    if (Number.isInteger(value) && value > highest) {
      highest = value;
    }
  }
  return String(highest + 1);
}
