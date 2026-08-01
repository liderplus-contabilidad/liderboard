/**
 * Contracts for the Ocupaciones data layer.
 *
 * A record is one COST CENTER × YEAR, and it stores ONLY raw inputs: ADR, occupancy %, RevPAR,
 * PAX and every `TOTAL` row are recomputed by `derive.ts` and never written down. The source
 * workbooks carry those rows as formulas without a cached result, and their aggregates mix
 * "average of ratios" with "ratio of sums" — recomputing sidesteps both problems.
 *
 * Unlike PyG there is no immutable original + edit overlay: here the user also creates years from
 * scratch and adds/removes channel rows, so the dataset is edited in place.
 */

export type InputRowId =
  | "available"
  | "revenue"
  | "sold"
  | "complimentary"
  | "cancellations"
  | "noShows"
  | "noShowsOta";

export type RoomRowId = "simples" | "dobles" | "triples";

/** `id` is a stable slug: renaming the channel keeps its data. */
export interface ChannelRow {
  id: string;
  name: string;
}

/** Raw inputs of one month. Every array has `length === OccupancyMonth.days`. */
export interface MonthInputs {
  /** Rooms the hotel has for sale that day. */
  available: number[];
  revenue: number[];
  /** Rooms sold and charged. */
  sold: number[];
  complimentary: number[];
  /** Cancellations, in nights. */
  cancellations: number[];
  noShows: number[];
  noShowsOta: number[];
  /** Channel id → one value per day. */
  channels: Record<string, number[]>;
  rooms: Record<RoomRowId, number[]>;
  /**
   * `null` means "no override — use simples·1 + dobles·2 + triples·3". A number records what the
   * hotel actually counted: a double sleeping three on an extra bed cannot be expressed by the
   * formula, and the source workbooks do type over those days.
   */
  pax: (number | null)[];
}

/**
 * Every row of a month exactly as the workbook had it, indicators and TOTAL included. Shown
 * verbatim so an upload reproduces the accountant's file, not a corrected version of it.
 */
export interface ImportedValues {
  cells: Record<string, (number | null)[]>;
  aggregates: Record<string, number | null>;
}

export interface OccupancyMonth {
  /** 0–11. */
  index: number;
  /** From the real calendar of `OccupancyDataset.year` — never the file's declared count. */
  days: number;
  /** The file's "NUMERO DE NOCHES". Informational and editable; it does not size the grid. */
  nights: number | null;
  /** false = month created empty, never sourced from a workbook. */
  fromFile: boolean;
  inputs: MonthInputs;
  imported?: ImportedValues;
  /**
   * false = still showing `imported` verbatim. The FIRST edit anywhere in the month flips this
   * and the whole month becomes computed at once — a month must never mix imported and
   * recomputed figures, because nothing on screen would tell them apart.
   */
  edited: boolean;
}

/** Where a workbook with no "centro de costo" line lands, so that case is not special-cased. */
export const DEFAULT_CENTER_ID = "principal";

/** The derived all-centers view. Reserved: no stored dataset may use it. */
export const CONSOLIDATED_CENTER_ID = "consolidado";

export interface CenterRow {
  id: string;
  name: string;
}

/**
 * One center's year, as the pure layer produces it: it belongs to NOBODY yet. `db.ts` stamps the
 * owner at the door (see `StoredOccupancyDataset`), because which hotel a workbook belongs to is
 * decided by which hotel is open, never by the file.
 */
export interface OccupancyDataset {
  centerId: string;
  /** Falls back to the hotel's name for `principal`. */
  centerName: string;
  year: number;
  hotelName: string;
  /** The dataset's channel catalogue, in display order. The user owns it after import. */
  channels: ChannelRow[];
  /** Always 12 entries. Months with no data hold all-zero arrays. */
  months: OccupancyMonth[];
  /** Spanish, human-readable parse notes. */
  warnings: string[];
  updatedAt: number;
}

/**
 * A stored record: one HOTEL-SUCURSAL-YEAR. Primary key is the `[hotelId+centerId+year]` triple, so
 * two hotels can each hold a `principal` of 2025 without touching each other.
 *
 * `hotelId` is the owner and `hotelName` is what the workbook DECLARED — the hotel's identity, not
 * its label. They are different things: the user calls «Manor Galápagos» what the file calls
 * `CULTURA MANOR`, and only the second one ever gets compared against a file.
 */
export interface StoredOccupancyDataset extends OccupancyDataset {
  hotelId: string;
}

export interface OccupancyParseResult {
  dataset: OccupancyDataset;
  /** Months the file actually provided, so a merge knows what to replace. */
  parsedMonths: number[];
}
