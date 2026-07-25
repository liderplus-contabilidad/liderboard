/**
 * Parses an `OCUPACION_*.xlsx` export into an `OccupancyDataset`.
 *
 * The source format is a single sheet of month blocks stacked vertically, each opening
 * with a "MES: ENERO" line. Only RAW inputs are read: the file's own ADR / Ocupación /
 * RevPAR / PAX and every TOTAL column are skipped, because they are stored as formulas
 * without a cached result and their aggregates follow inconsistent definitions.
 * `derive.ts` recomputes all of it.
 *
 * This module imports SheetJS statically; UI code must load it via dynamic `import()` so
 * the library stays out of the initial bundle.
 */
import * as XLSX from "xlsx";
import { MONTHS_FULL_ES } from "@/lib/date";
import { daysInMonth, emptyMonth, emptyDataset } from "./derive";
import { OccupancyParseError } from "./errors";
import { normalize, slugify } from "./slug";
import {
  CONSOLIDATED_CENTER_ID,
  type CenterRow,
  type ChannelRow,
  type ImportedValues,
  type InputRowId,
  type OccupancyParseResult,
  type RoomRowId,
} from "./types";

type Cell = string | number | null;

const MONTH_HEADER = /^\s*MES\s*:\s*(.+?)\s*$/i;
// Digit lookarounds, NOT \b: the file names separate the year with an underscore
// ("OCUPACION_CULTURA_MANOR_2026"), and `_` is a word character, so \b never matches there.
const YEAR_IN_TEXT = /(?<!\d)(?:19|20)\d{2}(?!\d)/;

/** Label matchers for the seven hand-entered rows, tried in order. */
const INPUT_MATCHERS: { id: InputRowId; test: (label: string) => boolean }[] = [
  // "OTAS" first: it is a longer variant of the plain no-show label.
  { id: "noShowsOta", test: (l) => l.includes("no shows") && l.includes("otas") },
  { id: "noShows", test: (l) => l.includes("no shows") },
  { id: "available", test: (l) => l.includes("que tiene el hotel") },
  { id: "revenue", test: (l) => l.includes("ingresos") && l.includes("habitaciones") },
  { id: "sold", test: (l) => l.includes("vendidas") },
  { id: "complimentary", test: (l) => l.includes("complementarias") },
  { id: "cancellations", test: (l) => l.startsWith("cancelaciones") },
];

const ROOM_MATCHERS: { id: RoomRowId; label: string }[] = [
  { id: "simples", label: "simples" },
  { id: "dobles", label: "dobles" },
  { id: "triples", label: "triples" },
];

const MONTH_KEYS = MONTHS_FULL_ES.map(normalize);

/** Helpers take `| undefined` so callers can index rows optionally without a cast. */
function text(cell: Cell | undefined): string {
  return typeof cell === "string" ? cell : "";
}

/** A cell counts as data only when it is a finite number — formulas and text are not. */
function num(cell: Cell | undefined): number {
  return typeof cell === "number" && Number.isFinite(cell) ? cell : 0;
}

function isDayHeader(cell: Cell | undefined): boolean {
  return typeof cell === "number" && Number.isInteger(cell) && cell >= 1 && cell <= 31;
}

function readGrid(data: ArrayBuffer): Cell[][] {
  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(data, { type: "array" });
  } catch {
    throw new OccupancyParseError("invalid-file");
  }
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) {
    throw new OccupancyParseError("invalid-file");
  }
  return XLSX.utils.sheet_to_json<Cell[]>(sheet, { header: 1, blankrows: true, defval: null });
}

/** Month index 0–11, or -1 when the header names something unrecognisable. */
function monthIndexOf(name: string): number {
  return MONTH_KEYS.indexOf(normalize(name));
}

/**
 * The hotel and its cost center, both optional and read BY POSITION: the first non-empty line
 * is always the title ("Ocupación - 2026"), so the names are whatever follows it.
 */
function readNames(grid: Cell[][], firstBlockRow: number): { hotel?: string; center?: string } {
  const lines: string[] = [];
  for (let r = 0; r < firstBlockRow; r++) {
    const value = text(grid[r]?.[0]).trim();
    if (value) {
      lines.push(value);
    }
  }
  return { hotel: lines[1], center: lines[2] };
}

/** `undefined` when the file declares no cost center; that falls into `principal`. */
function resolveCenter(name: string | undefined, warnings: string[]): CenterRow | undefined {
  const declared = name?.trim();
  const id = declared ? slugify(declared) : "";
  if (!declared || !id) {
    return undefined;
  }
  // "Consolidado" names the DERIVED all-sucursales view. A stored center answering to that id
  // would be shadowed by it and become unreachable, so it is renamed rather than dropped.
  if (id === CONSOLIDATED_CENTER_ID) {
    warnings.push(
      `«${declared}» es el nombre reservado de la vista consolidada; esa sucursal se guardó como «${id}-sucursal».`,
    );
    return { id: `${id}-sucursal`, name: declared };
  }
  return { id, name: declared };
}

