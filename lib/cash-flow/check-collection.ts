import { daysBetween } from "./dates";
import type { Check } from "./types";

/** Operational reminders read all pending checks, including future issues and unassigned banks. */
export function pendingCollections(checks: readonly Check[], today: string) {
  return checks
    .filter((check) => !check.voided && check.step !== "cashed" && !check.cashedOn)
    .map((check) => {
      const days = check.expectedCashOn ? daysBetween(today, check.expectedCashOn) : null;
      const label =
        days === null
          ? "Falta programar el cobro"
          : days < 0
            ? `Pendiente hace ${-days} ${days === -1 ? "día" : "días"}`
            : days === 0
              ? "Cobro previsto hoy"
              : `Cobro en ${days} ${days === 1 ? "día" : "días"}`;
      const variant =
        days !== null && days < 0
          ? ("negative" as const)
          : days === null || days <= 7
            ? ("warning" as const)
            : ("outline" as const);
      return { check, days, label, variant };
    })
    .sort(
      (a, b) =>
        (a.days ?? Infinity) - (b.days ?? Infinity) || a.check.number.localeCompare(b.check.number),
    );
}

export type CollectionFilter = "all" | "attention" | "today" | "soon" | "late" | "undated";
export type CollectionOrder = "issued" | "collection";

export const COLLECTION_FILTERS: { value: CollectionFilter; label: string }[] = [
  { value: "all", label: "Todos" },
  { value: "attention", label: "Con advertencia" },
  { value: "today", label: "Hoy" },
  { value: "soon", label: "Próximos 7 días" },
  { value: "late", label: "Atrasados" },
  { value: "undated", label: "Sin fecha" },
];

/** Uses the same dates and pending-state rules as the warning in each row. */
export function collectionView(
  checks: readonly Check[],
  today: string,
  filter: CollectionFilter,
  order: CollectionOrder,
) {
  const notices = new Map(
    pendingCollections(checks, today).map((notice) => [notice.check.id, notice]),
  );
  const counts: Record<CollectionFilter, number> = {
    all: checks.length,
    attention: 0,
    today: 0,
    soon: 0,
    late: 0,
    undated: 0,
  };
  function matches(check: Check, selection: CollectionFilter) {
    if (selection === "all") return true;
    const notice = notices.get(check.id);
    if (!notice) return false;
    const { days } = notice;
    switch (selection) {
      case "attention":
        return notice.variant !== "outline";
      case "today":
        return days === 0;
      case "soon":
        return days !== null && days > 0 && days <= 7;
      case "late":
        return days !== null && days < 0;
      case "undated":
        return days === null;
    }
  }
  for (const check of checks) {
    for (const { value } of COLLECTION_FILTERS) {
      if (value !== "all" && matches(check, value)) counts[value]++;
    }
  }
  const rows = checks
    .filter((check) => matches(check, filter))
    .sort((a, b) => {
      if (order === "collection") {
        const left = notices.get(a.id);
        const right = notices.get(b.id);
        // Dated pending checks first (oldest due date first), then undated, then completed.
        const rank = (notice: typeof left) => (!notice ? 2 : notice.days === null ? 1 : 0);
        const priority = rank(left) - rank(right);
        if (priority) return priority;
        const days = (left?.days ?? 0) - (right?.days ?? 0);
        if (days) return days;
      }
      return (
        (b.issuedOn ?? "").localeCompare(a.issuedOn ?? "") ||
        b.voucher.localeCompare(a.voucher, undefined, { numeric: true }) ||
        a.id.localeCompare(b.id)
      );
    });
  return { rows, counts };
}
