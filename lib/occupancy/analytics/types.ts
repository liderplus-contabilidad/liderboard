/**
 * A series is a SUCURSAL; the period — year included — is its X axis, not its identity.
 *
 * `null` means "this period had no data" and `0` means "a real zero": a year loaded only to July
 * must leave August blank, because drawing it as 0 invents a collapse that never happened.
 *
 * The metric is SINGLE — ocupación is a %, ADR is $, PAX is a count — because two units in one
 * card would need the second `yAxis` that `ChartOption` forbids by construction.
 */
import { FREQUENCY_ORDER, type Frequency } from "@/lib/period";

export type OccupancyMetricId = "occupancy" | "adr" | "revpar" | "revenue" | "sold" | "pax";

export type MetricUnit = "percent" | "currency" | "count";

export interface MetricSpec {
  id: OccupancyMetricId;
  label: string;
  /** Second line of the selector, and the card's subtitle. */
  hint: string;
  unit: MetricUnit;
  /**
   * "ratio" aggregates as numerator ÷ denominator OF THE SUMS — the hotel definition, and the
   * only one under which ADR × Ocupación = RevPAR survives an aggregate. "total" just adds up.
   */
  kind: "ratio" | "total";
}

export const METRICS: MetricSpec[] = [
  {
    id: "occupancy",
    label: "Ocupación",
    hint: "vendidas / disponibles",
    unit: "percent",
    kind: "ratio",
  },
  { id: "adr", label: "ADR", hint: "ingresos / vendidas", unit: "currency", kind: "ratio" },
  {
    id: "revpar",
    label: "RevPAR",
    hint: "ingresos / disponibles",
    unit: "currency",
    kind: "ratio",
  },
  { id: "revenue", label: "Ingresos", hint: "en habitaciones", unit: "currency", kind: "total" },
  { id: "sold", label: "Habitaciones vendidas", hint: "y cobradas", unit: "count", kind: "total" },
  { id: "pax", label: "PAX", hint: "huéspedes", unit: "count", kind: "total" },
];

export const DEFAULT_METRIC: OccupancyMetricId = "occupancy";

export function metricSpec(id: OccupancyMetricId): MetricSpec {
  return METRICS.find((metric) => metric.id === id) ?? METRICS[0];
}

/** PyG's frequency ladder with a day step under it, so "T1" is spelled in one place. */
export type Scope = "dia" | Frequency;

/** Finest first — the order «Ver por» offers them in. */
export const SCOPE_ORDER: readonly Scope[] = ["dia", ...FREQUENCY_ORDER];

/** A series is a SUCURSAL. The year travels in the period, so it no longer identifies a series. */
export interface OccupancySeriesKey {
  centerId: string;
}

/** Stable id for React keys and color lookups. */
export function occupancySeriesId(key: OccupancySeriesKey): string {
  return key.centerId;
}

/**
 * A full calendar date. The YEAR is part of the period, not a series: «del 1 de marzo de 2025 al 20
 * de abril de 2026» is ONE continuous span, and putting two dates of different years side by side is
 * what the «días específicos» mode is for. What compares is the sucursales.
 */
export interface DateRef {
  year: number;
  /** 0–11. */
  monthIndex: number;
  /** 0-based, clipped to the month's real length. */
  day: number;
}

export interface DateRange {
  from: DateRef;
  to: DateRef;
}

/**
 * One thing picked to be compared on its own: a DAY or a whole MONTH. A month is one column too, not
 * thirty — «marzo contra julio» is two bars — and mixing the two granularities in one list is what lets
 * «el 5 de enero contra todo marzo» be asked at all.
 */
export type PeriodPick =
  | { kind: "dia"; year: number; monthIndex: number; day: number }
  | { kind: "mes"; year: number; monthIndex: number };

/**
 * The two ways of asking for a period. The app says which one is on, because they answer different
 * questions:
 *
 * - `rango`: one continuous span → a total and an EVOLUTION.
 * - `comparar`: individual days and whole months, of any year → a COMPARISON, one column each. The
 *   special case: «el 5 de enero de 2025 contra el 12 de marzo de 2026», «marzo contra julio».
 */
export type OccupancyPeriod =
  | { mode: "rango"; range: DateRange }
  | { mode: "comparar"; picks: PeriodPick[] };

/** The days of ONE month of ONE year that a period covers. Never empty. */
export interface PeriodCell {
  year: number;
  monthIndex: number;
  /** 0-based, in order. A month at the end of a span holds only the part inside it. */
  days: number[];
}

export interface OccupancyQuery {
  metric: OccupancyMetricId;
  centerIds: string[];
  period: OccupancyPeriod;
  scope: Scope;
  limit?: number;
}

/**
 * Carries the CELLS its column covers — one month of one year, or several on a quarter — so a click
 * can narrow to exactly what was drawn and every consumer reads the same days the axis did.
 */
export interface AxisPoint {
  label: string;
  cells: PeriodCell[];
}

/**
 * The figures behind ONE column, so a tooltip can answer «¿de dónde sale ese 59 %?» without a
 * second pass. `numerator`/`denominator` are the ACTIVE metric's operands.
 */
export interface PointFacts {
  revenue: number;
  sold: number;
  available: number;
  pax: number;
  numerator: number;
  denominator: number;
}

export interface OccupancySeries {
  key: OccupancySeriesKey;
  label: string;
  /** One entry per axis column; `null` is a period with no data. */
  values: (number | null)[];
  /** Aligned with `values`; `null` exactly where the value is. */
  facts: (PointFacts | null)[];
}

export interface OccupancyBundle {
  axis: AxisPoint[];
  series: OccupancySeries[];
  metric: MetricSpec;
  /** Series the cap left out, so the card can say how many. */
  truncated: number;
  warnings: string[];
}
