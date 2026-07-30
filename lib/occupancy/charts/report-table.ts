/**
 * The reporte as a TABLE: the axis down the rows, the four figures across the columns, one table per
 * sucursal. It is the evolution written out — which is why the tab draws no chart for it: a bar chart
 * of the same four columns would say the same thing four times and hide the exact figure.
 *
 * It transposes the SAME `OccupancyEvolution` the tiles' total is computed beside, so a cell and the
 * period's close can never disagree, and both narrow with the filter bar identically.
 */
import type { MonthlyFigures, ReportTotal } from "../analytics/breakdown";
import type { OccupancyEvolution } from "../analytics/series";
import type { OccupancySeriesKey } from "../analytics/types";
import type { MonthlyColumn } from "./option";

export interface ReportRow {
  /** The column's own label, whatever «Ver por» made it: "Ene", "T1 25", "5 ene 26". */
  label: string;
  /** false = the period had nothing loaded there; every figure is `null`. */
  covered: boolean;
  figures: MonthlyFigures;
}

export interface ReportTable {
  key: OccupancySeriesKey;
  label: string;
  rows: ReportRow[];
  /** The close of the whole period, from `reportTotals` — never the average of the rows. */
  total: MonthlyFigures;
}

const EMPTY: MonthlyFigures = { revenue: null, occupancy: null, adr: null, revpar: null };

export function buildReportTable(
  evolution: OccupancyEvolution,
  totals: readonly ReportTotal[],
  columns: readonly MonthlyColumn[],
): ReportTable[] {
  const first = evolution.panels[0];
  if (!first) {
    return [];
  }

  return first.series.map((series, seriesIndex) => {
    const rows = evolution.axis.map((point, pointIndex): ReportRow => {
      const figures = { ...EMPTY };
      let covered = false;
      columns.forEach((column, columnIndex) => {
        const value =
          evolution.panels[columnIndex]?.series[seriesIndex]?.values[pointIndex] ?? null;
        figures[column.id] = value;
        // A column is covered when the period reached it at all — read off the facts rather than the
        // value, because a real zero and «no data» both come back as a figure that looks empty.
        covered =
          covered || evolution.panels[columnIndex]?.series[seriesIndex]?.facts[pointIndex] != null;
      });
      return { label: point.label, covered, figures: covered ? figures : EMPTY };
    });

    return {
      key: series.key,
      label: series.label,
      rows,
      total: totals.find((entry) => entry.key.centerId === series.key.centerId)?.figures ?? {
        ...EMPTY,
      },
    };
  });
}