/** "OCUPACION_CULTURA_MANOR_2026.xlsx" → "CULTURA MANOR". */
function hotelNameFrom(fileName: string): string {
  const words = fileName
    .replace(/\.[^.]+$/, "")
    .split(/[\s_-]+/)
    .filter((word) => word && normalize(word) !== "ocupacion" && !/^\d{4}$/.test(word));
  return words.length > 0 ? words.join(" ") : "—";
}

interface Block {
  monthIndex: number;
  /** As written in the file, for warning messages. */
  label: string;
  rows: Cell[][];
}

export function parseOccupancyWorkbook(data: ArrayBuffer, fileName: string): OccupancyParseResult {
  const grid = readGrid(data);
  const warnings: string[] = [];

  const starts: { row: number; name: string }[] = [];
  for (let r = 0; r < grid.length; r++) {
    const match = MONTH_HEADER.exec(text(grid[r]?.[0]));
    if (match) {
      starts.push({ row: r, name: match[1] });
    }
  }
  if (starts.length === 0) {
    throw new OccupancyParseError("no-months");
  }

  const yearNumber = resolveYear(grid, starts[0].row, fileName, warnings);
  const names = readNames(grid, starts[0].row);
  const hotelName = names.hotel ?? hotelNameFrom(fileName);
  if (!names.hotel) {
    warnings.push(`El archivo no declara el hotel; se tomó «${hotelName}» del nombre del archivo.`);
  }
  const dataset = emptyDataset(yearNumber, hotelName, resolveCenter(names.center, warnings));

  const blocks: Block[] = [];
  for (const [i, start] of starts.entries()) {
    const end = starts[i + 1]?.row ?? grid.length;
    const monthIndex = monthIndexOf(start.name);
    if (monthIndex === -1) {
      warnings.push(`No se reconoció el mes «${start.name}»; ese bloque se omitió.`);
      continue;
    }
    blocks.push({ monthIndex, label: start.name.trim(), rows: grid.slice(start.row, end) });
  }
  if (blocks.length === 0) {
    throw new OccupancyParseError("no-months");
  }

  // Pass 1: the channel catalogue, so every month can be sized against the same list.
  const channels: ChannelRow[] = [];
  const seen = new Set<string>();
  for (const block of blocks) {
    for (const { name } of channelRowsOf(block.rows)) {
      const id = slugify(name);
      if (id && !seen.has(id)) {
        seen.add(id);
        channels.push({ id, name: name.trim() });
      }
    }
  }
  dataset.channels = channels;

  // Pass 2: the values, now that a month can zero-fill the channels it never listed.
  const parsedMonths: number[] = [];
  for (const block of blocks) {
    dataset.months[block.monthIndex] = readBlock(block, yearNumber, channels, warnings);
    parsedMonths.push(block.monthIndex);
  }

  dataset.warnings = warnings;
  return { dataset, parsedMonths };
}

/** Sheet title first (the files carry "Ocupación - 2026"), then the file name. */
function resolveYear(
  grid: Cell[][],
  firstBlockRow: number,
  fileName: string,
  warnings: string[],
): number {
  for (let r = 0; r < firstBlockRow; r++) {
    for (const cell of grid[r] ?? []) {
      const match = YEAR_IN_TEXT.exec(text(cell));
      if (match) {
        return Number(match[0]);
      }
    }
  }
  const fromName = YEAR_IN_TEXT.exec(fileName);
  if (fromName) {
    warnings.push(`El archivo no declara el año; se tomó ${fromName[0]} del nombre del archivo.`);
    return Number(fromName[0]);
  }
  const current = new Date().getFullYear();
  warnings.push(`El archivo no declara el año; se usó ${current}.`);
  return current;
}

/** Everything above the "Cantidades por día" heading: the block's seven metric rows. */
function metricRowsOf(rows: Cell[][]): Cell[][] {
  const start = rows.findIndex((row) => normalize(text(row?.[0])) === "cantidades por dia");
  return start === -1 ? rows : rows.slice(0, start);
}

/** The rows between "Cantidades por día" and the TOTAL that closes the section. */
function channelRowsOf(rows: Cell[][]): { name: string; row: Cell[] }[] {
  const start = rows.findIndex((row) => normalize(text(row?.[0])) === "cantidades por dia");
  if (start === -1) {
    return [];
  }
  const found: { name: string; row: Cell[] }[] = [];
  for (let r = start + 1; r < rows.length; r++) {
    const label = text(rows[r]?.[0]).trim();
    const key = normalize(label);
    if (key === "total") {
      break;
    }
    if (label) {
      found.push({ name: label, row: rows[r] });
    }
  }
  return found;
}

