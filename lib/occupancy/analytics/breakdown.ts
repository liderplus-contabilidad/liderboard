/**
 * The aggregations that are not a time series. All three read the SAME query the main card does,
 * so «marzo de Cultura Manor» means the same thing in every corner of the tab.
 */
import { MONTHS_SHORT_ES } from "@/lib/date";
import { ROOM_ROW_IDS } from "../derive";
import type { OccupancyDataset, OccupancyMonth } from "../types";
import { metricSpec, type MetricUnit, type OccupancyQuery, type OccupancySeriesKey } from "./types";

const ROOM_PAX = { simples: 1, dobles: 2, triples: 3 } as const;

/** Lunes-first, the way a hotel reads its week. `Date.getDay()` is Sunday-first. */
export const WEEKDAYS_ES = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

function monthHasData(month: OccupancyMonth | undefined): month is OccupancyMonth {
  if (!month) {
    return false;
  }
  const { available, revenue, sold } = month.inputs;
  return month.fromFile || [available, revenue, sold].some((s) => s.some((v) => v !== 0));
}

/** The year is added only when more than one is on screen, and every card names through here. */
export function labelFor(
  datasets: readonly OccupancyDataset[],
): (dataset: OccupancyDataset) => string {
  const multiYear = new Set(datasets.map((d) => d.year)).size > 1;
  return (dataset) => (multiYear ? `${dataset.centerName} · ${dataset.year}` : dataset.centerName);
}

/** The datasets the query selects, in the order it names them. */
export function scopedDatasets(
  datasets: readonly OccupancyDataset[],
  query: OccupancyQuery,
): OccupancyDataset[] {
  const found: OccupancyDataset[] = [];
  for (const centerId of query.centerIds) {
    for (const year of query.years) {
      const match = datasets.find((d) => d.centerId === centerId && d.year === year);
      if (match) {
        found.push(match);
      }
    }
  }
  return found;
}

/** The months of a dataset the query covers, skipping the ones with no data at all. */
function scopedMonths(dataset: OccupancyDataset, query: OccupancyQuery): OccupancyMonth[] {
  const wanted = query.months.length > 0 ? new Set(query.months) : null;
  return dataset.months.filter(
    (month) => (!wanted || wanted.has(month.index)) && monthHasData(month),
  );
}

/** The days of a month the query covers: all of them, or only the marked ones. */
function scopedDays(month: OccupancyMonth, query: OccupancyQuery): number[] {
  if (query.days.length === 0) {
    return Array.from({ length: month.days }, (_, day) => day);
  }
  return [...new Set(query.days)]
    .filter((day) => day >= 0 && day < month.days)
    .sort((a, b) => a - b);
}

function sumDays(values: number[] | undefined, days: readonly number[]): number {
  let total = 0;
  for (const day of days) {
    total += values?.[day] ?? 0;
  }
  return total;
}

function ratio(numerator: number, denominator: number): number | null {
  return denominator === 0 ? null : numerator / denominator;
}

export interface Kpi {
  id: string;
  label: string;
  value: number | null;
  unit: MetricUnit;
}

/** A single group is the "no comparison" case, not a special one. */
export interface KpiGroup {
  key: OccupancySeriesKey;
  label: string;
  kpis: Kpi[];
}

/**
 * ONE GROUP PER CENTER-YEAR: marking two years is asking to compare them, and a blended figure
 * answers a question nobody asked. Inside a group they are ratios of the SUMS, the same
 * definition the grid's own totals use, so the tab and the table never disagree.
 */
export function occupancyKpis(
  datasets: readonly OccupancyDataset[],
  query: OccupancyQuery,
): KpiGroup[] {
  const scoped = scopedDatasets(datasets, query);
  const label = labelFor(scoped);
  return scoped.map((dataset) => {
    let revenue = 0;
    let sold = 0;
    let available = 0;
    for (const month of scopedMonths(dataset, query)) {
      const days = scopedDays(month, query);
      revenue += sumDays(month.inputs.revenue, days);
      sold += sumDays(month.inputs.sold, days);
      available += sumDays(month.inputs.available, days);
    }
    return {
      key: { centerId: dataset.centerId, year: dataset.year },
      label: label(dataset),
      kpis: [
        {
          id: "occupancy",
          label: "Ocupación media",
          value: ratio(sold, available),
          unit: "percent" as const,
        },
        { id: "adr", label: "ADR", value: ratio(revenue, sold), unit: "currency" as const },
        {
          id: "revpar",
          label: "RevPAR",
          value: ratio(revenue, available),
          unit: "currency" as const,
        },
        {
          id: "revenue",
          label: "Ingresos habitaciones",
          value: available === 0 && revenue === 0 ? null : revenue,
          unit: "currency" as const,
        },
      ],
    };
  });
}

export interface ChannelEntry {
  id: string;
  name: string;
  /** Across every marked center-year — what orders the chart's rows. */
  total: number;
}

export interface ChannelBreakdown {
  /** The channels to draw, largest total first. */
  channels: ChannelEntry[];
  /** One row per center-year; `nights` is aligned with `channels`. */
  series: { key: OccupancySeriesKey; label: string; nights: number[] }[];
  total: number;
}

/**
 * Channels are unioned by id — one Booking row, not one per center — but each center-year keeps
 * its OWN nights inside that row. The order is the combined total, so both series read against
 * the same ranking.
 */
