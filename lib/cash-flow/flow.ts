/**
 * The flow, DERIVED. A `PaymentFlow` stores only what was captured at a date — a balance per account
 * and the projected incomes — and everything the paper shows is computed here from that, from the
 * accounts (their overdraft), from the check register (`outstandingByAccount` at the date) and from
 * the documents' MARKS (`priority`, `payFromAccountId`, `markedAmount`). It is the third seam of the
 * old workbooks — cheques → flujo, detalle → resumen, cartera → decisión — turned into one function
 * the screen, Resumen, the report and the Excel all read.
 *
 * Per account: `available = balance + overdraft`, `incomes`, `bankTotal = available + incomes` (the
 * «TOTAL BANCOS» of the Nomik sheet: saldo + ingresos + sobregiro), `outstanding` (checks),
 * `urgent`, `pending`, `remaining = bankTotal − outstanding − urgent − pending`, `shortfall =
 * max(0, −remaining)`. The company row is the sum, with two more readings the sheet's «SALDO
 * FALTANTE» row writes beside the first: what would remain paying ONLY the urgent, and ONLY the
 * pending. A marked document with NO account chosen counts in the company row and in no account:
 * it is owed all the same, and hiding it from the total until someone picked a bank would
 * understate the faltante — except when the empresa has exactly ONE account, where there is nothing
 * to choose and the document counts in it (the «exactly one» figure of the app).
 *
 * The LOAN between centers is derived too (D7): a document whose paying account belongs to one
 * center and whose own label resolves to another IS a loan from the first to the second. That is
 * what `CARGAS CASH` used to record by hand, and it is what stops being typed.
 */
import { normalizeLabel } from "@/lib/workspaces";
import { outstandingByAccount } from "./checks";
import { groupBySupplier, markedSplit, type SupplierGroup } from "./derive";
import { resolveCenterId } from "./filters";
import type {
  BankAccount,
  CashFlowCenter,
  Check,
  FlowIncome,
  Payable,
  PaymentFlow,
  PayPriority,
} from "./types";

export interface AccountFlow {
  account: BankAccount;
  balance: number;
  available: number;
  /** Saldo + ingresos + sobregiro — the sheet's «TOTAL BANCOS». */
  bankTotal: number;
  outstanding: number;
  incomes: number;
  urgent: number;
  pending: number;
  remaining: number;
  shortfall: number;
}

export interface FlowTotals {
  balance: number;
  overdraft: number;
  available: number;
  bankTotal: number;
  outstanding: number;
  incomes: number;
  urgent: number;
  pending: number;
  remaining: number;
  shortfall: number;
  /** The sheet's other two «SALDO FALTANTE» figures: paying only the urgent, only the pending. */
  remainingUrgentOnly: number;
  remainingPendingOnly: number;
}

export interface CenterLoan {
  fromCenterId: string;
  toCenterId: string;
  amount: number;
}

export interface FlowLine {
  payable: Payable;
  /** Urgent + pending — what the document adds to the flow. */
  amount: number;
  urgent: number;
  pending: number;
  priority: PayPriority;
}

/** A document settled inside the flow's window: read, never summed. */
export interface SettledLine {
  payable: Payable;
  settledOn: string;
}

export interface DerivedFlow {
  date: string;
  accounts: AccountFlow[];
  totals: FlowTotals;
  /** Incomes not tied to any account — they still add to the company row. */
  unassignedIncomes: number;
  /** Marked documents without an account — in the company row, in no account. */
  unassignedMarked: { urgent: number; pending: number };
  /** Every marked open document, grouped by supplier for the paper. */
  lines: FlowLine[];
  groups: SupplierGroup[];
  loans: CenterLoan[];
  /** What was paid since the previous flow (exclusive) up to the date — the sheet's memory of
   *  what left between two `FJ` sheets. Outside every sum: the captured balance already reflects it. */
  settled: SettledLine[];
  settledTotal: number;
  /** The window's start, or `null` when only the date itself is read. */
  settledSince: string | null;
}

