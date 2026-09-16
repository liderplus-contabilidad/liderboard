/**
 * What a cartera says about the empresa's CENTERS, so the upload can propose them instead of
 * asking the user to type in «Configurar» what the file already brought. Contífico's «Centro de
 * costos» column is the same label `payables.centerName` stores and `resolveCenterId` matches, so a
 * center created from it resolves every document that carries it, today's and the next cut's.
 * Spelling variants («HA », «ha») are one label, written the way the file writes it most, and a
 * cell that lists several («HA, HC») counts the document under each (`splitCenterLabels`).
 *
 * Unlike the bank labels, every label here IS a center — a cost center column holds nothing else —
 * so everything unknown is proposed. Dingoo brings no column, and lists nothing.
 */
import { normalizeLabel } from "@/lib/workspaces";
import { splitCenterLabels } from "../filters";
import type { CashFlowCenter } from "../types";

export interface DetectedCenter {
  /** The label as the file writes it most often, trimmed. */
  name: string;
  count: number;
  /** A center of the empresa already answers to this label. */
  known: boolean;
}

export function detectCenters(
  rows: readonly { centerName: string | null }[],
  centers: readonly CashFlowCenter[],
): DetectedCenter[] {
  const known = new Set(centers.map((center) => normalizeLabel(center.name)));
  const groups = new Map<string, { spellings: Map<string, number>; count: number }>();
  for (const row of rows) {
    for (const spelling of splitCenterLabels(row.centerName)) {
      const key = normalizeLabel(spelling);
      const group = groups.get(key) ?? { spellings: new Map(), count: 0 };
      group.spellings.set(spelling, (group.spellings.get(spelling) ?? 0) + 1);
      group.count += 1;
      groups.set(key, group);
    }
  }
  return [...groups.entries()]
    .map(([key, group]) => ({
      name: [...group.spellings.entries()].sort((a, b) => b[1] - a[1])[0][0],
      count: group.count,
      known: known.has(key),
    }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}
