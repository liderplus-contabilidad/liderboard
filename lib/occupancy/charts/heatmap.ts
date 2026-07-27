/**
 * Deliberately NOT an ECharts chart: 372 coloured cells are 372 divs, while the renderer's
 * heatmap would pull its component and visualMap into a bundle that draws bars, lines and pies.
 *
 * One grid per marked center-year, and ONE scale shared by all — two grids side by side are only
 * comparable if the same tone means the same figure in both.
 */
import { MONTHS_SHORT_ES } from "@/lib/date";
import { metricSpec, type MetricSpec, type OccupancyQuery } from "../analytics/types";
import { scopedDatasets } from "../analytics/breakdown";
import { ROOM_ROW_IDS } from "../derive";
import type { OccupancyDataset, OccupancyMonth } from "../types";

/** Every grid is 31 columns wide so the months line up under one header. */
export const HEATMAP_DAYS = 31;

/** How many grids a card draws before it says how many it left out. */
export const HEATMAP_MAX_GRIDS = 4;

const ROOM_PAX = { simples: 1, dobles: 2, triples: 3 } as const;

export interface HeatCell {
  /** 0-based; `null` is a day the month does not have, or has no data for. */
  day: number;
  value: number | null;
}

export interface HeatRow {
  monthIndex: number;
  label: string;
  cells: HeatCell[];
}

export interface HeatGrid {
  id: string;
  label: string;
  centerId: string;
  year: number;
  rows: HeatRow[];
}

export interface HeatmapResult {
  grids: HeatGrid[];
  /** Shared by every grid; `null` when there is nothing to scale. */
  scale: { min: number; max: number } | null;
  metric: MetricSpec;
  truncated: number;
}

function monthHasData(month: OccupancyMonth): boolean {
  const { available, revenue, sold } = month.inputs;
  return month.fromFile || [available, revenue, sold].some((s) => s.some((v) => v !== 0));
}

function dayValue(metric: MetricSpec, month: OccupancyMonth, day: number): number | null {
  const revenue = month.inputs.revenue[day] ?? 0;
  const sold = month.inputs.sold[day] ?? 0;
  const available = month.inputs.available[day] ?? 0;
  const pax =
    month.inputs.pax[day] ??
    ROOM_ROW_IDS.reduce(
      (guests, id) => guests + (month.inputs.rooms[id]?.[day] ?? 0) * ROOM_PAX[id],
      0,
    );
  const [numerator, denominator] =
    metric.id === "occupancy"
      ? [sold, available]
      : metric.id === "adr"
        ? [revenue, sold]
        : metric.id === "revpar"
          ? [revenue, available]
          : metric.id === "revenue"
            ? [revenue, 1]
            : metric.id === "sold"
              ? [sold, 1]
              : [pax, 1];
  return denominator === 0 ? null : numerator / denominator;
}

export function buildHeatmaps(
  datasets: readonly OccupancyDataset[],
  query: OccupancyQuery,
  options: { maxGrids?: number } = {},
): HeatmapResult {
  const metric = metricSpec(query.metric);
  const maxGrids = options.maxGrids ?? HEATMAP_MAX_GRIDS;
  const scoped = scopedDatasets(datasets, query);
  const truncated = Math.max(0, scoped.length - maxGrids);
  const wantedMonths = query.months.length > 0 ? new Set(query.months) : null;

  const grids: HeatGrid[] = scoped.slice(0, maxGrids).map((dataset) => ({
    id: `${dataset.centerId}|${dataset.year}`,
    label: `${dataset.centerName} · ${dataset.year}`,
    centerId: dataset.centerId,
    year: dataset.year,
    rows: dataset.months
      .filter((month) => !wantedMonths || wantedMonths.has(month.index))
      .map((month) => ({
        monthIndex: month.index,
        label: MONTHS_SHORT_ES[month.index],
        cells: Array.from({ length: HEATMAP_DAYS }, (_, day) => ({
          day,
          value: day < month.days && monthHasData(month) ? dayValue(metric, month, day) : null,
        })),
      })),
  }));

  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const grid of grids) {
    for (const row of grid.rows) {
      for (const cell of row.cells) {
        if (cell.value !== null) {
          min = Math.min(min, cell.value);
          max = Math.max(max, cell.value);
        }
      }
    }
  }

  return {
    grids,
    // From zero: starting the ramp at the lowest day would paint a 20% month "empty".
    scale: Number.isFinite(max) ? { min: metric.kind === "ratio" ? 0 : min, max } : null,
    metric,
    truncated,
  };
}
