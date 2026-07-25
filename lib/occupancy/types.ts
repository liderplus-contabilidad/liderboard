/**
 * Contracts for the Ocupaciones (hotel occupancy) data layer.
 *
 * The unit of persistence is the COST CENTER × YEAR — the accountant exports one workbook per
 * sucursal per year, so that pair is what a record is — and it stores ONLY raw inputs: ADR,
 * occupancy %, RevPAR, PAX and every `TOTAL` row are recomputed by `derive.ts` and
 * never written down. The source workbooks carry those rows as formulas without a
 * cached result, and their aggregates mix "average of ratios" with "ratio of sums" —
 * recomputing sidesteps both problems instead of trying to reproduce them.
 *
 * Unlike PyG there is no immutable original + edit overlay: here the user also creates
 * years from scratch (no file to compare against) and adds/removes channel rows, so the
 * dataset is edited in place.
 */

/** Row ids of the seven hand-entered metric rows. */
export type InputRowId =
  | "available"
  | "revenue"
  | "sold"
  | "complimentary"
  | "cancellations"
  | "noShows"
  | "noShowsOta";

/** Row ids of the room-type rows. */
export type RoomRowId = "simples" | "dobles" | "triples";

/** A sales-channel row of the year's catalogue. `id` is a stable slug: renaming keeps it. */
export interface ChannelRow {
  id: string;
  name: string;
}

/** Raw inputs of one month. Every array has `length === OccupancyMonth.days`. */
export interface MonthInputs {
  /** Rooms the hotel has for sale that day. */
  available: number[];
  /** Room revenue ($) that day. */
  revenue: number[];
  /** Rooms sold and charged. */
  sold: number[];
  /** Complimentary rooms. */
  complimentary: number[];
  /** Cancellations (nights). */
  cancellations: number[];
  noShows: number[];
  noShowsOta: number[];
  /** Nights per channel: channel id → one value per day. */
  channels: Record<string, number[]>;
  rooms: Record<RoomRowId, number[]>;
  /**
   * Guests per day. `null` means "no override — use simples·1 + dobles·2 + triples·3", so
   * PAX keeps following the room types until someone states otherwise. A number records
   * what the hotel actually counted: a double sleeping three on an extra bed cannot be
   * expressed by the formula, and the source workbooks do type over those days.
   */
  pax: (number | null)[];
}

/**
 * Every row of a month exactly as the workbook had it — indicators and TOTAL column
 * included. Shown verbatim so an upload reproduces the accountant's file instead of a
 * corrected version of it.
 */
export interface ImportedValues {
  /** Grid row id → one value per day. */
  cells: Record<string, (number | null)[]>;
  /** Grid row id → the file's own "Total / prom." cell. */
  aggregates: Record<string, number | null>;
}

export interface OccupancyMonth {
  /** 0–11. */
  index: number;
  /** Days from the real calendar of `OccupancyDataset.year` — never the file's declared count. */
  days: number;
  /** The file's "NUMERO DE NOCHES". Informational and editable; it does not size the grid. */
  nights: number | null;
  /** false = month created empty, never sourced from a workbook. */
  fromFile: boolean;
  inputs: MonthInputs;
  /** The workbook's own values. Present only on imported months. */
  imported?: ImportedValues;
  /**
   * false = still showing `imported` verbatim. The FIRST edit anywhere in the month flips
   * this and the month is computed from its inputs from then on, all of it at once — a
   * month must never mix imported and recomputed figures, because nothing on screen would
   * tell them apart.
   */
  edited: boolean;
}

/** Where a workbook with no "centro de costo" line lands, so that case is not special-cased. */
export const DEFAULT_CENTER_ID = "principal";

/** The id of the derived all-sucursales view. Reserved: no stored dataset may use it. */
export const CONSOLIDATED_CENTER_ID = "consolidado";

/** A cost center (sucursal) of the hotel. */
export interface CenterRow {
  id: string;
  name: string;
}

/** One sucursal's year. Primary key is the `[centerId+year]` pair. */
export interface OccupancyDataset {
  /** Slug of the cost center, or `DEFAULT_CENTER_ID` when the file declares none. */
  centerId: string;
  /** Display name of the cost center; falls back to the hotel's name for `principal`. */
  centerName: string;
  year: number;
  hotelName: string;
  /** The dataset's channel catalogue, in display order. The user owns it after import. */
  channels: ChannelRow[];
  /** Always 12 entries, index 0–11. Months with no data hold all-zero arrays. */
  months: OccupancyMonth[];
  /** Spanish, human-readable parse notes. */
  warnings: string[];
  updatedAt: number;
}

/** Singleton row: which hotel the workspace holds and what the Datos tab is showing. */
export interface OccupancyMeta {
  key: "workspace";
  hotelName: string;
  activeCenterId: string;
  activeYear: number;
}

/** What `parseOccupancyWorkbook` yields. */
export interface OccupancyParseResult {
  dataset: OccupancyDataset;
  /** Months the file actually provided, so a merge knows what to replace. */
  parsedMonths: number[];
}
