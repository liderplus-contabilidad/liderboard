/**
 * Cuentas por pagar's selection, under the house rules of `lib/profit-loss/filters.ts`: no mark =
 * ALL, marks kept in UNIVERSE order (never click order), pruned on READ (`sanitizeFilters`) so a
 * center that no longer exists counts as no mark, never in an effect.
 *
 * `centerIds` is shared with every other tab (it is the bar's «Centro», the mockup's «Unidad»): the
 * flow and Resumen narrow their accounts and their documents by it too. The cut date is NOT a
 * filter — it is a datum of the reading, and lives beside these in the provider.
 */
import { normalizeLabel } from "@/lib/workspaces";
import type { AgingSide } from "./aging";
import { agingOf } from "./aging";
import type { CashFlowCenter, Payable, PayPriority } from "./types";

/** «Sin marcar» is a value of the priority filter, so it has a name of its own here. */
export type PriorityMark = PayPriority | "none";

export const PRIORITY_MARKS: readonly PriorityMark[] = ["urgent", "pending", "none"];
export const AGING_SIDES: readonly AgingSide[] = ["due", "overdue"];

export const PRIORITY_LABELS: Record<PriorityMark, string> = {
  urgent: "Urgente",
  pending: "Pendiente",
  none: "Sin marcar",
};

export interface PayableFilters {
  search: string;
  centerIds: string[];
  sides: AgingSide[];
  priorities: PriorityMark[];
  /** «Ver liquidadas»: with it, settled documents are listed too (greyed). */
  showSettled: boolean;
}

export function emptyPayableFilters(): PayableFilters {
  return { search: "", centerIds: [], sides: [], priorities: [], showSettled: false };
}

function toggled<T>(marks: readonly T[], value: T, universe: readonly T[]): T[] {
  const picked = new Set(marks);
  if (picked.has(value)) {
    picked.delete(value);
  } else {
    picked.add(value);
  }
  return universe.filter((candidate) => picked.has(candidate));
}

export function withSearch(filters: PayableFilters, search: string): PayableFilters {
  return { ...filters, search };
}

export function withCenterToggled(
  filters: PayableFilters,
  centerId: string,
  universe: readonly string[],
): PayableFilters {
  return { ...filters, centerIds: toggled(filters.centerIds, centerId, universe) };
}

export function withSideToggled(filters: PayableFilters, side: AgingSide): PayableFilters {
  return { ...filters, sides: toggled(filters.sides, side, AGING_SIDES) };
}

export function withPriorityToggled(filters: PayableFilters, mark: PriorityMark): PayableFilters {
  return { ...filters, priorities: toggled(filters.priorities, mark, PRIORITY_MARKS) };
}

export function withShowSettled(filters: PayableFilters, showSettled: boolean): PayableFilters {
  return { ...filters, showSettled };
}

export function withCentersCleared(filters: PayableFilters): PayableFilters {
  return { ...filters, centerIds: [] };
}

/** Pruned on read against the empresa's centers; same-object return when nothing changes, so an
 *  unrelated edit does not re-render every reader. */
export function sanitizeFilters(
  filters: PayableFilters,
  centers: readonly CashFlowCenter[],
): PayableFilters {
  const known = new Set(centers.map((center) => center.id));
  const pruned = filters.centerIds.filter((id) => known.has(id));
  return pruned.length === filters.centerIds.length ? filters : { ...filters, centerIds: pruned };
}

export function hasActiveFilters(filters: PayableFilters): boolean {
  return (
    filters.centerIds.length > 0 ||
    filters.sides.length > 0 ||
    filters.priorities.length > 0 ||
    filters.showSettled
  );
}

/**
 * The center a document belongs to, by matching the label the FILE brought against the empresa's
 * centers — `normalizeLabel` on both sides, so «HC» and «hc » are one. `null` when it matches none,
 * which is also the answer for an empresa without centers.
 */
export function resolveCenterId(
  centerName: string | null,
  centers: readonly CashFlowCenter[],
): string | null {
  if (!centerName) {
    return null;
  }
  const wanted = normalizeLabel(centerName);
  return centers.find((center) => normalizeLabel(center.name) === wanted)?.id ?? null;
}

export function matchesSearch(payable: Payable, search: string): boolean {
  const query = normalizeLabel(search);
  if (!query) {
    return true;
  }
  return [payable.supplier, payable.docNumber, payable.description, payable.supplierTaxId ?? ""]
    .map(normalizeLabel)
    .some((field) => field.includes(query));
}

/** What the grid, the tiles and the Excel read: the documents that pass every mark, aged at `asOf`. */
export function applyFilters(
  payables: readonly Payable[],
  filters: PayableFilters,
  centers: readonly CashFlowCenter[],
  asOf: string,
): Payable[] {
  const centerIds = new Set(filters.centerIds);
  const sides = new Set(filters.sides);
  const priorities = new Set(filters.priorities);
  return payables.filter((payable) => {
    if (payable.status === "settled" && !filters.showSettled) {
      return false;
    }
    if (centerIds.size > 0 && !centerIds.has(resolveCenterId(payable.centerName, centers) ?? "")) {
      return false;
    }
    if (sides.size > 0 && !sides.has(agingOf(payable.dueOn, asOf).side)) {
      return false;
    }
    if (priorities.size > 0 && !priorities.has(payable.priority ?? "none")) {
      return false;
    }
    return matchesSearch(payable, filters.search);
  });
}
