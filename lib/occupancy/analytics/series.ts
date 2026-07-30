/**
 * A selection of métrica × sucursales × periodo becomes series over one shared X axis.
 *
 * The YEAR travels in the period, so a series is a SUCURSAL and every column knows which year it
 * belongs to. That is what lets one span run from marzo de 2025 to abril de 2026 as a single
 * evolution, and two dates of different years sit side by side as a comparison.
 *
 * Coverage is the load-bearing rule: a month the workspace never received is `null`, so a year
 * loaded only to July stops there; a day inside a covered month that sold nothing is a real `0`.
 */
import { MONTHS_SHORT_ES } from "@/lib/date";
import { CHART_MAX_SERIES } from "@/lib/charts/palette";
import { periodLabels, periodOfMonth } from "@/lib/period";
import { monthHasData, ROOM_ROW_IDS } from "../derive";
import type { OccupancyDataset, OccupancyMonth } from "../types";
import { periodCells, yearsInPeriod } from "./scope";
import {
  metricSpec,
  type AxisPoint,
  type MetricSpec,
  type OccupancyBundle,
  type OccupancyMetricId,
  type OccupancyQuery,
  type OccupancySeries,
  type PeriodCell,
  type PointFacts,
} from "./types";

const ROOM_PAX = { simples: 1, dobles: 2, triples: 3 } as const;

/** Guests the day actually reported: a stated PAX wins over the room-type formula. */
function paxOf(month: OccupancyMonth, day: number): number {
  const fromRooms = ROOM_ROW_IDS.reduce(
    (guests, id) => guests + (month.inputs.rooms[id]?.[day] ?? 0) * ROOM_PAX[id],
    0,
  );
  return month.inputs.pax[day] ?? fromRooms;
}

/**
 * The raw inputs of the days GIVEN, which is what makes a partial month partial: a span that starts
 * on the 20th adds twelve days of marzo, not marzo.
 */
function rawInputs(
  month: OccupancyMonth,
  days: readonly number[],
): Pick<PointFacts, "revenue" | "sold" | "available" | "pax"> {
  const at = (series: number[] | undefined) =>
    days.reduce((total, day) => total + (series?.[day] ?? 0), 0);
  return {
    revenue: at(month.inputs.revenue),
    sold: at(month.inputs.sold),
    available: at(month.inputs.available),
    pax: days.reduce((total, day) => total + paxOf(month, day), 0),
  };
}

/**
 * A "total" metric divides by a literal 1, read off the summed inputs ONCE — summing the 1s
 * instead would turn a period into the average of its months.
 */
function amounts(
  metric: MetricSpec,
  inputs: Pick<PointFacts, "revenue" | "sold" | "available" | "pax">,
): [number, number] {
  switch (metric.id) {
    case "occupancy":
      return [inputs.sold, inputs.available];
    case "adr":
      return [inputs.revenue, inputs.sold];
    case "revpar":
      return [inputs.revenue, inputs.available];
    case "revenue":
      return [inputs.revenue, 1];
    case "sold":
      return [inputs.sold, 1];
    case "pax":
      return [inputs.pax, 1];
  }
}

/** Two digits tell 2025 from 2026, and a column header has no room for four. */
function shortYear(year: number): string {
  return String(year).slice(-2);
}

/** Groups keeping the order the cells arrived in, which is already calendar order. */
function groupCells(
  cells: readonly PeriodCell[],
  keyOf: (cell: PeriodCell) => string,
): { key: string; group: PeriodCell[] }[] {
  const order: string[] = [];
  const byKey = new Map<string, PeriodCell[]>();
  for (const cell of cells) {
    const key = keyOf(cell);
    if (!byKey.has(key)) {
      byKey.set(key, []);
      order.push(key);
    }
    byKey.get(key)?.push(cell);
  }
  return order.map((key) => ({ key, group: byKey.get(key) ?? [] }));
}

/**
 * Columns are built from the period's OWN cells, so the axis can never cover days the selection did
 * not ask for. The year appears in a label only when the period spans more than one — inside a single
 * year it would repeat itself twelve times. «Días específicos» is always daily: each date is a column.
 */
