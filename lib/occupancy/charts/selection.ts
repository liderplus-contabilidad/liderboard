/**
 * The ONE translation from what the filter bar holds into what the engine is asked. A query assembled
 * inline is a query nobody can test, and two cards assembling one each would drift.
 */
import { colorForEntity } from "@/lib/charts/palette";
import type { OccupancyDataset } from "../types";
import {
  occupancySeriesId,
  type OccupancyQuery,
  type OccupancySeriesKey,
} from "../analytics/types";
import { toPeriod, type OccupancyFilters } from "../filters";

/** What the workspace offers, in the order the selectors show it. */
export interface SelectionUniverse {
  centerIds: string[];
  years: number[];
  /** Where an empty selection lands: the sucursal the module is already showing. */
  fallback?: { centerId: string };
}

export function selectionUniverse(
  datasets: readonly OccupancyDataset[],
  fallback?: { centerId: string },
): SelectionUniverse {
  const centerIds: string[] = [];
  for (const dataset of datasets) {
    if (!centerIds.includes(dataset.centerId)) {
      centerIds.push(dataset.centerId);
    }
  }
  const years = [...new Set(datasets.map((d) => d.year))].sort((a, b) => a - b);
  return { centerIds, years, ...(fallback ? { fallback } : {}) };
}

/**
 * Marks narrow; an empty list means "every sucursal available" — except when NOTHING is marked, where
 * the tab falls back to the one Datos already has open rather than to all of them at once.
 *
 * The period needs no fallback: it always holds a span or a set of dates, and `sanitizeFilters` has
 * already resolved its year against the workspace.
 */
export function toOccupancyQuery(
  filters: OccupancyFilters,
  universe: SelectionUniverse,
): OccupancyQuery {
  const centerIds =
    filters.centerIds.length > 0
      ? filters.centerIds
      : universe.fallback
        ? [universe.fallback.centerId]
        : universe.centerIds;

  return {
    metric: filters.metric,
    centerIds,
    period: toPeriod(filters),
    scope: filters.scope,
  };
}

/**
 * A series takes its color from its place HERE, not from its index in the result, so filtering one out
 * leaves the rest painted exactly as they were. A series is a sucursal, so this universe is too.
 */
export function colorUniverse(datasets: readonly OccupancyDataset[]): string[] {
  const ids: string[] = [];
  for (const dataset of datasets) {
    if (!ids.includes(dataset.centerId)) {
      ids.push(dataset.centerId);
    }
  }
  return ids;
}

export function colorResolver(order: readonly string[]): (key: OccupancySeriesKey) => string {
  return (key) => colorForEntity(occupancySeriesId(key), order);
}
