/**
 * The bridge between the workspace the user navigates and the sources the analytics engine
 * consumes. It is deliberately thin — every derivation stays in `buildAnalyticsSource` — and
 * pure, so the one decision it does make can be tested.
 *
 * That decision: **the identity of a source is the VIEW's, not the dataset's.**
 * `buildAnalyticsSource` falls back to `dataset.centerId ?? "default"`, which is right for a
 * lone dataset but not for what the user picks on screen. The Consolidado is synthetic and has
 * no center of its own; a standalone statement (`role: "single"`) carries no `centerId` at
 * all. If the engine and the selector name the same center differently, a `SeriesKey` can no
 * longer be traced back to the tab that produced it — so the two names are reconciled here,
 * once.
 *
 * The pay-off is that the Consolidado becomes an ordinary source: "Consolidado against Cultura
 * Manor" is a plain two-center query, with no special case anywhere downstream.
 */
import { buildAnalyticsSource } from "../analytics/source";
import type { AnalyticsSource } from "../analytics/types";
import type { CellEdit, PygDataset } from "../types";

/**
 * The shape a `CenterView` already has. Declared structurally so this layer stays free of
 * `components/` — the provider's view satisfies it without an adapter.
 */
export interface AnalyticsView {
  /** The selector's id: the center slug, `"consolidado"`, `"sin-centro"`, or a dataset id. */
  id: string;
  name: string;
  dataset: PygDataset;
}

/**
 * One `AnalyticsSource` per selector view, each fed ONLY the edits of its own dataset — an
 * edit on Cultura Manor must not move Centro Principal's numbers. The synthetic Consolidado
 * has no stored edits (its dataset id matches none), which is correct: `buildViews` already
 * merged every center's edits into its accounts, so filtering here is what stops them from
 * being applied twice.
 *
 * `coveredIndices` is the workspace's declared `loadedMonths` (by-centers mode) — the SAME set
 * for every view, since one file is a month and brings every center at once, Consolidado
 * included. Omitted for a single-statement workspace, whose coverage `buildAnalyticsSource`
 * still infers from values.
 */
export function sourcesFromViews(
  views: readonly AnalyticsView[],
  edits: readonly CellEdit[],
  coveredIndices?: ReadonlySet<number>,
): AnalyticsSource[] {
  return views.map((view) => {
    const own = edits.filter((edit) => edit.datasetId === view.dataset.id);
    return {
      ...buildAnalyticsSource(view.dataset, own, coveredIndices),
      centerId: view.id,
      centerName: view.name,
    };
  });
}
