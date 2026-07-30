/**
 * The aggregations that are not a time series. Every one of them reads the SAME period cells the axis
 * does, so «marzo de Cultura Manor» means the same thing in every corner of the tab.
 *
 * A row is a SUCURSAL: the year travels inside the period, so two years of one sucursal are two
 * columns of its evolution, not two rows here.
 */
import { MONTHS_SHORT_ES } from "@/lib/date";
import { monthHasData, ROOM_ROW_IDS } from "../derive";
import type { OccupancyDataset, OccupancyMonth } from "../types";
import { periodCells } from "./scope";
import {
  metricSpec,
  type MetricUnit,
  type OccupancyQuery,
  type OccupancySeriesKey,
  type PeriodCell,
} from "./types";

const ROOM_PAX = { simples: 1, dobles: 2, triples: 3 } as const;

/** Lunes-first, the way a hotel reads its week. `Date.getDay()` is Sunday-first. */
export const WEEKDAYS_ES = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

/** The sucursales the query selects, in the order it names them. */
export function scopedCenters(
  datasets: readonly OccupancyDataset[],
  query: OccupancyQuery,
): { centerId: string; label: string }[] {
  const found: { centerId: string; label: string }[] = [];
  for (const centerId of query.centerIds) {
    const match = datasets.find((dataset) => dataset.centerId === centerId);
    if (match) {
      found.push({ centerId, label: match.centerName });
    }
  }
  return found;
}

/**
 * Walks the period cell by cell for one sucursal, handing each covered month the days the selection
 * asked for. The ONE place that resolves «which dataset holds this cell» — everything else just adds.
 */
function eachCoveredCell(
  datasets: readonly OccupancyDataset[],
  centerId: string,
  cells: readonly PeriodCell[],
  visit: (month: OccupancyMonth, days: number[], cell: PeriodCell) => void,
): void {
  for (const cell of cells) {
    const dataset = datasets.find((d) => d.centerId === centerId && d.year === cell.year);
    const month = dataset?.months[cell.monthIndex];
    if (!monthHasData(month)) {
      continue;
    }
    const days = cell.days.filter((day) => day < month.days);
    if (days.length > 0) {
      visit(month, days, cell);
    }
  }
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

/** The four figures the accountant's own reporte carries. `null` is "no data", never zero. */
export interface MonthlyFigures {
  /** "Venta en $": ingresos en habitaciones. */
  revenue: number | null;
  /** A fraction, not points: 0.51 is 51 %. */
  occupancy: number | null;
  /** "Tarifa Prom": ADR. */
  adr: number | null;
  revpar: number | null;
}

export interface ReportTotal {
  key: OccupancySeriesKey;
  label: string;
  figures: MonthlyFigures;
}

const EMPTY_FIGURES: MonthlyFigures = { revenue: null, occupancy: null, adr: null, revpar: null };

function figuresOf(revenue: number, sold: number, available: number): MonthlyFigures {
  return {
    revenue,
    occupancy: ratio(sold, available),
    adr: ratio(revenue, sold),
    revpar: ratio(revenue, available),
  };
}

/**
 * The CLOSE of the period in the accountant's four figures, one row per sucursal — what the tiles at
 * the top of Gráficos report.
 *
 * Ratios of the SUMS of the whole period, so it is never the average of its months, and a month with
 * no sales contributes nothing at all: its capacity must stay out of the denominator or a year seven
 * months in would report the occupancy of twelve.
 */
export function reportTotals(
  datasets: readonly OccupancyDataset[],
  query: OccupancyQuery,
): ReportTotal[] {
  const cells = periodCells(query.period);
  return scopedCenters(datasets, query).map(({ centerId, label }) => {
    let revenue = 0;
    let sold = 0;
    let available = 0;
    let covered = false;
    eachCoveredCell(datasets, centerId, cells, (month, days) => {
      covered = true;
      revenue += sumDays(month.inputs.revenue, days);
      sold += sumDays(month.inputs.sold, days);
      available += sumDays(month.inputs.available, days);
    });
    return {
      key: { centerId },
      label,
      // Nothing covered closes EMPTY rather than at 0,00: the sum of no months is not zero dollars of
      // sales, it is a question nobody has answered yet.
      figures: covered ? figuresOf(revenue, sold, available) : EMPTY_FIGURES,
    };
  });
}

export interface ChannelEntry {
  id: string;
  name: string;
  /** Across every marked sucursal — what orders the chart's rows. */
  total: number;
}

export interface ChannelBreakdown {
  /** The channels to draw, largest total first. */
  channels: ChannelEntry[];
  /** One row per sucursal; `nights` is aligned with `channels`. */
  series: { key: OccupancySeriesKey; label: string; nights: number[] }[];
  total: number;
}

/**
 * Channels are unioned by id — one Booking row, not one per sucursal — but each sucursal keeps its
 * OWN nights inside that row. The order is the combined total, so every series reads against the same
 * ranking.
 */
export function channelTotals(
  datasets: readonly OccupancyDataset[],
  query: OccupancyQuery,
): ChannelBreakdown {
  const cells = periodCells(query.period);
  const names = new Map<string, string>();
  const perCenter = scopedCenters(datasets, query).map(({ centerId, label }) => {
    for (const dataset of datasets) {
      if (dataset.centerId === centerId) {
        for (const channel of dataset.channels) {
          names.set(channel.id, names.get(channel.id) ?? channel.name);
        }
      }
    }
    const nights = new Map<string, number>();
    eachCoveredCell(datasets, centerId, cells, (month, days) => {
      for (const [id, series] of Object.entries(month.inputs.channels)) {
        nights.set(id, (nights.get(id) ?? 0) + sumDays(series, days));
      }
    });
    return { centerId, label, nights };
  });

  const totals = new Map<string, number>();
  for (const { nights } of perCenter) {
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
    series: perCenter.map(({ centerId, label, nights }) => ({
      key: { centerId },
      label,
      nights: channels.map((channel) => nights.get(channel.id) ?? 0),
    })),
    total: channels.reduce((all, entry) => all + entry.total, 0),
  };
}

export interface WeekdayBreakdown {
  labels: string[];
  /** One row per sucursal; `values` has seven entries, Monday first. */
  series: { key: OccupancySeriesKey; label: string; values: (number | null)[] }[];
}

/**
 * ONE ROW PER SUCURSAL. A ratio stays a ratio of sums, so «los domingos llenan al 60 %» is a real
 * 60 %, not an average of daily percentages.
 */
export function weekdayRhythm(
  datasets: readonly OccupancyDataset[],
  query: OccupancyQuery,
): WeekdayBreakdown {
  const metric = metricSpec(query.metric);
  const cells = periodCells(query.period);

  const series = scopedCenters(datasets, query).map(({ centerId, label }) => {
    const numerator = new Array<number>(7).fill(0);
    const denominator = new Array<number>(7).fill(0);
    const seen = new Array<boolean>(7).fill(false);

    eachCoveredCell(datasets, centerId, cells, (month, days, cell) => {
      for (const day of days) {
        // getDay() is Sunday-first; the hotel's week starts on Monday. The year is exact now, so a
        // 5 de enero lands on its real weekday in each year of the period.
        const slot = (new Date(cell.year, cell.monthIndex, day + 1).getDay() + 6) % 7;
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
    });

    return {
      key: { centerId },
      label,
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
  /** One day of ONE sucursal: nothing to compare, so nights stand alone. */
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
