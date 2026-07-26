/**
 * Pure derivation for Ocupaciones: turns a stored `OccupancyDataset` (raw inputs only) into
 * the day-by-day grid the Datos tab renders.
 *
 * An imported month is shown VERBATIM until it is first edited (see `applySnapshot`), so an
 * upload reproduces the accountant's file rather than a corrected version of it. Everything
 * below describes what happens once the month is computed.
 *
 * The monthly aggregates are RATIOS OF SUMS (ADR = total revenue / total rooms sold), not
 * averages of the daily ratios — that is the hotel-industry definition and the only one
 * under which ADR × Ocupación = RevPAR holds in the "Total / prom." column.
 */
import { periodLabels, periodsPerYear, sumByPeriod, type Frequency } from "@/lib/period";
import {
  DEFAULT_CENTER_ID,
  type CenterRow,
  type ChannelRow,
  type ImportedValues,
  type MonthInputs,
  type OccupancyDataset,
  type OccupancyMonth,
  type RoomRowId,
} from "./types";

export type OccupancyRowKind = "section" | "input" | "derived" | "channel";

export interface OccupancyGridRow {
  /** "available" | "revenue" | … | "simples" | `channel:${channelId}`. */
  id: string;
  label: string;
  /** Second line under the label, e.g. "ingresos / vendidas". */
  hint?: string;
  kind: OccupancyRowKind;
  /** "percent" carries decimals; "percent-whole" is rounded to the unit. */
  format: "number" | "currency" | "percent" | "percent-whole";
  editable: boolean;
  /** One entry per day of the month; `null` renders as an empty cell. */
  cells: (number | null)[];
  /** The "Total / prom." column, already resolved per this row's rule. */
  agg: number | null;
}

export interface OccupancyGrid {
  /** Whether a column is a day of one month, or a period of the year. */
  scope: "month" | "year";
  /** Present only in the monthly scope. */
  monthIndex?: number;
  /** How coarse the year's columns are. Present only in the annual scope. */
  frequency?: Frequency;
  /** How many value columns the rows carry: days of the month, or periods of the year. */
  columns: number;
  /** Header label per column: "1"…"31", "Ene"…"Dic", or "T1"…"T4". */
  columnLabels: string[];
  rows: OccupancyGridRow[];
  /** Columns where the channel total ≠ sold + complimentary. */
  channelMismatch: number[];
  /** Columns where the room-type total ≠ sold + complimentary. */
  roomMismatch: number[];
  /** Columns whose PAX was stated by hand AND differs from simples·1 + dobles·2 + triples·3. */
  paxOverrides: number[];
  /** true while the month is being shown verbatim from the workbook (nothing recomputed). */
  asImported: boolean;
  /** Union of both checks — the banner's headline count. */
  mismatch: number[];
}

/** Counts differ below this only through floating-point noise, not through a real gap. */
const EPSILON = 1e-6;

export const ROOM_ROW_IDS: RoomRowId[] = ["simples", "dobles", "triples"];

/** How many people a room of each type holds — the workbook's PAX weighting. */
const ROOM_PAX: Record<RoomRowId, number> = { simples: 1, dobles: 2, triples: 3 };

const ROOM_LABELS: Record<RoomRowId, string> = {
  simples: "Simples",
  dobles: "Dobles",
  triples: "Triples",
};

/** Days in a calendar month. Day 0 of the next month is the last day of this one. */
export function daysInMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate();
}

function zeros(days: number): number[] {
  return new Array<number>(days).fill(0);
}

/** An untouched month: every input at zero, one slot per channel in the catalogue. */
export function emptyMonth(
  index: number,
  days: number,
  channels: ChannelRow[] = [],
): OccupancyMonth {
  const inputs: MonthInputs = {
    available: zeros(days),
    revenue: zeros(days),
    sold: zeros(days),
    complimentary: zeros(days),
    cancellations: zeros(days),
    noShows: zeros(days),
    noShowsOta: zeros(days),
    channels: Object.fromEntries(channels.map((c) => [c.id, zeros(days)])),
    rooms: { simples: zeros(days), dobles: zeros(days), triples: zeros(days) },
    pax: new Array<number | null>(days).fill(null),
  };
  return { index, days, nights: null, fromFile: false, inputs, edited: false };
}

