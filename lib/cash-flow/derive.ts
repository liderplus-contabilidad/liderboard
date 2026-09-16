/**
 * What is read off a list of payables — never stored. `markedAmount` is THE definition of what a
 * marked document contributes to the flow (`approved ?? balance`): the tiles, `flow.ts`, Resumen,
 * the report and the Excel all ask it, so no two of them can disagree on what «urgente» adds up to.
 */
import { formatCurrency } from "@/lib/format";
import { agingOf, AGING_BUCKETS, type AgingBucket, type AgingSide } from "./aging";
import type { BuiltinKind, Payable, PayableKind } from "./types";

/** The module's amount, ALWAYS with cents: a cartera holds documents of $0.09, and a flow is checked
 *  to the centavo against the bank. The axes of Resumen are the one place that drops them. */
export const money = (value: number) => formatCurrency(value, { cents: true });

const KIND_LABELS: Record<BuiltinKind, string> = {
  sri: "SRI",
  iess: "IESS",
  arriendo: "Arriendo",
  sueldos: "Sueldos",
  cuota: "Cuota",
  prestamo: "Préstamo",
  otros: "Otros",
};

export const BUILTIN_KINDS: readonly BuiltinKind[] = [
  "sri",
  "iess",
  "arriendo",
  "sueldos",
  "cuota",
  "prestamo",
  "otros",
];

function isBuiltinKind(kind: string): kind is BuiltinKind {
  return Object.hasOwn(KIND_LABELS, kind);
}

/** What a class prints: a built-in by its label, a typed one as it was typed. */
export function kindLabel(kind: PayableKind): string {
  return isBuiltinKind(kind) ? KIND_LABELS[kind] : kind;
}

/**
 * What a cell or a typed name means as a class: a built-in id or label (in any case) folds to the
 * id, anything else is a class of its own, trimmed; blank is none. It is what keeps «Arriendo»
 * typed by hand from becoming a second class beside `arriendo`.
 */
export function normalizeKind(text: string): PayableKind | null {
  const clean = text.trim();
  if (!clean) {
    return null;
  }
  const lower = clean.toLowerCase();
  const builtin = BUILTIN_KINDS.find(
    (kind) => kind === lower || KIND_LABELS[kind].toLowerCase() === lower,
  );
  return builtin ?? clean;
}

/** The classes the empresa typed beyond the built-ins, first seen first, for offering them again. */
export function customKinds(payables: readonly Pick<Payable, "kind">[]): PayableKind[] {
  const seen: PayableKind[] = [];
  for (const { kind } of payables) {
    if (kind && !isBuiltinKind(kind) && !seen.includes(kind)) {
      seen.push(kind);
    }
  }
  return seen;
}

/** What a marked document adds to the flow: the amount the first review approved, else its balance. */
export function markedAmount(payable: Pick<Payable, "approved" | "balance">): number {
  return payable.approved ?? payable.balance;
}

/**
 * How a marked document SPLITS between urgent and pending — the sheet's partial payment («261.00 →
 * 189.00 urgente + 72.00 pendiente»): marked URGENT with an approved amount under its balance, the
 * approved part is urgent and the rest is pending; marked pending, everything marked is pending.
 * An unmarked document adds nothing. The one definition the tiles, the flow, the report and the
 * Excel read.
 */
export function markedSplit(
  payable: Pick<Payable, "approved" | "balance" | "priority" | "status">,
): { urgent: number; pending: number } {
  if (payable.status !== "open" || !payable.priority) {
    return { urgent: 0, pending: 0 };
  }
  const amount = markedAmount(payable);
  if (payable.priority === "pending") {
    return { urgent: 0, pending: amount };
  }
  const rest = payable.approved !== null ? Math.max(0, payable.balance - payable.approved) : 0;
  return { urgent: amount, pending: rest };
}

export interface PayableTotals {
  /** Open balance of everything, by side at the cut date. */
  total: number;
  due: number;
  overdue: number;
  /** What is marked for payment, by priority — `markedAmount` each. */
  urgent: number;
  pending: number;
  count: number;
}

