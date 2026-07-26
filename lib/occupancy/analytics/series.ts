/**
 * The Ocupaciones engine: a selection of métrica × sucursales × años × alcance becomes series
 * over one shared X axis.
 *
 * Coverage is the load-bearing rule. A month the workspace never received is `null`, so a year
 * loaded only to July stops in July instead of falling to zero; but a day inside a covered
 * month that simply sold nothing is a real `0` and gets drawn.
 */
import { MONTHS_SHORT_ES } from "@/lib/date";
import { CHART_MAX_SERIES } from "@/lib/charts/palette";
import { daysInMonth, ROOM_ROW_IDS } from "../derive";
import type { OccupancyDataset, OccupancyMonth } from "../types";
import {
  metricSpec,
  type AxisPoint,
  type MetricSpec,
  type OccupancyBundle,
  type OccupancyQuery,
  type OccupancySeries,
} from "./types";

const ROOM_PAX = { simples: 1, dobles: 2, triples: 3 } as const;

/** A month with nothing in it draws no point at all — see the file header. */
function monthHasData(month: OccupancyMonth | undefined): boolean {
  if (!month) {
    return false;
  }
  if (month.fromFile) {
    return true;
  }
  const { available, revenue, sold } = month.inputs;
  return [available, revenue, sold].some((series) => series.some((value) => value !== 0));
}

function sum(values: number[] | undefined, upTo?: number): number {
  if (!values) {
    return 0;
  }
  const end = upTo ?? values.length;
  let total = 0;
  for (let i = 0; i < end && i < values.length; i++) {
    total += values[i] ?? 0;
  }
  return total;
}

/** Guests the day actually reported: a stated PAX wins over the room-type formula. */
function paxOf(month: OccupancyMonth, day: number): number {
  const fromRooms = ROOM_ROW_IDS.reduce(
    (guests, id) => guests + (month.inputs.rooms[id]?.[day] ?? 0) * ROOM_PAX[id],
    0,
  );
  return month.inputs.pax[day] ?? fromRooms;
}

/** Numerator and denominator of a metric over a month, or over one of its days. */
function amounts(metric: MetricSpec, month: OccupancyMonth, day?: number): [number, number] {
  const at = (series: number[] | undefined) =>
    day === undefined ? sum(series, month.days) : (series?.[day] ?? 0);
  const revenue = at(month.inputs.revenue);
  const sold = at(month.inputs.sold);
  const available = at(month.inputs.available);
  const pax =
    day === undefined
      ? Array.from({ length: month.days }, (_, d) => paxOf(month, d)).reduce((a, b) => a + b, 0)
      : paxOf(month, day);

  switch (metric.id) {
    case "occupancy":
      return [sold, available];
    case "adr":
      return [revenue, sold];
    case "revpar":
      return [revenue, available];
    case "revenue":
      return [revenue, 1];
    case "sold":
      return [sold, 1];
    case "pax":
      return [pax, 1];
  }
}

/** The months the axis spans, in calendar order; marking NARROWS, it never reorders. */
function monthsOf(query: OccupancyQuery): number[] {
  const marked = [...new Set(query.months)].filter((m) => m >= 0 && m < 12).sort((a, b) => a - b);
  return marked.length > 0 ? marked : Array.from({ length: 12 }, (_, m) => m);
}

/**
 * The X axis. Its daily columns are sized by the LONGEST of the compared years, so a leap
 * February still has its 29th and the years that lack it simply leave that column empty.
 */
function buildAxis(query: OccupancyQuery, years: number[]): AxisPoint[] {
  const months = monthsOf(query);
  if (query.scope === "mes") {
    return months.map((monthIndex) => ({ label: MONTHS_SHORT_ES[monthIndex], monthIndex }));
  }
  // Marked days narrow the axis the same way marked months do: «el 5» of every marked month.
  const marked = [...new Set(query.days)].filter((d) => d >= 0 && d < 31).sort((a, b) => a - b);
  const axis: AxisPoint[] = [];
  for (const monthIndex of months) {
    const length = Math.max(...years.map((year) => daysInMonth(year, monthIndex)));
    const days = marked.length > 0 ? marked : Array.from({ length }, (_, day) => day);
    for (const day of days) {
      if (day < length) {
        axis.push({
          label: `${day + 1} ${MONTHS_SHORT_ES[monthIndex].toLowerCase()}`,
          monthIndex,
          day,
        });
      }
    }
  }
  return axis;
}

export function buildOccupancySeries(
  datasets: OccupancyDataset[],
  query: OccupancyQuery,
): OccupancyBundle {
  const metric = metricSpec(query.metric);
  const years = query.years.length > 0 ? [...new Set(query.years)].sort((a, b) => a - b) : [];
  const axis = buildAxis(query, years.length > 0 ? years : [new Date().getFullYear()]);
  const warnings: string[] = [];

  // Sucursal outer, year inner: a sucursal's years sit together in the legend and in the table.
  const wanted: OccupancyDataset[] = [];
  for (const centerId of query.centerIds) {
    for (const year of years) {
      const found = datasets.find((d) => d.centerId === centerId && d.year === year);
      if (found) {
        wanted.push(found);
      }
    }
  }

  const limit = query.limit ?? CHART_MAX_SERIES;
  const truncated = Math.max(0, wanted.length - limit);
  if (truncated > 0) {
    warnings.push(
      `La selección produce ${wanted.length} series; se dibujan ${limit} y se omiten ${truncated} series.`,
    );
  }

  // With a single year on screen the year adds nothing to every legend entry.
  const multiYear = new Set(wanted.map((d) => d.year)).size > 1;

  const series: OccupancySeries[] = wanted.slice(0, limit).map((dataset) => ({
    key: { centerId: dataset.centerId, year: dataset.year },
    label: multiYear ? `${dataset.centerName} · ${dataset.year}` : dataset.centerName,
    values: axis.map((point) => {
      const month = dataset.months[point.monthIndex];
      if (!monthHasData(month)) {
        return null;
      }
      if (point.day !== undefined && point.day >= month.days) {
        return null;
      }
      const [numerator, denominator] = amounts(metric, month, point.day);
      return denominator === 0 ? null : numerator / denominator;
    }),
  }));

  return { axis, series, metric, truncated, warnings };
}
