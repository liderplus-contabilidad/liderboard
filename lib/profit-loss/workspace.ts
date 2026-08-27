/**
 * Cost-center identity helpers shared across the upload layer: the selector's dot-color
 * palette and the name → slug function `merge-month.ts` and the upload strategies use to
 * derive a stable `centerId`.
 *
 * What used to live here — grouping several uploaded files into a workspace — is retired:
 * the formats it served (the annual consolidated-by-centers file, the single-sucursal
 * statement) no longer exist under the monthly-by-centers model. Loading a workspace now goes
 * through the upload registry (`upload/`) and `merge-month.ts` instead.
 */
import type { CenterOption } from "@/lib/workspaces";
import type { ImportedComment, ParsedDataset, WorkspaceMeta } from "./types";

export type { CenterOption };

/** Center dot palette (from the design's `_ccColorMap`). */
export const CENTER_PALETTE = ["#1e3a5f", "#0e7490", "#d97706", "#16a34a", "#7c3aed", "#dc2626"];

export function slugifyCenter(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** `Sin centro de costo` is pinned last whatever year first introduced it. */
const SIN_CENTRO_ROLE = "sin-centro";

/**
 * Gives every distinct `centerId` ONE color and ONE position across the whole workspace, every
 * year included.
 *
 * Without this, the slot came from the center's position inside the file that first created it,
 * per year — and the real exports list the centers in a different order in different years
 * (2025 opens with CARTAGO, 2026 with ALBEMARLE). A center would then change color when the
 * reader changed year, which is exactly what the color exists to prevent.
 *
 * The order is «first year in which the center appears, then that year's file order», so
 * loading an older year later cannot renumber the centers the user already knows. `sin-centro`
 * is pinned at the end regardless.
 *
 * Pure: returns a new array, and only touches `order` and `centerColor`. Generic in the dataset
 * so it runs equally on what the merge just produced and on what came back out of Dexie —
 * whatever goes in comes out, `clientId` included when there is one.
 */
export function assignCenterSlots<T extends ParsedDataset>(datasets: readonly T[]): T[] {
  const firstSeen = new Map<string, { year: number; order: number }>();
  for (const dataset of [...datasets].sort(
    (a, b) => a.year - b.year || (a.order ?? 0) - (b.order ?? 0),
  )) {
    const centerId = dataset.centerId;
    if (centerId === undefined || firstSeen.has(centerId)) {
      continue;
    }
    firstSeen.set(centerId, { year: dataset.year, order: dataset.order ?? 0 });
  }

  const sinCentro = new Set(
    datasets.filter((d) => d.role === SIN_CENTRO_ROLE).map((d) => d.centerId),
  );
  const ranked = [...firstSeen.entries()]
    .sort(([idA, a], [idB, b]) => {
      const lastA = sinCentro.has(idA) ? 1 : 0;
      const lastB = sinCentro.has(idB) ? 1 : 0;
      return lastA - lastB || a.year - b.year || a.order - b.order || idA.localeCompare(idB);
    })
    .map(([centerId]) => centerId);
  const slotOf = new Map(ranked.map((centerId, slot) => [centerId, slot]));

  return datasets.map((dataset) => {
    const slot = dataset.centerId === undefined ? undefined : slotOf.get(dataset.centerId);
    if (slot === undefined) {
      return dataset;
    }
    return {
      ...dataset,
      order: slot,
      centerColor: CENTER_PALETTE[slot % CENTER_PALETTE.length],
    };
  });
}

/**
 * A workspace's centers, in the selector's order — the one `assignCenterSlots` fixes, so it does not
 * introduce a second idea of what order they go in.
 *
 * It exists because there are surfaces that need to KNOW WHICH CENTERS THERE ARE without building
 * their data: the dialog that uploads each one's logo lists them for a client that is not even open,
 * and the provider's views only exist for the one that is.
 *
 * The name is set by the MOST RECENT year that brought that center, which is the criterion the views
 * already apply: if the accountant renamed «COCINA» to «COCINA CENTRAL» in 2026, that is the live
 * name.
 */
export function listCenters(datasets: readonly ParsedDataset[]): CenterOption[] {
  const newest = new Map<string, ParsedDataset>();
  for (const dataset of datasets) {
    if (dataset.role !== "center" && dataset.role !== SIN_CENTRO_ROLE) {
      continue;
    }
    const centerId = dataset.centerId;
    if (centerId === undefined) {
      continue;
    }
    const current = newest.get(centerId);
    if (!current || dataset.year > current.year) {
      newest.set(centerId, dataset);
    }
  }
  return [...newest.entries()]
    .sort(([, a], [, b]) => (a.order ?? 0) - (b.order ?? 0))
    .map(([id, dataset]) => ({
      id,
      name: dataset.costCenterName || id,
      ...(dataset.centerColor ? { color: dataset.centerColor } : {}),
    }));
}

/**
 * What a full workspace replace (`replaceWorkspace`) writes. Single-statement and app-workbook
 * uploads both shape their payload into this before committing — a monthly batch instead goes
 * through `applyMonthSlice`, which never replaces the whole workspace.
 */
export interface BuiltWorkspace {
  mode: "single" | "multi";
  datasets: ParsedDataset[];
  commentsByDataset: { datasetId: string; comments: ImportedComment[] }[];
  meta: WorkspaceMeta;
}
