/**
 * A selection of métrica × centers × years × scope becomes series over one shared X axis.
 *
 * Coverage is the load-bearing rule: a month the workspace never received is `null`, so a year
 * loaded only to July stops there; a day inside a covered month that sold nothing is a real `0`.
 */
import { MONTHS_SHORT_ES } from "@/lib/date";
import { CHART_MAX_SERIES } from "@/lib/charts/palette";
import { bucketLabel, bucketMonths } from "@/lib/period";
import { daysInMonth, ROOM_ROW_IDS } from "../derive";
import type { OccupancyDataset, OccupancyMonth } from "../types";
import {
  metricSpec,
  type AxisPoint,
  type MetricSpec,
  type OccupancyBundle,
  type OccupancyQuery,
  type OccupancySeries,
  type PointFacts,
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

/** The raw inputs of a month, or of one of its days — what every metric is then built from. */
function rawInputs(
  month: OccupancyMonth,
  day?: number,
): Pick<PointFacts, "revenue" | "sold" | "available" | "pax"> {
  const at = (series: number[] | undefined) =>
    day === undefined ? sum(series, month.days) : (series?.[day] ?? 0);
  return {
    revenue: at(month.inputs.revenue),
    sold: at(month.inputs.sold),
    available: at(month.inputs.available),
    pax:
      day === undefined
        ? Array.from({ length: month.days }, (_, d) => paxOf(month, d)).reduce((a, b) => a + b, 0)
        : paxOf(month, day),
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

/** The months the axis spans, in calendar order; marking NARROWS, it never reorders. */
function monthsOf(query: OccupancyQuery): number[] {
  const marked = [...new Set(query.months)].filter((m) => m >= 0 && m < 12).sort((a, b) => a - b);
  return marked.length > 0 ? marked : Array.from({ length: 12 }, (_, m) => m);
}

/**
 * Daily columns are sized by the LONGEST of the compared years, so a leap February keeps its 29th
 * and the years that lack it leave that column empty. Above the month the columns are periods; a
 * period holding SOME of its months is still drawn, labelled by those months rather than "T1".
 */
function buildAxis(query: OccupancyQuery, years: number[]): AxisPoint[] {
  const months = monthsOf(query);
  const scope = query.scope;
  if (scope === "mensual") {
    return months.map((monthIndex) => ({
      label: MONTHS_SHORT_ES[monthIndex],
      monthIndexes: [monthIndex],
    }));
  }
  if (scope !== "dia") {
    return bucketMonths(scope, months).map((bucket) => ({
      label: bucketLabel(scope, bucket),
      monthIndexes: bucket.months,
    }));
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
          monthIndexes: [monthIndex],
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

  // Center outer, year inner: a center's years sit together in the legend and the table.
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

  /**
   * Adds up the RAW INPUTS of the months covered and only THEN applies the metric — the ratio of
   * the sums. Covered when at least ONE of its months is, so a T1 loaded only to enero is drawn.
   */
  const factsAt = (dataset: OccupancyDataset, point: AxisPoint): PointFacts | null => {
    const totals = { revenue: 0, sold: 0, available: 0, pax: 0 };
    let covered = false;
    for (const monthIndex of point.monthIndexes) {
      const month = dataset.months[monthIndex];
      if (!monthHasData(month)) {
        continue;
      }
      if (point.day !== undefined && point.day >= month.days) {
        continue;
      }
      covered = true;
      const inputs = rawInputs(month, point.day);
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

  const series: OccupancySeries[] = wanted.slice(0, limit).map((dataset) => {
    const facts = axis.map((point) => factsAt(dataset, point));
    return {
      key: { centerId: dataset.centerId, year: dataset.year },
      label: multiYear ? `${dataset.centerName} · ${dataset.year}` : dataset.centerName,
      values: facts.map((fact) =>
        fact === null || fact.denominator === 0 ? null : fact.numerator / fact.denominator,
      ),
      facts,
    };
  });

  return { axis, series, metric, truncated, warnings };
}