function buildAxis(query: OccupancyQuery): AxisPoint[] {
  const cells = periodCells(query.period);
  const multiYear = yearsInPeriod(query.period).length > 1;
  const yearTag = (value: number) => (multiYear ? ` ${shortYear(value)}` : "");

  // Picked periods are ONE column each, whatever «Ver por» says: a pick is the thing being compared, so
  // a month picked on its own is one bar and not thirty. Its label says which granularity it is.
  if (query.period.mode === "comparar") {
    return cells.map((cell) => ({
      label:
        cell.days.length === 1
          ? `${cell.days[0] + 1} ${MONTHS_SHORT_ES[cell.monthIndex].toLowerCase()}${yearTag(cell.year)}`
          : `${MONTHS_SHORT_ES[cell.monthIndex]}${yearTag(cell.year)}`,
      cells: [cell],
    }));
  }

  const scope = query.scope;
  if (scope === "dia") {
    return cells.flatMap((cell) =>
      cell.days.map((day) => ({
        label: `${day + 1} ${MONTHS_SHORT_ES[cell.monthIndex].toLowerCase()}${yearTag(cell.year)}`,
        cells: [{ ...cell, days: [day] }],
      })),
    );
  }
  if (scope === "mensual") {
    return cells.map((cell) => ({
      label: `${MONTHS_SHORT_ES[cell.monthIndex]}${yearTag(cell.year)}`,
      cells: [cell],
    }));
  }
  if (scope === "anual") {
    // The year IS the label here, so it is never a tag.
    return groupCells(cells, (cell) => String(cell.year)).map(({ key, group }) => ({
      label: key,
      cells: group,
    }));
  }
  // A quarter or a semester OF ONE YEAR: two years' T1 are two columns, never one.
  return groupCells(cells, (cell) => `${cell.year}|${periodOfMonth(scope, cell.monthIndex)}`).map(
    ({ key, group }) => ({
      label: `${periodLabels(scope)[Number(key.split("|")[1])]}${yearTag(group[0].year)}`,
      cells: group,
    }),
  );
}

export function buildOccupancySeries(
  datasets: OccupancyDataset[],
  query: OccupancyQuery,
): OccupancyBundle {
  const metric = metricSpec(query.metric);
  const axis = buildAxis(query);
  const warnings: string[] = [];

  // A series is a sucursal, in the order the query names them.
  const wanted: { centerId: string; label: string }[] = [];
  for (const centerId of query.centerIds) {
    const found = datasets.find((dataset) => dataset.centerId === centerId);
    if (found) {
      wanted.push({ centerId, label: found.centerName });
    }
  }

  const limit = query.limit ?? CHART_MAX_SERIES;
  const truncated = Math.max(0, wanted.length - limit);
  if (truncated > 0) {
    warnings.push(
      `La selección produce ${wanted.length} series; se dibujan ${limit} y se omiten ${truncated} series.`,
    );
  }

  /**
   * Adds up the RAW INPUTS of the days its column covers and only THEN applies the metric — the ratio
   * of the sums. Covered when at least ONE of its cells is, so a quarter loaded only to enero is
   * still drawn.
   */
  const factsAt = (centerId: string, point: AxisPoint): PointFacts | null => {
    const totals = { revenue: 0, sold: 0, available: 0, pax: 0 };
    let covered = false;
    for (const cell of point.cells) {
      const dataset = datasets.find((d) => d.centerId === centerId && d.year === cell.year);
      const month = dataset?.months[cell.monthIndex];
      if (!monthHasData(month)) {
        continue;
      }
      const days = cell.days.filter((day) => day < month.days);
      if (days.length === 0) {
        continue;
      }
      covered = true;
      const inputs = rawInputs(month, days);
      totals.revenue += inputs.revenue;
      totals.sold += inputs.sold;
      totals.available += inputs.available;
      totals.pax += inputs.pax;
    }
    if (!covered) {
      return null;
    }
    const [numerator, denominator] = amounts(metric, totals);
    return { ...totals, numerator, denominator };
  };

  const series: OccupancySeries[] = wanted.slice(0, limit).map(({ centerId, label }) => {
    const facts = axis.map((point) => factsAt(centerId, point));
    return {
      key: { centerId },
      label,
      values: facts.map((fact) =>
        fact === null || fact.denominator === 0 ? null : fact.numerator / fact.denominator,
      ),
      facts,
    };
  });

  return { axis, series, metric, truncated, warnings };
}

export interface OccupancyEvolution {
  /** Shared by every panel — same query, so column N means the same period in all of them. */
  axis: AxisPoint[];
  /** One bundle per figure, in the order asked for. */
  panels: OccupancyBundle[];
  /** Deduped: the series cap truncates every panel identically, and says so once. */
  warnings: string[];
}

/**
 * The same selection read through several figures at once, over ONE shared axis — which is what lets
 * «Ver por» govern the four panels of the reporte with a single control.
 *
 * Each panel keeps its own scale and unit. That is the whole reason there are four of them instead of
 * one chart with four series: a percentage and a dollar amount never share an axis, and the option
 * types forbid the second `yAxis` that would take.
 *
 * `metrics` is required on purpose — the four figures are declared ONCE, next to their headings, so
 * this cannot drift from what the tiles above the panels report.
 */
export function buildOccupancyEvolution(
  datasets: OccupancyDataset[],
  query: OccupancyQuery,
  metrics: readonly OccupancyMetricId[],
): OccupancyEvolution {
  const panels = metrics.map((metric) => buildOccupancySeries(datasets, { ...query, metric }));
  return {
    axis: panels[0]?.axis ?? [],
    panels,
    warnings: [...new Set(panels.flatMap((panel) => panel.warnings))],
  };
}
