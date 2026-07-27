/**
 * The ONE translation from what the filter bar marked into what the engine is asked. A query
 * assembled inline is a query nobody can test, and two cards assembling one each would drift.
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
  /** Where an empty selection lands: the center-year the module is already showing. */
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
 * Marks narrow; an empty list means "everything available" — except when NOTHING is marked, where
 * the tab falls back to the center-year Datos already has open rather than to every series.
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
 * A series takes its color from its place HERE, not from its index in the result, so filtering
 * one out leaves the rest painted exactly as they were.
 */
export function colorUniverse(datasets: readonly OccupancyDataset[]): string[] {
  return datasets.map((dataset) =>
    occupancySeriesId({ centerId: dataset.centerId, year: dataset.year }),
  );
}

export function colorResolver(order: readonly string[]): (key: OccupancySeriesKey) => string {
  return (key) => colorForEntity(occupancySeriesId(key), order);
}
