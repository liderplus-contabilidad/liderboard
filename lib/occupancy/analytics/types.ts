/**
 * Contracts for the Ocupaciones analytics engine.
 *
 * A series is identified by (sucursal, año); the period is its X axis, not its identity — the
 * same rule PyG follows. The contract everything rests on is also the same: `null` means "this
 * period had no data" and `0` means "a real zero". A year loaded only to July must leave August
 * blank; drawing it as 0 invents a collapse that never happened.
 *
 * The metric, unlike PyG's accounts, is SINGLE: ocupación is a %, ADR and RevPAR are $, and
 * vendidas and PAX are counts. Mixing them in one card would need a second Y axis, which
 * `ChartOption` forbids by construction.
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

/**
 * How coarse a column of the X axis is. It is PyG's frequency ladder with a day step under it —
 * the same `Frequency` values, so "T1" is spelled in one place for the whole app.
 */
export type Scope = "dia" | Frequency;

/** Every step of the axis, finest first — the order «Ver por» offers them in. */
export const SCOPE_ORDER: readonly Scope[] = ["dia", ...FREQUENCY_ORDER];

export interface OccupancySeriesKey {
  centerId: string;
  year: number;
}

/** Stable id for React keys and color lookups; neither part can contain the separator. */
export function occupancySeriesId(key: OccupancySeriesKey): string {
  return `${key.centerId}|${key.year}`;
}

/**
 * One column of the X axis. It carries EVERY month it covers — one on a monthly or daily axis,
 * three on a quarter, twelve on the year — so a click can narrow to exactly what was drawn.
 * `day` is 0-based and present only on the daily axis.
 */
export interface AxisPoint {
  label: string;
  monthIndexes: number[];
  day?: number;
}

/**
 * The raw figures behind ONE column of one series, kept so a tooltip can answer «¿de dónde sale
 * ese 59 %?» without a second pass over the datasets. `numerator`/`denominator` are the active
 * metric's own two operands; the rest are the inputs every metric is built from.
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

export interface OccupancyQuery {
  metric: OccupancyMetricId;
  centerIds: string[];
  years: number[];
  scope: Scope;
  /** Marked months (0–11). Empty means the whole year: marking NARROWS the axis. */
  months: number[];
  /**
   * Marked days of the month, 0-based. Empty means every day of the marked months. Narrowing
   * to one day is what turns «enero de 2025 contra 2026» into «el 5 de enero de 2025 contra el
   * 5 de enero de 2026».
   */
  days: number[];
  limit?: number;
}

export interface OccupancyBundle {
  axis: AxisPoint[];
  series: OccupancySeries[];
  metric: MetricSpec;
  /** Series the cap left out, so the card can say how many. */
  truncated: number;
  warnings: string[];
}
