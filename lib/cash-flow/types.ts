/**
 * Flujo de caja y CxP domain types: the EMPRESA (with its centers and bank accounts), what is OWED
 * (`Payable`), the CHECK register (`Check`) and what a FLOW captures (`PaymentFlow`).
 *
 * Three things are deliberately NOT here, because they are derived on every read and never stored
 * (`CLAUDE.md`: nothing derived is persisted):
 *   - the AGING of a document (por vencer / vencida, 30 · 60 · 90 · 120 · >120) — `aging.ts` computes
 *     it from `dueOn` and the cut date; the buckets Contífico writes are discarded at the door;
 *   - the «cheques girados y no cobrados» of an account — `checks.ts` reads them AT A DATE;
 *   - every figure of the flow (disponible, saldo final, faltante, préstamos) — `flow.ts`.
 *
 * `Parsed*` mirror `ParsedDataset` in `lib/profit-loss/types.ts`: what a parser produces, with no
 * owner yet — `db.ts` is what stamps the `clientId` at the door.
 */

import type { EntityLogo } from "@/lib/workspaces";

/** The module's empresa: a name chosen by the user. Same shape as `NamedEntity` of `lib/workspaces`,
 *  so the generic name rules apply. Its centers and accounts live in their own tables. */
export interface CashFlowClient {
  id: string;
  name: string;
  /** Heads the printed flow, like every other module's letterhead. Not indexed. */
  logo?: EntityLogo;
}

/**
 * A business UNIT of the empresa (Comisersa's HA · HC · HK). Optional: Nomik declares none, and
 * every control that speaks of centers renders nothing for it. It is what lets a payment from one
 * unit's account for another unit's document be read as a LOAN between them (`flow.ts`).
 */
export interface CashFlowCenter {
  id: string;
  clientId: string;
  name: string;
}

/** A bank account of the empresa: what the flow captures a balance for. */
export interface BankAccount {
  id: string;
  clientId: string;
  /** The bank's name as the check register writes it («PRODUBANCO»): the label `checks-log.ts`
   *  resolves a check's account by. */
  bank: string;
  /** The account number, for telling two accounts of the same bank apart («80010385»). */
  number: string;
  /** The user's own name for it («Produbanco HA»), shown wherever the account is named when set;
   *  without it, bank + number. Never used to resolve a check's bank — that is `bank`'s job. */
  label?: string;
  /** The credit line the flow adds to the balance: `disponible = saldo + sobregiro`. */
  overdraft: number;
  /** The unit that owns it, or `null` for an account of the empresa as a whole. */
  centerId: string | null;
}

export type PayableSource = "contifico" | "dingoo" | "manual";

/** The class of an obligation no accounting system exports. Only a manual payable carries one. */
export type PayableKind = "sri" | "iess" | "arriendo" | "sueldos" | "cuota" | "prestamo" | "otros";

/** The mark that puts a document INTO the flow. `null` is «sin marcar»: open, but not decided. */
export type PayPriority = "urgent" | "pending";

/**
 * One thing owed: a document a cartera brought (Contífico or Dingoo) or an obligation typed by hand.
 * ONE table for both because the flow, the Excel and the report paint one list, and two tables would
 * have forced every reader to join two reads.
 *
 * The `id` of an imported document is stable across cuts (`identity.ts`), which is what lets a reload
 * keep the marks and the four working columns; a manual one carries a uuid.
 */
