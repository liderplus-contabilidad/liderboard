/**
 * The single selection of Ocupaciones: which métrica, sucursales, años and periodos are marked,
 * and whether the axis reads by month or by day.
 *
 * As in PyG there is no comparison axis to declare — it falls out of whichever lists end up
 * populated. Unlike PyG the métrica is single: the metrics do not share a unit, and a card with
 * two units would need a second Y axis.
 */
import { MONTHS_FULL_ES, MONTHS_SHORT_ES } from "@/lib/date";
import { DEFAULT_METRIC, metricSpec, type OccupancyMetricId, type Scope } from "./analytics/types";

export interface OccupancyFilters {
  metric: OccupancyMetricId;
  centerIds: string[];
  years: number[];
  /** Marked months, 0–11. Marking NARROWS the axis; it never multiplies the series. */
  months: number[];
  /** Marked days of the month, 0-based. Narrows the daily axis to those days. */
  days: number[];
  scope: Scope;
}

export function emptyFilters(): OccupancyFilters {
  return { metric: DEFAULT_METRIC, centerIds: [], years: [], months: [], days: [], scope: "mes" };
}

/** Toggles keeping the UNIVERSE's order, so series and colors never depend on click order. */
function toggled<T>(current: readonly T[], value: T, universe: readonly T[]): T[] {
  const picked = new Set(current);
  if (picked.has(value)) {
    picked.delete(value);
  } else {
    picked.add(value);
  }
  return universe.filter((candidate) => picked.has(candidate));
}

export function withMetric(filters: OccupancyFilters, metric: OccupancyMetricId): OccupancyFilters {
  return { ...filters, metric };
}

export function withScope(filters: OccupancyFilters, scope: Scope): OccupancyFilters {
  return { ...filters, scope };
}

export function withCenterToggled(
  filters: OccupancyFilters,
  centerId: string,
  universe: readonly string[],
): OccupancyFilters {
  return { ...filters, centerIds: toggled(filters.centerIds, centerId, universe) };
}

export function withYearToggled(
  filters: OccupancyFilters,
  year: number,
  universe: readonly number[],
): OccupancyFilters {
  return { ...filters, years: toggled(filters.years, year, universe) };
}

export function withMonthToggled(filters: OccupancyFilters, month: number): OccupancyFilters {
  const universe = Array.from({ length: 12 }, (_, m) => m);
  return { ...filters, months: toggled(filters.months, month, universe) };
}

/**
 * Marking a day also drops the axis to days: a day mark is meaningless on a monthly axis, and
 * silently keeping the month view would make the click look broken.
 */
export function withDayToggled(filters: OccupancyFilters, day: number): OccupancyFilters {
  const universe = Array.from({ length: 31 }, (_, d) => d);
  return { ...filters, days: toggled(filters.days, day, universe), scope: "dia" };
}

export function withDaysCleared(filters: OccupancyFilters): OccupancyFilters {
  return { ...filters, days: [] };
}

export function withCentersCleared(filters: OccupancyFilters): OccupancyFilters {
  return { ...filters, centerIds: [] };
}

export function withYearsCleared(filters: OccupancyFilters): OccupancyFilters {
  return { ...filters, years: [] };
}

/** Clearing the months clears the days with them: a day belongs to the month it narrows. */
export function withMonthsCleared(filters: OccupancyFilters): OccupancyFilters {
  return { ...filters, months: [], days: [] };
}

/** "Quitar todo": the métrica and the axis survive — they are not marks, they are the lens. */
export function clearMarks(filters: OccupancyFilters): OccupancyFilters {
  return { ...filters, centerIds: [], years: [], months: [], days: [] };
}

/**
 * Drill-down: clicking a month's bar narrows the tab to that month and drops the axis to days.
 * It writes into the same bar the user can see, so undoing it is removing the chip.
 */
export function withDrillIntoMonth(filters: OccupancyFilters, month: number): OccupancyFilters {
  // The days of the month you were in say nothing about the one you just opened.
  return { ...filters, months: [month], days: [], scope: "dia" };
}

export interface FilterUniverse {
  centerIds: readonly string[];
  years: readonly number[];
}

/** Prunes what stopped existing, read at render time so the marks are never a render behind. */
export function sanitizeFilters(
  filters: OccupancyFilters,
  universe: FilterUniverse,
): OccupancyFilters {
  const centerIds = new Set(universe.centerIds);
  const years = new Set(universe.years);
  return {
    ...filters,
    centerIds: filters.centerIds.filter((id) => centerIds.has(id)),
    years: filters.years.filter((year) => years.has(year)),
    months: filters.months.filter((month) => month >= 0 && month < 12),
    days: filters.days.filter((day) => day >= 0 && day < 31),
  };
}

/** Whether anything is marked at all — what the chip strip and the fallback both ask. */
export function hasMarks(filters: OccupancyFilters): boolean {
  return (
    filters.centerIds.length > 0 ||
    filters.years.length > 0 ||
    filters.months.length > 0 ||
    filters.days.length > 0
  );
}

/**
 * The marked period as a person would say it: «5 de enero», not «Periodo · 1 · 1 día». A count
 * tells the reader how many boxes are ticked; what they need is which period they are looking at.
 */
export function periodLabel(months: readonly number[], days: readonly number[]): string {
  if (months.length === 0) {
    return "Todo el año";
  }
  const short = months.map((month) => MONTHS_SHORT_ES[month]).join(" · ");
  if (days.length === 0) {
    return months.length === 1 ? MONTHS_FULL_ES[months[0]] : short;
  }
  const list = days.map((day) => day + 1).join(", ");
  if (months.length === 1) {
    return days.length === 1
      ? `${list} de ${MONTHS_FULL_ES[months[0]].toLowerCase()}`
      : `días ${list} de ${MONTHS_FULL_ES[months[0]].toLowerCase()}`;
  }
  return `${days.length === 1 ? "día" : "días"} ${list} de ${short}`;
}

/**
 * The whole selection as one sentence, for the line that sits under the filter bar. Reading the
 * marks off four separate controls is what makes a comparison like «el 5 de enero de 2025 contra
 * el de 2026» hard to be sure of before looking at the chart.
 */
export function describeSelection(
  filters: OccupancyFilters,
  centerNames: readonly string[],
): string {
  const parts = [metricSpec(filters.metric).label, periodLabel(filters.months, filters.days)];
  parts.push(filters.years.length > 0 ? filters.years.join(" y ") : "todos los años");
  parts.push(centerNames.length > 0 ? centerNames.join(" y ") : "todas las sucursales");
  return parts.join(" · ");
}
