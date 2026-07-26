/**
 * The one translation from what the filter bar has marked into what the engine is asked, plus
 * the resolver that gives a series its color.
 *
 * A query assembled inline is a query nobody can test, and the moment two cards assemble one
 * each they drift — so every card in the tab goes through here.
 */
import { colorForEntity } from "@/lib/charts/palette";
import type { OccupancyDataset } from "../types";
import {
  occupancySeriesId,
  type OccupancyQuery,
  type OccupancySeriesKey,
} from "../analytics/types";
import type { OccupancyFilters } from "../filters";

/** What the workspace offers, in the order the selectors show it. */
export interface SelectionUniverse {
  centerIds: string[];
  years: number[];
  /** Where an empty selection lands: the sucursal-year the module is already showing. */
  fallback?: { centerId: string; year: number };
}

export function selectionUniverse(
  datasets: readonly OccupancyDataset[],
  fallback?: { centerId: string; year: number },
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
 * Marks narrow; an empty list means "everything available" for the sucursales and the años —
 * except when nothing at all is marked, where the tab shows the sucursal-year already open
 * instead of every series the workspace holds. A blank panel next to loaded data hands the
 * reader the job of guessing what can be asked.
 */
export function toOccupancyQuery(
  filters: OccupancyFilters,
  universe: SelectionUniverse,
): OccupancyQuery {
  const nothingMarked = filters.centerIds.length === 0 && filters.years.length === 0;
  if (nothingMarked && universe.fallback) {
    return {
      metric: filters.metric,
      centerIds: [universe.fallback.centerId],
      years: [universe.fallback.year],
      scope: filters.scope,
      months: filters.months,
      days: filters.days,
    };
  }
  return {
    metric: filters.metric,
    centerIds: filters.centerIds.length > 0 ? filters.centerIds : universe.centerIds,
    years: filters.years.length > 0 ? filters.years : universe.years,
    scope: filters.scope,
    months: filters.months,
    days: filters.days,
  };
}

/**
 * Every sucursal-year the workspace holds, in a stable order. A series takes its color from its
 * place HERE, not from its index in the result, so filtering one out leaves the rest painted
 * exactly as they were.
 */
export function colorUniverse(datasets: readonly OccupancyDataset[]): string[] {
  return datasets.map((dataset) =>
    occupancySeriesId({ centerId: dataset.centerId, year: dataset.year }),
  );
}

export function colorResolver(order: readonly string[]): (key: OccupancySeriesKey) => string {
  return (key) => colorForEntity(occupancySeriesId(key), order);
}
