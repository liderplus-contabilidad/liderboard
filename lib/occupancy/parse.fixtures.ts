/** Mirror the STRUCTURE of the real exports with invented data, so no customer file is needed. */
import * as XLSX from "xlsx";

export type FixtureCell = string | number | null;

export interface MonthBlockSpec {
  /** As written in column A after "MES:", e.g. "ENERO". */
  name: string;
  /** The block's declared "NUMERO DE NOCHES". */
  nights?: number;
  /** Day headers emitted in row 2 of the block. Defaults to 1..3. */
  dayHeaders?: number[];
  available?: number[];
  revenue?: number[];
  sold?: number[];
  complimentary?: number[];
  cancellations?: number[];
  noShows?: number[];
  noShowsOta?: number[];
  /** [label, per-day values] — repeat a label to reproduce the duplicated-row defect. */
  channels?: [string, number[]][];
  rooms?: { simples?: number[]; dobles?: number[]; triples?: number[] };
  /** Defaults to simples·1 + dobles·2 + triples·3 — i.e. no override. */
  pax?: number[];
  /** Row label → the number to place in the TOTAL column, instead of an uncached formula. */
  totals?: Record<string, number>;
}

const DEFAULT_DAYS = [1, 2, 3];

/** Column AG, where every real block puts its TOTAL however many day columns it emitted. */
const TOTAL_COL = 32;

/**
 * Every data row ends with a TOTAL cell holding a formula STRING, exactly what SheetJS yields for
 * the real files' uncached `SUM(...)`: a parser trusting that column reads text, not a number.
 */
export function monthBlock(spec: MonthBlockSpec): FixtureCell[][] {
  const days = spec.dayHeaders ?? DEFAULT_DAYS;
  const width = days.length;

  const row = (label: string, values: number[] | undefined): FixtureCell[] => {
    const cells: FixtureCell[] = [
      label,
      ...Array.from({ length: width }, (_, i) => values?.[i] ?? 0),
    ];
    while (cells.length < TOTAL_COL) {
      cells.push(null);
    }
    // A number when the spec declares one, else the uncached formula string the real files hold.
    cells.push(spec.totals?.[label] ?? `SUM(B:${label})`);
    return cells;
  };

  const channels = spec.channels ?? [];
  const rooms = spec.rooms ?? {};

  return [
    ["MES:  " + spec.name, "NUMERO DE NOCHES:", null, null, spec.nights ?? width],
    [
      "Dias en el mes",
      ...days,
      ...new Array<FixtureCell>(Math.max(0, TOTAL_COL - days.length - 1)).fill(null),
      "TOTAL",
      "Porcentaje",
      "Promed",
    ],
    row("Num de Habitaciones que tiene el hotel para la venta/día", spec.available),
    row("Total de Ingresos ($$) en Habitaciones", spec.revenue),
    row("Numero de Habitaciones vendidas y cobradas*", spec.sold),
    row("Número de Habitaciones Complementarias**", spec.complimentary),
    row("Cancelaciones (noches en el mes)***", spec.cancellations),
    row("No Shows  (Habitaciones)", spec.noShows),
    row("No Shows OTAS", spec.noShowsOta),
    // Indicator rows the parser must ignore. They all carry the same impossible marker so
    // a single `not.toContain(999)` proves none of them leaked into the stored inputs.
    row("ADR (Tarifa Promedio)", [999, 999, 999]),
    row("Ocupacion %", [999, 999, 999]),
    row("RevPAR", [999, 999, 999]),
    row("%  ACUMULADO DIARIO", [999, 999, 999]),
    ["% OCUPACION ACUMULADA 2021"],
    row("Diferencia", [999, 999, 999]),
    ["Cantidades por día"],
    ...channels.map(([label, values]) => row(label, values)),
    row("TOTAL", undefined),
    ["Habitaciones"],
    row("Simples", rooms.simples),
    row("Dobles", rooms.dobles),
    row("Triples", rooms.triples),
    row("TOTAL", undefined),
    row(
      "PAX TOTALES",
      spec.pax ??
        Array.from(
          { length: width },
          (_, i) =>
            (rooms.simples?.[i] ?? 0) +
            2 * (rooms.dobles?.[i] ?? 0) +
            3 * (rooms.triples?.[i] ?? 0),
        ),
    ),
    row("PAX ACUMULADOS", [999, 999, 999]),
    [null, "OK", "OK", "OK"],
    [null],
  ];
}

export interface SheetSpec {
  /** The title line; the real files carry the year in it. */
  title?: string;
  /** The hotel line, right under the title. Omit to reproduce the older format. */
  hotel?: string;
  /** Under the hotel. Omit for a hotel with no cost centers. */
  center?: string;
}

/**
 * A `center` without a `hotel` is not expressible ON PURPOSE: the parser reads the two name lines
 * BY POSITION, so the second only means "center" when the first is the hotel.
 */
export function occupancySheet(blocks: FixtureCell[][][], spec: SheetSpec = {}) {
  const names: FixtureCell[][] = [];
  if (spec.hotel) {
    names.push([spec.hotel]);
  }
  if (spec.center) {
    names.push([spec.center]);
  }
  return [[spec.title ?? "Ocupación  - 2026"], ...names, [null], ...blocks.flat()];
}

/** Round-trips an AoA through a real workbook so parse tests exercise XLSX.read. */
export function aoaToXlsxBuffer(aoa: FixtureCell[][]): ArrayBuffer {
  const sheet = XLSX.utils.aoa_to_sheet(aoa);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "Hoja1");
  return XLSX.write(workbook, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
}