export interface DeriveFlowInput {
  date: string;
  /** `null` when no flow was captured at `date`: every balance reads zero. */
  flow: PaymentFlow | null;
  accounts: readonly BankAccount[];
  centers: readonly CashFlowCenter[];
  payables: readonly Payable[];
  checks: readonly Check[];
  /** The previous flow's date: what was settled AFTER it counts as paid in this window. Without one,
   *  only the date's own settlements are listed. */
  since?: string | null;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function deriveFlow(input: DeriveFlowInput): DerivedFlow {
  const { date, flow, accounts, centers, payables, checks } = input;
  const outstanding = outstandingByAccount(checks, date);
  const marked = payables.filter((payable) => payable.status === "open" && payable.priority);
  // With ONE account there is nothing to choose: what carries no account belongs to it.
  const onlyAccount = accounts.length === 1 ? accounts[0].id : null;

  const incomesByAccount = new Map<string, number>();
  let unassignedIncomes = 0;
  for (const income of flow?.incomes ?? []) {
    const chosen = accounts.some((account) => account.id === income.accountId)
      ? income.accountId
      : onlyAccount;
    if (chosen) {
      incomesByAccount.set(chosen, (incomesByAccount.get(chosen) ?? 0) + income.amount);
    } else {
      unassignedIncomes += income.amount;
    }
  }

  const markedByAccount = new Map<string, { urgent: number; pending: number }>();
  const unassignedMarked = { urgent: 0, pending: 0 };
  const lines: FlowLine[] = [];
  for (const payable of marked) {
    const priority = payable.priority as PayPriority;
    const split = markedSplit(payable);
    const amount = round2(split.urgent + split.pending);
    lines.push({ payable, amount, urgent: split.urgent, pending: split.pending, priority });
    const chosen = accounts.some((account) => account.id === payable.payFromAccountId)
      ? payable.payFromAccountId
      : onlyAccount;
    const bucket = chosen
      ? (markedByAccount.get(chosen) ?? { urgent: 0, pending: 0 })
      : unassignedMarked;
    bucket.urgent += split.urgent;
    bucket.pending += split.pending;
    if (chosen) {
      markedByAccount.set(chosen, bucket);
    }
  }

  const since = input.since ?? null;
  const settled: SettledLine[] = payables
    .filter(
      (payable): payable is Payable & { settledOn: string } =>
        payable.status === "settled" &&
        payable.settledOn !== null &&
        payable.settledOn <= date &&
        (since ? payable.settledOn > since : payable.settledOn === date),
    )
    .map((payable) => ({ payable, settledOn: payable.settledOn }))
    .sort(
      (a, b) =>
        b.settledOn.localeCompare(a.settledOn) ||
        a.payable.supplier.localeCompare(b.payable.supplier),
    );

  const accountFlows: AccountFlow[] = accounts.map((account) => {
    const balance = flow?.balances[account.id] ?? 0;
    const available = balance + account.overdraft;
    const out = outstanding.get(account.id) ?? 0;
    const incomes = incomesByAccount.get(account.id) ?? 0;
    const paid = markedByAccount.get(account.id) ?? { urgent: 0, pending: 0 };
    const bankTotal = round2(available + incomes);
    const remaining = round2(bankTotal - out - paid.urgent - paid.pending);
    return {
      account,
      balance,
      available: round2(available),
      bankTotal,
      outstanding: round2(out),
      incomes: round2(incomes),
      urgent: round2(paid.urgent),
      pending: round2(paid.pending),
      remaining,
      shortfall: remaining < 0 ? -remaining : 0,
    };
  });

  const sum = (pick: (row: AccountFlow) => number) =>
    round2(accountFlows.reduce((acc, row) => acc + pick(row), 0));
  const totals: FlowTotals = {
    balance: sum((row) => row.balance),
    overdraft: round2(accounts.reduce((acc, account) => acc + account.overdraft, 0)),
    available: sum((row) => row.available),
    bankTotal: 0,
    outstanding: sum((row) => row.outstanding),
    incomes: round2(sum((row) => row.incomes) + unassignedIncomes),
    urgent: round2(sum((row) => row.urgent) + unassignedMarked.urgent),
    pending: round2(sum((row) => row.pending) + unassignedMarked.pending),
    remaining: 0,
    shortfall: 0,
    remainingUrgentOnly: 0,
    remainingPendingOnly: 0,
  };
  totals.bankTotal = round2(totals.available + totals.incomes);
  const cleared = round2(totals.bankTotal - totals.outstanding);
  totals.remaining = round2(cleared - totals.urgent - totals.pending);
  totals.shortfall = totals.remaining < 0 ? -totals.remaining : 0;
  totals.remainingUrgentOnly = round2(cleared - totals.urgent);
  totals.remainingPendingOnly = round2(cleared - totals.pending);

  return {
    date,
    accounts: accountFlows,
    totals,
    unassignedIncomes: round2(unassignedIncomes),
    unassignedMarked: {
      urgent: round2(unassignedMarked.urgent),
      pending: round2(unassignedMarked.pending),
    },
    lines,
    groups: groupBySupplier(lines.map((line) => line.payable)),
    loans: deriveLoans(lines, accounts, centers),
    settled,
    settledTotal: round2(settled.reduce((acc, line) => acc + line.payable.balance, 0)),
    settledSince: since,
  };
}

/** Loans between centers, summed by (from, to) pair, largest first. Empty without centers. */
export function deriveLoans(
  lines: readonly FlowLine[],
  accounts: readonly BankAccount[],
  centers: readonly CashFlowCenter[],
): CenterLoan[] {
  if (centers.length === 0) {
    return [];
  }
  const accountCenter = new Map(accounts.map((account) => [account.id, account.centerId]));
  const sums = new Map<string, CenterLoan>();
  for (const line of lines) {
    const from = line.payable.payFromAccountId
      ? (accountCenter.get(line.payable.payFromAccountId) ?? null)
      : null;
    const to = resolveCenterId(line.payable.centerName, centers);
    if (!from || !to || from === to) {
      continue;
    }
    const key = `${from}→${to}`;
    const loan = sums.get(key) ?? { fromCenterId: from, toCenterId: to, amount: 0 };
    loan.amount = round2(loan.amount + line.amount);
    sums.set(key, loan);
  }
  return [...sums.values()].sort((a, b) => b.amount - a.amount);
}

/** «Copiar del anterior»: the previous flow's captures at a new date, with fresh income ids. */
export function copyFlowFrom(previous: PaymentFlow, date: string): Omit<PaymentFlow, "id"> {
  return {
    clientId: previous.clientId,
    date,
    balances: { ...previous.balances },
    incomes: previous.incomes.map((income): FlowIncome => ({ ...income, id: crypto.randomUUID() })),
  };
}

/** The most recent flow strictly BEFORE `date`, or `null` — what «Copiar del anterior» offers. */
export function previousFlow(flows: readonly PaymentFlow[], date: string): PaymentFlow | null {
  let best: PaymentFlow | null = null;
  for (const flow of flows) {
    if (flow.date < date && (!best || flow.date > best.date)) {
      best = flow;
    }
  }
  return best;
}

/** «PRODUBANCO 80010385 · HA» — how an account is named everywhere it is listed; the user's own
 *  `label` («Produbanco HA») replaces bank and number when set. */
export function accountLabel(account: BankAccount, centers: readonly CashFlowCenter[]): string {
  const center = centers.find((candidate) => candidate.id === account.centerId);
  const base = account.label?.trim() || [account.bank, account.number].filter(Boolean).join(" ");
  return center ? `${base} · ${center.name}` : base;
}

export function centerName(centerId: string, centers: readonly CashFlowCenter[]): string {
  return centers.find((center) => center.id === centerId)?.name ?? centerId;
}

/** Whether two labels name the same center — used by the config panel to refuse duplicates. */
export function sameCenterName(a: string, b: string): boolean {
  return normalizeLabel(a) === normalizeLabel(b);
}