/** Sums of the OPEN documents in `payables` at `asOf`. A settled row adds nothing, even if listed. */
export function payableTotals(payables: readonly Payable[], asOf: string): PayableTotals {
  const totals: PayableTotals = { total: 0, due: 0, overdue: 0, urgent: 0, pending: 0, count: 0 };
  for (const payable of payables) {
    if (payable.status !== "open") {
      continue;
    }
    totals.count += 1;
    totals.total += payable.balance;
    if (agingOf(payable.dueOn, asOf).side === "overdue") {
      totals.overdue += payable.balance;
    } else {
      totals.due += payable.balance;
    }
    const split = markedSplit(payable);
    totals.urgent += split.urgent;
    totals.pending += split.pending;
  }
  return totals;
}

export interface SupplierGroup {
  /** The supplier's name, or the class label for a manual obligation with a class. */
  key: string;
  label: string;
  taxId: string | null;
  payables: Payable[];
  /** Open balance of the group. */
  balance: number;
}

/**
 * The grid's shape: one group per supplier, in DESCENDING balance (the order Contífico's report
 * and the `PROVEEDOR` sheets list them), each holding its documents oldest due first. Manual
 * obligations group by supplier the same way — the class is a column, not a group.
 */
export function groupBySupplier(payables: readonly Payable[]): SupplierGroup[] {
  const groups = new Map<string, SupplierGroup>();
  for (const payable of payables) {
    const key = payable.supplier.trim().toLowerCase();
    let group = groups.get(key);
    if (!group) {
      group = {
        key,
        label: payable.supplier,
        taxId: payable.supplierTaxId,
        payables: [],
        balance: 0,
      };
      groups.set(key, group);
    }
    group.payables.push(payable);
    if (payable.status === "open") {
      group.balance += payable.balance;
    }
    if (!group.taxId && payable.supplierTaxId) {
      group.taxId = payable.supplierTaxId;
    }
  }
  const sorted = [...groups.values()].sort(
    (a, b) => b.balance - a.balance || a.label.localeCompare(b.label),
  );
  for (const group of sorted) {
    group.payables.sort((a, b) => (a.dueOn ?? "").localeCompare(b.dueOn ?? ""));
  }
  return sorted;
}

/** Open balance per aging cell — the «Cuentas por pagar por antigüedad» card and the Excel's
 *  column totals. Every cell exists, at zero when empty. */
export function agingDistribution(
  payables: readonly Payable[],
  asOf: string,
): Record<AgingSide, Record<AgingBucket, number>> {
  const empty = (): Record<AgingBucket, number> =>
    Object.fromEntries(AGING_BUCKETS.map((bucket) => [bucket, 0])) as Record<AgingBucket, number>;
  const cells = { due: empty(), overdue: empty() };
  for (const payable of payables) {
    if (payable.status !== "open") {
      continue;
    }
    const aging = agingOf(payable.dueOn, asOf);
    cells[aging.side][aging.bucket] += payable.balance;
  }
  return cells;
}

/** «PALLASCO PALOMO FERNANDA NAT» for a document, «Arriendo · Arriendo mes de marzo» for a manual. */
export function payableTitle(payable: Payable): string {
  if (payable.source === "manual" && payable.kind) {
    return `${kindLabel(payable.kind)} · ${payable.supplier}`;
  }
  return payable.supplier;
}

/** «FAC 001-002-000000020» — the DOCUMENTO column of the `REPORTE CXP`. */
export function documentLabel(payable: Pick<Payable, "docType" | "docNumber">): string {
  return [payable.docType, payable.docNumber].filter((part) => part && part !== "—").join(" ");
}

/**
 * The DETAIL under a document wherever it is listed: what the cartera or the user wrote about it
 * («ARRIENDO DE MES DE MAYO»), then the class of a manual obligation and its center. Contífico's
 * description repeats the supplier and the number in front of the text, so that prefix is dropped —
 * the row already says both.
 */
export function payableDetail(
  payable: Pick<
    Payable,
    "description" | "supplier" | "docType" | "docNumber" | "kind" | "centerName"
  >,
  options: { center?: boolean } = {},
): string {
  let text = payable.description.trim();
  for (const prefix of [payable.supplier, payable.docType, payable.docNumber]) {
    const clean = prefix.trim();
    if (clean && text.toUpperCase().startsWith(clean.toUpperCase())) {
      text = text.slice(clean.length).replace(/^[\s,·.-]+/, "");
    }
  }
  return [
    text,
    payable.kind ? kindLabel(payable.kind) : null,
    options.center === false ? null : payable.centerName,
  ]
    .filter(Boolean)
    .join(" · ");
}
