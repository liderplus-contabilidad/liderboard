/**
 * Deliberately NOT an ECharts chart: 372 coloured cells are 372 divs, while the renderer's
 * heatmap would pull its component and visualMap into a bundle that draws bars, lines and pies.
 *
 * One grid per sucursal-año the period touches, and ONE scale shared by all — two grids side by side
 * are only comparable if the same tone means the same figure in both.
 */
import { MONTHS_SHORT_ES } from "@/lib/date";
import { metricSpec, type MetricSpec, type OccupancyQuery } from "../analytics/types";
import { scopedCenters } from "../analytics/breakdown";
import { periodCells } from "../analytics/scope";
import { monthHasData, ROOM_ROW_IDS } from "../derive";
import type { OccupancyDataset, OccupancyMonth } from "../types";

/** Every grid is 31 columns wide so the months line up under one header. */
export const HEATMAP_DAYS = 31;

/** How many grids a card draws before it says how many it left out. */
export const HEATMAP_MAX_GRIDS = 4;

const ROOM_PAX = { simples: 1, dobles: 2, triples: 3 } as const;

export interface HeatCell {
  /** 0-based; `null` is a day outside the period, or one the month has no data for. */
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
  const cells = periodCells(query.period);
  const years = [...new Set(cells.map((cell) => cell.year))].sort((a, b) => a - b);

  // A grid is a sucursal-año, and only for the years the period actually touches: the year is part of
  // the period now, so a span inside 2026 draws no grid for 2025.
  const wanted: { centerId: string; label: string; year: number }[] = [];
  for (const center of scopedCenters(datasets, query)) {
    for (const year of years) {
      if (datasets.some((d) => d.centerId === center.centerId && d.year === year)) {
        wanted.push({ ...center, year });
      }
    }
  }
  const truncated = Math.max(0, wanted.length - maxGrids);

  const grids: HeatGrid[] = wanted.slice(0, maxGrids).map(({ centerId, label, year }) => {
    const dataset = datasets.find((d) => d.centerId === centerId && d.year === year);
    const rows: HeatRow[] = cells
      .filter((cell) => cell.year === year)
      .map((cell) => {
        const month = dataset?.months[cell.monthIndex];
        // Only the days inside the period are tinted: a day outside it is not a day that sold zero.
        const inScope = new Set(cell.days);
        return {
          monthIndex: cell.monthIndex,
          label: MONTHS_SHORT_ES[cell.monthIndex],
          cells: Array.from({ length: HEATMAP_DAYS }, (_, day) => ({
            day,
            value:
              monthHasData(month) && inScope.has(day) && day < month.days
                ? dayValue(metric, month, day)
                : null,
          })),
        };
      });
    return { id: `${centerId}|${year}`, label: `${label} · ${year}`, centerId, year, rows };
  });

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