/**
 * A blank sucursal-year: 12 months sized to the real calendar, no channels. With no center
 * given it falls into `principal`, rotulada with the hotel's own name — a hotel that runs a
 * single property still needs one place to put its years.
 */
export function emptyDataset(
  year: number,
  hotelName: string,
  center?: CenterRow,
): OccupancyDataset {
  return {
    centerId: center?.id ?? DEFAULT_CENTER_ID,
    centerName: center?.name ?? hotelName,
    year,
    hotelName,
    channels: [],
    months: Array.from({ length: 12 }, (_, i) => emptyMonth(i, daysInMonth(year, i))),
    warnings: [],
    updatedAt: 0,
  };
}

/** Reads a possibly short/absent series without ever yielding NaN. */
function at(values: number[] | undefined, day: number): number {
  const value = values?.[day];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function series(values: number[] | undefined, days: number): number[] {
  return Array.from({ length: days }, (_, d) => at(values, d));
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

/** A ratio that refuses to be Infinity or NaN: an undefined denominator means no answer. */
function ratio(numerator: number, denominator: number): number | null {
  return denominator === 0 ? null : numerator / denominator;
}

/** Running prefix ratio — `% acumulado diario` compares totals elapsed, not daily rates. */
function cumulativeRatio(numerators: number[], denominators: number[]): (number | null)[] {
  let num = 0;
  let den = 0;
  return numerators.map((value, d) => {
    num += value;
    den += denominators[d] ?? 0;
    return ratio(num, den);
  });
}

function cumulativeSum(values: number[]): number[] {
  let total = 0;
  return values.map((value) => {
    total += value;
    return total;
  });
}

function last(values: (number | null)[]): number | null {
  return values.length > 0 ? (values[values.length - 1] ?? null) : null;
}

function inputRow(
  id: string,
  label: string,
  cells: number[],
  options: { hint?: string; format?: OccupancyGridRow["format"]; agg?: "sum" | "avg" } = {},
): OccupancyGridRow {
  const agg = options.agg ?? "sum";
  // "avg" only ever averages room counts, and a hotel cannot hold 21,94 rooms — the mean is
  // rounded to a whole room. Nothing computes from it: the occupancy and RevPAR
  // denominators use the SUM of available rooms, not this average.
  const mean = cells.length > 0 ? Math.round(sum(cells) / cells.length) : null;
  return {
    id,
    label,
    ...(options.hint ? { hint: options.hint } : {}),
    kind: "input",
    format: options.format ?? "number",
    editable: true,
    cells,
    agg: agg === "avg" ? mean : sum(cells),
  };
}

function derivedRow(
  id: string,
  label: string,
  cells: (number | null)[],
  agg: number | null,
  options: { hint?: string; format?: OccupancyGridRow["format"] } = {},
): OccupancyGridRow {
  return {
    id,
    label,
    ...(options.hint ? { hint: options.hint } : {}),
    kind: "derived",
    format: options.format ?? "number",
    editable: false,
    cells,
    agg,
  };
}

function sectionRow(id: string, label: string, days: number, hint?: string): OccupancyGridRow {
  return {
    id,
    label,
    ...(hint ? { hint } : {}),
    kind: "section",
    format: "number",
    editable: false,
    cells: new Array<number | null>(days).fill(null),
    agg: null,
  };
}

/**
 * Overlays what the workbook actually held on top of the computed row. Rows the file left
 * empty — the many uncached `SUM(...)` TOTAL cells — keep the computed value: there is no
 * number in the file to show, so refusing to compute would just leave a hole.
 */
function applySnapshot(
  row: OccupancyGridRow,
  snapshot: ImportedValues,
  days: number,
): OccupancyGridRow {
  const cells = snapshot.cells[row.id];
  const agg = snapshot.aggregates[row.id];
  return {
    ...row,
    cells: cells ? Array.from({ length: days }, (_, d) => cells[d] ?? row.cells[d]) : row.cells,
    agg: agg ?? row.agg,
  };
}

/**
 * Builds the Datos grid for one month. Rows come out in display order: raw inputs,
 * indicators, the channel catalogue, then room types and PAX.
 */
export function toOccupancyGrid(dataset: OccupancyDataset, monthIndex: number): OccupancyGrid {
  const month =
    dataset.months[monthIndex] ?? emptyMonth(monthIndex, daysInMonth(dataset.year, monthIndex));
  const days = month.days;
  const raw = month.inputs;

  const available = series(raw.available, days);
  const revenue = series(raw.revenue, days);
  const sold = series(raw.sold, days);
  const complimentary = series(raw.complimentary, days);

  const totalRevenue = sum(revenue);
  const totalSold = sum(sold);
  const totalAvailable = sum(available);

  const cumulativeOccupancy = cumulativeRatio(sold, available);

  // Channel membership is PER MONTH: each table holds only the channels that month uses, so
  // a channel can be dropped from March without touching January. The dataset catalogue only
  // supplies the display name and the order.
  const channelSeries = dataset.channels
    .filter((channel) => raw.channels?.[channel.id] !== undefined)
    .map((channel) => ({ channel, values: series(raw.channels[channel.id], days) }));
  const totalChannels = Array.from({ length: days }, (_, d) =>
    sum(channelSeries.map((c) => c.values[d] ?? 0)),
  );

  const rooms = Object.fromEntries(
    ROOM_ROW_IDS.map((id) => [id, series(raw.rooms?.[id], days)]),
  ) as Record<RoomRowId, number[]>;
  const totalRooms = Array.from({ length: days }, (_, d) =>
    sum(ROOM_ROW_IDS.map((id) => rooms[id][d] ?? 0)),
  );
  // PAX follows the room types unless a day states otherwise; a stated value always wins.
  const paxFromRooms = Array.from({ length: days }, (_, d) =>
    sum(ROOM_ROW_IDS.map((id) => (rooms[id][d] ?? 0) * ROOM_PAX[id])),
  );
  const pax = paxFromRooms.map((fromRooms, d) => raw.pax?.[d] ?? fromRooms);
  const paxOverrides = pax.reduce<number[]>((days_, value, d) => {
    if (raw.pax?.[d] != null && value !== paxFromRooms[d]) {
      days_.push(d);
    }
    return days_;
  }, []);
  const cumulativePax = cumulativeSum(pax);

  // The workbook's own per-day "OK" check: every occupied room must be accounted for both
  // by the channel that sold it and by its room type.
  const occupied = Array.from({ length: days }, (_, d) => sold[d] + complimentary[d]);
  const channelMismatch: number[] = [];
  const roomMismatch: number[] = [];
  for (let d = 0; d < days; d++) {
    if (Math.abs(totalChannels[d] - occupied[d]) > EPSILON) {
      channelMismatch.push(d);
    }
    if (Math.abs(totalRooms[d] - occupied[d]) > EPSILON) {
      roomMismatch.push(d);
    }
  }

  const rows: OccupancyGridRow[] = [
    inputRow("available", "Habitaciones disponibles", available, {
      hint: "para la venta / día",
      agg: "avg",
    }),
    inputRow("revenue", "Ingresos en habitaciones", revenue, { format: "currency" }),
    inputRow("sold", "Habitaciones vendidas y cobradas", sold),
    inputRow("complimentary", "Habitaciones complementarias", complimentary),
    inputRow("cancellations", "Cancelaciones", series(raw.cancellations, days), {
      hint: "noches en el mes",
    }),
    inputRow("noShows", "No shows", series(raw.noShows, days), { hint: "habitaciones" }),
    inputRow("noShowsOta", "No shows OTAS", series(raw.noShowsOta, days)),

    derivedRow(
      "adr",
      "ADR",
      revenue.map((value, d) => ratio(value, sold[d])),
      ratio(totalRevenue, totalSold),
      { hint: "ingresos / vendidas", format: "currency" },
    ),
    derivedRow(
      "occupancy",
      "Ocupación",
      sold.map((value, d) => ratio(value, available[d])),
      ratio(totalSold, totalAvailable),
      { hint: "vendidas / disponibles", format: "percent" },
    ),
    derivedRow(
      "revpar",
      "RevPAR",
      revenue.map((value, d) => ratio(value, available[d])),
      ratio(totalRevenue, totalAvailable),
      { hint: "ingresos / disponibles", format: "currency" },
    ),
    derivedRow(
      "cumulativeOccupancy",
      "% acumulado diario",
      cumulativeOccupancy,
      last(cumulativeOccupancy),
      // Whole percents: the running figure is a trend read at a glance, not a precise
      // measure — its final value is the same number Ocupación already reports exactly.
      { hint: "ocupación acumulada del mes", format: "percent-whole" },
    ),

    // Room types first, then channels: the room breakdown reconciles directly with the
    // sold/complimentary rows above it, so it reads better next to them.
    sectionRow("section:rooms", "Habitaciones", days),
    ...ROOM_ROW_IDS.map((id) => inputRow(id, ROOM_LABELS[id], rooms[id])),
    derivedRow("totalRooms", "Total habitaciones", totalRooms, sum(totalRooms)),
    inputRow("pax", "PAX totales", pax, {
      hint: "simples·1 + dobles·2 + triples·3 · editable",
    }),
    derivedRow("cumulativePax", "PAX acumulados", cumulativePax, last(cumulativePax)),

    sectionRow("section:channels", "Canales de venta", days, "noches por día"),
    ...channelSeries.map<OccupancyGridRow>(({ channel, values }) => ({
      id: `channel:${channel.id}`,
      label: channel.name,
      kind: "channel",
      format: "number",
      editable: true,
      cells: values,
      agg: sum(values),
    })),
    derivedRow("totalChannels", "Total canales", totalChannels, sum(totalChannels)),
  ];

  // An untouched imported month is shown EXACTLY as the workbook had it — indicators and
  // TOTAL column included, errors and all. The first edit flips `edited` and every row
  // switches to the computed value at once, so a month never mixes the two provenances.
  const snapshot = month.edited ? undefined : month.imported;

  return {
    scope: "month",
    monthIndex,
    columns: days,
    columnLabels: Array.from({ length: days }, (_, d) => String(d + 1)),
    rows: snapshot ? rows.map((row) => applySnapshot(row, snapshot, days)) : rows,
    asImported: snapshot !== undefined,
    channelMismatch,
    roomMismatch,
    paxOverrides,
    mismatch: [...new Set([...channelMismatch, ...roomMismatch])].sort((a, b) => a - b),
  };
}

/**
 * The same rows with one column per period of the year: twelve months, four quarters or two
 * semesters. ALWAYS computed from the raw inputs — a row mixing months shown verbatim with
 * recomputed ones would be a total nothing on screen explains — and read-only by construction,
 * since every cell is an aggregate of days.
 *
 * Coarser columns change only WHICH days each cell adds up. The raw inputs are summed and ADR,
 * ocupación and RevPAR stay ratios OF THOSE SUMS, so ADR × Ocupación = RevPAR holds inside a T1
 * exactly as it does inside a month.
 */
export function toAnnualGrid(
  dataset: OccupancyDataset,
  frequency: Frequency = "mensual",
): OccupancyGrid {
  const months = Array.from(
    { length: 12 },
    (_, index) => dataset.months[index] ?? emptyMonth(index, daysInMonth(dataset.year, index)),
  );
  const columns = periodsPerYear(frequency);
  const perColumn = <T>(build: (column: number) => T): T[] =>
    Array.from({ length: columns }, (_, column) => build(column));

  /** One total per COLUMN, from a raw input series: month totals folded into their period. */
  const byPeriod = (pick: (inputs: MonthInputs) => number[] | undefined): number[] =>
    sumByPeriod(
      months.map((month) => sum(series(pick(month.inputs), month.days))),
      frequency,
    );

  const available = byPeriod((i) => i.available);
  const revenue = byPeriod((i) => i.revenue);
  const sold = byPeriod((i) => i.sold);
  const complimentary = byPeriod((i) => i.complimentary);

  const totalRevenue = sum(revenue);
  const totalSold = sum(sold);
  const totalAvailable = sum(available);
  const cumulativeOccupancy = cumulativeRatio(sold, available);

  const rooms = Object.fromEntries(
    ROOM_ROW_IDS.map((id) => [id, byPeriod((i) => i.rooms?.[id])]),
  ) as Record<RoomRowId, number[]>;
  const totalRooms = perColumn((c) => sum(ROOM_ROW_IDS.map((id) => rooms[id][c])));

  // A stated PAX wins over the room-type formula, so the extra beds the files record survive.
  const pax = sumByPeriod(
    months.map((month) => {
      let total = 0;
      for (let d = 0; d < month.days; d++) {
        const fromRooms = ROOM_ROW_IDS.reduce(
          (guests, id) => guests + at(month.inputs.rooms?.[id], d) * ROOM_PAX[id],
          0,
        );
        total += month.inputs.pax?.[d] ?? fromRooms;
      }
      return total;
    }),
    frequency,
  );
  const cumulativePax = cumulativeSum(pax);

  // A channel appears once it is used by ANY month, and its column is that period's nights.
  const channelSeries = dataset.channels
    .filter((channel) => months.some((month) => month.inputs.channels?.[channel.id] !== undefined))
    .map((channel) => ({
      channel,
      values: byPeriod((i) => i.channels?.[channel.id]),
    }));
  const totalChannels = perColumn((c) => sum(channelSeries.map((entry) => entry.values[c])));

  const occupied = perColumn((c) => sold[c] + complimentary[c]);
  const channelMismatch: number[] = [];
  const roomMismatch: number[] = [];
  for (let c = 0; c < columns; c++) {
    if (Math.abs(totalChannels[c] - occupied[c]) > EPSILON) {
      channelMismatch.push(c);
    }
    if (Math.abs(totalRooms[c] - occupied[c]) > EPSILON) {
      roomMismatch.push(c);
    }
  }

  const rows: OccupancyGridRow[] = [
    // Room-NIGHTS, not the "rooms the hotel has" of the monthly view: this is what the
    // occupancy and RevPAR of each month divide by.
    inputRow("available", "Habitaciones disponibles", available, {
      hint: "habitaciones-noche",
    }),
    inputRow("revenue", "Ingresos en habitaciones", revenue, { format: "currency" }),
    inputRow("sold", "Habitaciones vendidas y cobradas", sold),
    inputRow("complimentary", "Habitaciones complementarias", complimentary),
    inputRow(
      "cancellations",
      "Cancelaciones",
      byPeriod((i) => i.cancellations),
      {
        hint: "noches",
      },
    ),
    inputRow(
      "noShows",
      "No shows",
      byPeriod((i) => i.noShows),
      { hint: "habitaciones" },
    ),
    inputRow(
      "noShowsOta",
      "No shows OTAS",
      byPeriod((i) => i.noShowsOta),
    ),

    derivedRow(
      "adr",
      "ADR",
      revenue.map((value, m) => ratio(value, sold[m])),
      ratio(totalRevenue, totalSold),
      { hint: "ingresos / vendidas", format: "currency" },
    ),
    derivedRow(
      "occupancy",
      "Ocupación",
      sold.map((value, m) => ratio(value, available[m])),
      ratio(totalSold, totalAvailable),
      { hint: "vendidas / disponibles", format: "percent" },
    ),
    derivedRow(
      "revpar",
      "RevPAR",
      revenue.map((value, m) => ratio(value, available[m])),
      ratio(totalRevenue, totalAvailable),
      { hint: "ingresos / disponibles", format: "currency" },
    ),
    derivedRow(
      "cumulativeOccupancy",
      "% acumulado",
      cumulativeOccupancy,
      last(cumulativeOccupancy),
      { hint: "ocupación acumulada del año", format: "percent-whole" },
    ),

    sectionRow("section:rooms", "Habitaciones", columns),
    ...ROOM_ROW_IDS.map((id) => inputRow(id, ROOM_LABELS[id], rooms[id])),
    derivedRow("totalRooms", "Total habitaciones", totalRooms, sum(totalRooms)),
    inputRow("pax", "PAX totales", pax),
    derivedRow("cumulativePax", "PAX acumulados", cumulativePax, last(cumulativePax)),

    sectionRow(
      "section:channels",
      "Canales de venta",
      columns,
      frequency === "mensual" ? "noches por mes" : "noches por periodo",
    ),
    ...channelSeries.map<OccupancyGridRow>(({ channel, values }) => ({
      id: `channel:${channel.id}`,
      label: channel.name,
      kind: "channel",
      format: "number",
      editable: false,
      cells: values,
      agg: sum(values),
    })),
    derivedRow("totalChannels", "Total canales", totalChannels, sum(totalChannels)),
  ];

  return {
    scope: "year",
    frequency,
    columns,
    columnLabels: [...periodLabels(frequency)],
    rows: rows.map((row) => ({ ...row, editable: false })),
    asImported: false,
    channelMismatch,
    roomMismatch,
    // A hand-stated PAX is a note about ONE DAY; there is no month it could point at here.
    paxOverrides: [],
    mismatch: [...new Set([...channelMismatch, ...roomMismatch])].sort((a, b) => a - b),
  };
}
