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
import type { ImportedComment, PygDataset, WorkspaceMeta } from "./types";

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

/**
 * What a full workspace replace (`replaceWorkspace`) writes. Single-statement and app-workbook
 * uploads both shape their payload into this before committing — a monthly batch instead goes
 * through `applyMonthSlice`, which never replaces the whole workspace.
 */
export interface BuiltWorkspace {
  mode: "single" | "multi";
  datasets: PygDataset[];
  commentsByDataset: { datasetId: string; comments: ImportedComment[] }[];
  meta: WorkspaceMeta;
}