export function channelTotals(
  datasets: readonly OccupancyDataset[],
  query: OccupancyQuery,
): ChannelBreakdown {
  const scoped = scopedDatasets(datasets, query);
  const label = labelFor(scoped);
  const names = new Map<string, string>();
  const perDataset = scoped.map((dataset) => {
    for (const channel of dataset.channels) {
      names.set(channel.id, names.get(channel.id) ?? channel.name);
    }
    const nights = new Map<string, number>();
    for (const month of scopedMonths(dataset, query)) {
      const days = scopedDays(month, query);
      for (const [id, series] of Object.entries(month.inputs.channels)) {
        nights.set(id, (nights.get(id) ?? 0) + sumDays(series, days));
      }
    }
    return { dataset, nights };
  });

  const totals = new Map<string, number>();
  for (const { nights } of perDataset) {
    for (const [id, value] of nights) {
      totals.set(id, (totals.get(id) ?? 0) + value);
    }
  }

  const channels = [...totals.entries()]
    .map(([id, total]) => ({ id, name: names.get(id) ?? id, total }))
    .filter((entry) => entry.total > 0)
    .sort((a, b) => b.total - a.total);

  return {
    channels,
    series: perDataset.map(({ dataset, nights }) => ({
      key: { centerId: dataset.centerId, year: dataset.year },
      label: label(dataset),
      nights: channels.map((channel) => nights.get(channel.id) ?? 0),
    })),
    total: channels.reduce((all, entry) => all + entry.total, 0),
  };
}

export interface WeekdayBreakdown {
  labels: string[];
  /** One row per center-year; `values` has seven entries, Monday first. */
  series: { key: OccupancySeriesKey; label: string; values: (number | null)[] }[];
}

/**
 * ONE ROW PER CENTER-YEAR. A ratio stays a ratio of sums, so «los domingos llenan al 60%» is a
 * real 60%, not an average of daily percentages.
 */
export function weekdayRhythm(
  datasets: readonly OccupancyDataset[],
  query: OccupancyQuery,
): WeekdayBreakdown {
  const metric = metricSpec(query.metric);
  const scoped = scopedDatasets(datasets, query);
  const label = labelFor(scoped);

  const series = scoped.map((dataset) => {
    const numerator = new Array<number>(7).fill(0);
    const denominator = new Array<number>(7).fill(0);
    const seen = new Array<boolean>(7).fill(false);

    for (const month of scopedMonths(dataset, query)) {
      for (const day of scopedDays(month, query)) {
        // getDay() is Sunday-first; the hotel's week starts on Monday.
        const slot = (new Date(dataset.year, month.index, day + 1).getDay() + 6) % 7;
        seen[slot] = true;
        const revenue = month.inputs.revenue[day] ?? 0;
        const sold = month.inputs.sold[day] ?? 0;
        const available = month.inputs.available[day] ?? 0;
        const pax =
          month.inputs.pax[day] ??
          ROOM_ROW_IDS.reduce(
            (guests, id) => guests + (month.inputs.rooms[id]?.[day] ?? 0) * ROOM_PAX[id],
            0,
          );
        const [num, den] =
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
        numerator[slot] += num;
        denominator[slot] += den;
      }
    }

    return {
      key: { centerId: dataset.centerId, year: dataset.year },
      label: label(dataset),
      values: numerator.map((value, slot) =>
        !seen[slot] || denominator[slot] === 0 ? null : value / denominator[slot],
      ),
    };
  });

  return { labels: WEEKDAYS_ES, series };
}

/** Label for a day the panel opens on, e.g. "14 mar 2026". */
export function dayLabel(year: number, monthIndex: number, day: number): string {
  return `${day + 1} ${MONTHS_SHORT_ES[monthIndex].toLowerCase()} ${year}`;
}

export interface DayDetail {
  label: string;
  indicators: { id: string; label: string; value: number | null; unit: MetricUnit }[];
  /** One day of ONE center-year: nothing to compare, so nights stand alone. */
  channels: { id: string; name: string; nights: number }[];
}

/** Everything one day says about itself — what the heatmap opens when a cell is clicked. */
export function dayDetail(
  dataset: OccupancyDataset,
  monthIndex: number,
  day: number,
): DayDetail | null {
  const month = dataset.months[monthIndex];
  if (!month || day < 0 || day >= month.days) {
    return null;
  }
  const revenue = month.inputs.revenue[day] ?? 0;
  const sold = month.inputs.sold[day] ?? 0;
  const available = month.inputs.available[day] ?? 0;
  const complimentary = month.inputs.complimentary[day] ?? 0;
  const pax =
    month.inputs.pax[day] ??
    ROOM_ROW_IDS.reduce(
      (guests, id) => guests + (month.inputs.rooms[id]?.[day] ?? 0) * ROOM_PAX[id],
      0,
    );

  return {
    label: dayLabel(dataset.year, monthIndex, day),
    indicators: [
      { id: "occupancy", label: "Ocupación", value: ratio(sold, available), unit: "percent" },
      { id: "adr", label: "ADR", value: ratio(revenue, sold), unit: "currency" },
      { id: "revpar", label: "RevPAR", value: ratio(revenue, available), unit: "currency" },
      { id: "revenue", label: "Ingresos", value: revenue, unit: "currency" },
      { id: "sold", label: "Vendidas", value: sold, unit: "count" },
      { id: "complimentary", label: "Complementarias", value: complimentary, unit: "count" },
      { id: "available", label: "Disponibles", value: available, unit: "count" },
      { id: "pax", label: "PAX", value: pax, unit: "count" },
    ],
    channels: dataset.channels
      .map((channel) => ({
        id: channel.id,
        name: channel.name,
        nights: month.inputs.channels[channel.id]?.[day] ?? 0,
      }))
      .filter((entry) => entry.nights > 0)
      .sort((a, b) => b.nights - a.nights),
  };
}