/** The rows between the bare "Habitaciones" heading and the TOTAL that closes it. */
function roomRowsOf(rows: Cell[][]): Map<RoomRowId, Cell[]> {
  const found = new Map<RoomRowId, Cell[]>();
  const start = rows.findIndex((row) => normalize(text(row?.[0])) === "habitaciones");
  if (start === -1) {
    return found;
  }
  for (let r = start + 1; r < rows.length; r++) {
    const key = normalize(text(rows[r]?.[0]));
    if (key === "total") {
      break;
    }
    const match = ROOM_MATCHERS.find((candidate) => candidate.label === key);
    if (match) {
      found.set(match.id, rows[r]);
    }
  }
  return found;
}

function readBlock(block: Block, yearNumber: number, channels: ChannelRow[], warnings: string[]) {
  const days = daysInMonth(yearNumber, block.monthIndex);
  // Only the channels THIS block lists: membership is per month, so a channel that appears
  // in March must not materialise as an empty row in January.
  const present = new Set(channelRowsOf(block.rows).map(({ name }) => slugify(name)));
  const month = emptyMonth(
    block.monthIndex,
    days,
    channels.filter((channel) => present.has(channel.id)),
  );
  month.fromFile = true;
  month.nights = declaredNights(block.rows[0]);

  if (month.nights !== null && month.nights > days) {
    warnings.push(
      `${block.label} declara ${month.nights} noches pero el mes tiene ${days} días; se usaron ${days}.`,
    );
  }

  const dayColumns = dayColumnsOf(block.rows);
  if (dayColumns.length === 0) {
    warnings.push(`${block.label} no tiene una fila «Dias en el mes»; el bloque quedó vacío.`);
    return month;
  }

  /** Copies a file row into a day-indexed series, reporting data past the month's end. */
  const readSeries = (row: Cell[] | undefined, target: number[]) => {
    let dropped = false;
    for (const [day, col] of dayColumns.entries()) {
      const value = num(row?.[col]);
      if (day < days) {
        target[day] = value;
      } else if (value !== 0) {
        dropped = true;
      }
    }
    return dropped;
  };

  let droppedAny = false;

  // Metric rows only — the scan MUST stop at "Cantidades por día". Below it live a
  // "Complementarias" channel and a "Simples" room row whose labels would otherwise be
  // matched again and silently overwrite the metrics above (they disagree in the real files).
  for (const row of metricRowsOf(block.rows)) {
    const label = normalize(text(row?.[0]));
    if (!label) {
      continue;
    }
    const match = INPUT_MATCHERS.find((candidate) => candidate.test(label));
    if (match) {
      droppedAny = readSeries(row, month.inputs[match.id]) || droppedAny;
    }
  }

  // Duplicated channel labels inside one block are summed — the real exports repeat
  // "Grupos" and "Agencias de viajes", and dropping either one would lose nights.
  const timesSeen = new Map<string, number>();
  for (const { name, row } of channelRowsOf(block.rows)) {
    const id = slugify(name);
    const target = month.inputs.channels[id];
    if (!target) {
      continue;
    }
    const times = (timesSeen.get(id) ?? 0) + 1;
    timesSeen.set(id, times);
    if (times === 2) {
      warnings.push(
        `En ${block.label} la etiqueta «${name.trim()}» aparece 2 veces; se sumaron sus valores.`,
      );
    }
    const buffer = new Array<number>(days).fill(0);
    droppedAny = readSeries(row, buffer) || droppedAny;
    for (let d = 0; d < days; d++) {
      target[d] += buffer[d];
    }
  }

  for (const [id, row] of roomRowsOf(block.rows)) {
    droppedAny = readSeries(row, month.inputs.rooms[id]) || droppedAny;
  }

  // PAX is stored ONLY where the file disagrees with simples·1 + dobles·2 + triples·3.
  // Those days are real (an extra bed); the rest stay null so PAX keeps tracking the room
  // types as they are edited. The file's own PAX TOTAL is ignored — in this export it
  // points at another month's rows.
  const paxRow = block.rows.find((row) => normalize(text(row?.[0])) === "pax totales");
  if (paxRow) {
    const declared = new Array<number>(days).fill(0);
    readSeries(paxRow, declared);
    const { simples, dobles, triples } = month.inputs.rooms;
    for (let d = 0; d < days; d++) {
      const fromRooms = simples[d] + 2 * dobles[d] + 3 * triples[d];
      month.inputs.pax[d] = declared[d] === fromRooms ? null : declared[d];
    }
  }

  if (droppedAny) {
    warnings.push(
      `${block.label} trae valores más allá del día ${days}; se descartaron esas columnas.`,
    );
  }

  month.imported = snapshotOf(block.rows, dayColumns, days, channels);
  return month;
}

