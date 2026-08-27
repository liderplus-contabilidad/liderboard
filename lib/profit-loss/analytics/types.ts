/**
 * Contracts for the PyG analytics engine. The layer is pure: it knows nothing about React,
 * Dexie or Excel — it consumes materialized sources and produces series.
 *
 * The contract everything else rests on: `value: null` means "this period had no movement"
 * and `0` means "a real zero". The 2026 files only reach July, so August has no value at
 * all; drawing it as 0 invents a 100% collapse that never happened. Conversely a seasonal
 * account that billed nothing in February is a genuine 0 and must be drawn. No function in
 * this layer turns one into the other.
 */
import type { Frequency } from "../types";

/** A series is identified by (account, center, year). The period is its X axis, not its identity. */
export interface SeriesKey {
  code: string;
  centerId: string;
  year: number;
}

/**
 * Stable, deterministic id for React keys and map lookups. The separator is one no account
 * code, center slug or year can contain, so the id never collides.
 */
export function seriesKeyId(key: SeriesKey): string {
  return `${key.code}|${key.centerId}|${key.year}`;
}

/** A period within a year, `index` zero-based (Ene = 0, T1 = 0, Total = 0). */
export interface PeriodRef {
  year: number;
  frequency: Frequency;
  index: number;
}

/**
 * A period WITHOUT a year — "enero", not "enero de 2026". This is what the filter bar marks:
 * with several years on screen, marking «Ene» has to narrow every one of them, so a dated
 * reference would have to be re-issued each time the marked years change.
 *
 * `selection.ts` expands a slot against the years in play to get back `PeriodRef`s.
 */
export interface PeriodSlot {
  frequency: Frequency;
  index: number;
}

/** One point of the X axis. `null` = no movement in that period (see the file header). */
export interface SeriesPoint {
  period: PeriodRef;
  value: number | null;
}

/**
 * Voids every point while keeping the X axis intact. The one way a transformation says "this
 * cannot be computed" — it never falls back to zeros, which would draw a collapse.
 */
export function blankPoints(points: SeriesPoint[]): SeriesPoint[] {
  return points.map((point) => ({ ...point, value: null }));
}

/** The rolled-up parent of a series, in the same periods — the denominator every stacked chart needs. */
export interface SeriesContainer {
  code: string;
  label: string;
  points: SeriesPoint[];
}

export interface Series {
  key: SeriesKey;
  label: string;
  points: SeriesPoint[];
  /** Direct parent with rollups applied; `null` when the account is a root. */
  container: SeriesContainer | null;
  /** Spanish notes a transformation had to report (e.g. a zero base for índice 100). */
  warnings?: string[];
}

/**
 * A source is one center's statement for one year, already materialized: rollups and edits
 * applied. The engine never sees a `PygDataset`, so the day the workspace loads several
 * years the adapter just produces more sources and `buildSeries` doesn't change.
 */
export interface AnalyticsSource {
  centerId: string;
  centerName: string;
  year: number;
  baseFrequency: Frequency;
  /** Code → values in the base frequency, with rollups and edits already applied. */
  valuesByCode: Map<string, number[]>;
  /** Code → the account's name; each series' label and its container's come from here. */
  namesByCode: Map<string, string>;
  /** Code → the direct parent's code present in the source; absent for roots. */
  parentByCode: Map<string, string>;
  /** Indices of the base frequency that have movement. */
  coverage: ReadonlySet<number>;
}

/**
 * The four axes mirror what the PyG filter bar marks (cuentas, centros, años, periodos), so
 * translating the filter selection into a query stays mechanical.
 */
export interface SeriesQuery {
  codes: string[];
  centerIds: string[];
  years: number[];
  frequency: Frequency;
  /** Restricts the X axis; absent = every period of the year. */
  periods?: PeriodRef[];
  /** Series cap; MAX_SERIES by default. */
  limit?: number;
}

export interface SeriesBundle {
  series: Series[];
  /** Unified X axis, ordered by (year, index). */
  periods: PeriodRef[];
  /** Series discarded by the cap. */
  truncated: number;
  warnings: string[];
}

/** What a period is measured against in `compareSeries`. */
export type ComparisonBase =
  | { kind: "periodo-anterior" }
  | { kind: "mismo-periodo-anio-anterior" }
  | { kind: "primer-periodo" }
  | { kind: "promedio" }
  | { kind: "serie"; key: SeriesKey };

export interface VariationPoint {
  period: PeriodRef;
  value: number | null;
  baseValue: number | null;
  deltaAbs: number | null;
  deltaPct: number | null;
}
