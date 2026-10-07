import { normalizeLabel } from "@/lib/workspaces";
import type { PaymentFlow } from "./types";

/** Suggestions come from this company's captures, across cuts; no separate catalogue to keep
 * in sync. Empty captures remain empty, and equivalent labels keep their first spelling. */
export function incomeLabels(flows: readonly PaymentFlow[]): string[] {
  const labels = new Map<string, string>();
  for (const flow of flows) {
    for (const income of flow.incomes) {
      const label = income.concept.trim();
      const key = normalizeLabel(label);
      if (key && !labels.has(key)) labels.set(key, label);
    }
  }
  return [...labels.values()].sort((a, b) => a.localeCompare(b, "es"));
}