/** Row labels of the grid's derived rows, so the snapshot can carry the file's own figures. */
const SNAPSHOT_ROWS: { id: string; test: (label: string) => boolean }[] = [
  { id: "available", test: (l) => l.includes("que tiene el hotel") },
  { id: "revenue", test: (l) => l.includes("ingresos") && l.includes("habitaciones") },
  { id: "sold", test: (l) => l.includes("vendidas") },
  { id: "complimentary", test: (l) => l.includes("complementarias") },
  { id: "cancellations", test: (l) => l.startsWith("cancelaciones") },
  { id: "noShowsOta", test: (l) => l.includes("no shows") && l.includes("otas") },
  { id: "noShows", test: (l) => l.includes("no shows") },
  { id: "adr", test: (l) => l.startsWith("adr") },
  { id: "occupancy", test: (l) => l.startsWith("ocupacion") },
  { id: "revpar", test: (l) => l.startsWith("revpar") },
  { id: "cumulativeOccupancy", test: (l) => l.includes("acumulado diario") },
  { id: "pax", test: (l) => l === "pax totales" },
  { id: "cumulativePax", test: (l) => l === "pax acumulados" },
];

/**
 * Captures the block EXACTLY as the workbook holds it — indicators, room types, channels and
 * the TOTAL column. An untouched month is rendered from this, so an upload reproduces the
 * accountant's file instead of a corrected version of it.
 *
 * A TOTAL cell that is an uncached formula yields no number and is simply left out; the grid
 * falls back to computing that one aggregate, because there is nothing in the file to show.
 */
/**
 * The TOTAL column, read from the "Dias en el mes" header by name. It is NOT the column
 * after the last day: February's header stops at day 30 while TOTAL stays at AG, so assuming
 * adjacency reads an empty cell and silently loses the file's own totals.
 */
function totalColumnOf(rows: Cell[][]): number {
  const header = rows.find((row) => normalize(text(row?.[0])) === "dias en el mes");
  return header?.findIndex((cell) => normalize(text(cell)) === "total") ?? -1;
}

function snapshotOf(
  rows: Cell[][],
  dayColumns: number[],
  days: number,
  channels: ChannelRow[],
): ImportedValues {
  const cells: Record<string, (number | null)[]> = {};
  const aggregates: Record<string, number | null> = {};
  const totalColumn = totalColumnOf(rows);

  const capture = (id: string, row: Cell[] | undefined) => {
    if (!row) {
      return;
    }
    cells[id] = dayColumns.slice(0, days).map((col) => {
      const value = row[col];
      return typeof value === "number" && Number.isFinite(value) ? value : null;
    });
    const total = row[totalColumn];
    if (typeof total === "number" && Number.isFinite(total)) {
      aggregates[id] = total;
    }
  };

  const metrics = metricRowsOf(rows);
  for (const { id, test } of SNAPSHOT_ROWS) {
    const source = id === "pax" || id === "cumulativePax" ? rows : metrics;
    capture(
      id,
      source.find((row) => test(normalize(text(row?.[0])))),
    );
  }

  const byId = new Map(channels.map((channel) => [channel.id, channel]));
  for (const { name, row } of channelRowsOf(rows)) {
    const id = slugify(name);
    if (byId.has(id) && !cells[`channel:${id}`]) {
      capture(`channel:${id}`, row);
    }
  }
  for (const [id, row] of roomRowsOf(rows)) {
    capture(id, row);
  }
  return { cells, aggregates };
}

/** The first number on the block's header line, i.e. "NUMERO DE NOCHES: 25". */
function declaredNights(headerRow: Cell[] | undefined): number | null {
  for (const cell of (headerRow ?? []).slice(1)) {
    if (typeof cell === "number" && Number.isFinite(cell)) {
      return cell;
    }
  }
  return null;
}

/**
 * Sheet columns holding day values, in day order. Read from the "Dias en el mes" row as a
 * contiguous run of 1–31 headers, which is what stops the TOTAL / Porcentaje / Promedio
 * columns from ever being mistaken for data.
 */
function dayColumnsOf(rows: Cell[][]): number[] {
  const header = rows.find((row) => normalize(text(row?.[0])) === "dias en el mes");
  if (!header) {
    return [];
  }
  const columns: number[] = [];
  for (let col = 1; col < header.length; col++) {
    if (!isDayHeader(header[col])) {
      break;
    }
    columns.push(col);
  }
  return columns;
}