export interface Payable {
  id: string;
  clientId: string;
  source: PayableSource;
  supplier: string;
  supplierTaxId: string | null;
  /** «FAC» · «NVE» · «CVE» · «DNA» as the cartera writes it; «—» for a manual obligation. */
  docType: string;
  docNumber: string;
  description: string;
  issuedOn: string | null;
  dueOn: string | null;
  /** The document's face value, its withholdings and what has been paid: `balance` is what is owed. */
  amount: number;
  withholdings: number;
  payments: number;
  balance: number;
  /** The cost center label the FILE brought («CULTURA MANOR»), or the center chosen for a manual
   *  one. A label, never an id: it is matched against the empresa's centers by `normalizeLabel`. */
  centerName: string | null;
  /** Only a manual obligation has a class. */
  kind?: PayableKind;
  /** The mark of payment — see `PayPriority`. */
  priority: PayPriority | null;
  /** The date the payment is scheduled for, if one was set. */
  payOn: string | null;
  /** The account the payment leaves from, or `null` when not chosen (the flow sums it at company
   *  level and in no account). */
  payFromAccountId: string | null;
  /** The four working columns of the `REPORTE CXP`. `approved` is a MONTO: what the first review
   *  approved paying, which is also what the flow counts for a marked document (`approved ?? balance`). */
  observation: string;
  approved: number | null;
  finalReview: boolean;
  notified: boolean;
  /** `settled` is archived, never deleted: a past flow still reads it. */
  status: "open" | "settled";
  settledOn: string | null;
  /** The cut that brought or last updated it; the day it was typed for a manual one. */
  cutDate: string;
}

/** The four steps of a check's timeline, in order. `voided` is orthogonal (see `Check`). */
export type CheckStep = "made" | "signed" | "delivered" | "cashed";

/**
 * One check of the register. `step` is how far it got (the four X of the book, read as an ORDER
 * rather than four booleans) and `voided` whether it was annulled — orthogonal, because a delivered
 * check can be annulled without losing how far it went. `cashedOn` is stored and not only the step
 * so that a flow of the 5th keeps reading its figure after the check is cashed on the 9th.
 */
export interface Check {
  id: string;
  clientId: string;
  /** N° EGRESO — the register's identity: reloading the book upserts by it. */
  voucher: string;
  /** The bank label as the book wrote it. Kept even once an account is resolved, for the Excel. */
  bank: string;
  /** The empresa's account it belongs to, or `null` when the bank label matched none (CAJA, CRUCE…):
   *  visible, assignable in bulk, and outside every sum. */
  accountId: string | null;
  payee: string;
  number: string;
  amount: number;
  issuedOn: string | null;
  step: CheckStep;
  voided: boolean;
  cashedOn: string | null;
  place: string;
  note: string;
}

/** A projected income of a flow: free concept, so it fits «PROYECCION INGRESOS RESERVAS» (Nomik),
 *  «CHEQUE X EFECTIVIZAR» (Comisersa) and «Ingreso semanal» (the detailed one) alike. */
export interface FlowIncome {
  id: string;
  concept: string;
  amount: number;
  accountId: string | null;
}

/**
 * What a flow CAPTURES at a date — and nothing more. Unique per (empresa, date): it is the record of
 * the cut date the bar shows. The lines are not here: what is paid is read from the documents'
 * marks (`Payable.priority`), so a new date never asks to mark the same invoice again.
 */
export interface PaymentFlow {
  id: string;
  clientId: string;
  /** ISO `yyyy-mm-dd`. */
  date: string;
  balances: Record<string, number>;
  incomes: FlowIncome[];
}

// ---------------------------------------------------------------------------
// What the parsers produce — no owner yet
// ---------------------------------------------------------------------------

/** One document as a cartera brought it, before `db.ts` stamps the owner and the identity. */
export interface ParsedPayable {
  supplier: string;
  supplierTaxId: string | null;
  docType: string;
  docNumber: string;
  description: string;
  issuedOn: string | null;
  dueOn: string | null;
  amount: number;
  withholdings: number;
  payments: number;
  balance: number;
  centerName: string | null;
}

/** A whole cartera as read: who it belongs to according to the file, its cut (Contífico declares
 *  it; Dingoo does not, and the dialog asks) and its documents. */
export interface ParsedCartera {
  source: Exclude<PayableSource, "manual">;
  companyName: string | null;
  cutDate: string | null;
  payables: ParsedPayable[];
  /** Rows the reader skipped and why — the dialog counts them. */
  skipped: number;
}

/** One check as the register's book brought it — the bank still a LABEL, resolved at the door. */
export interface ParsedCheck {
  voucher: string;
  bank: string;
  payee: string;
  number: string;
  amount: number;
  issuedOn: string | null;
  step: CheckStep;
  voided: boolean;
  cashedOn: string | null;
  place: string;
}
