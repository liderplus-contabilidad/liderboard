import { collectionView, pendingCollections } from "./check-collection";
import { stepIndex } from "./checks";
import type { Check } from "./types";

export type CheckSortKey =
  | "voucher"
  | "account"
  | "payee"
  | "number"
  | "amount"
  | "collection"
  | "issued"
  | "step";
export interface CheckSort {
  key: CheckSortKey;
  direction: "asc" | "desc";
}

/** Orders the complete filtered reading before pagination; never changes a stored check. */
export function sortChecks(
  checks: readonly Check[],
  sort: CheckSort,
  accounts: ReadonlyMap<string, string>,
  today: string,
): Check[] {
  const baseline = collectionView(
    checks,
    today,
    "all",
    sort.key === "collection" ? "collection" : "issued",
  ).rows;
  if (sort.key === "collection") {
    if (sort.direction === "asc") return baseline;
    // Keep the engine's pending/undated/completed groups, reversing only dated pending checks.
    const days = new Map(
      pendingCollections(checks, today).map((notice) => [notice.check.id, notice.days]),
    );
    return baseline.sort((a, b) => {
      const left = days.get(a.id);
      const right = days.get(b.id);
      return left != null && right != null ? right - left : 0;
    });
  }
  function value(check: Check): string | number | null {
    switch (sort.key) {
      case "voucher":
        return check.voucher;
      case "account":
        return accounts.get(check.accountId ?? "") ?? `${check.bank || "—"} · sin cuenta`;
      case "payee":
        return check.payee;
      case "number":
        return check.number;
      case "amount":
        return check.amount;
      case "issued":
        return check.issuedOn;
      case "step":
        return check.voided ? 4 : stepIndex(check.step);
      default:
        return null;
    }
  }
  return baseline.sort((a, b) => {
    const left = value(a);
    const right = value(b);
    if (left == null || left === "") return right == null || right === "" ? 0 : 1;
    if (right == null || right === "") return -1;
    const comparison =
      typeof left === "number" && typeof right === "number"
        ? left - right
        : String(left).localeCompare(String(right), "es", { numeric: true, sensitivity: "base" });
    return comparison * (sort.direction === "asc" ? 1 : -1);
  });
}
