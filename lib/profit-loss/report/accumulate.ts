/**
 * The printed report's column axis: one ACCUMULATED column per year, never one per period.
 *
 * The screen and the Excel already answer «cuánto en cada mes» — thirteen columns of figures is a
 * table you consult, and consulting is what a spreadsheet is for. A report is read, and what it is
 * read for is «cuánto en lo que va del periodo, y contra qué». So the report accumulates: the
 * periods it covers collapse into one figure per year, and the years sit side by side.
 *
 * That is not only an editorial choice, it is what makes the page work. Thirteen columns of
 * «-$171,420» need ~600 px of digits; A4 offers 688 px of usable width and the account names have
 * to live in there too. Four columns fit A4 VERTICAL with room to spare, which is what removed the
 * landscape pages, their `@page` rule, and the whole class of «cabe impreso pero no en la previa».
 *
 * **Comparability is the one rule with teeth.** The report's period is the NEWEST year's covered
 * span; every other year is trimmed to those same period indices so that the two columns answer
 * the same question. A year that cannot cover them is DROPPED with a note rather than accumulated
 * partially — «2025» summed over eight months next to «2026» summed over six is not a comparison,
 * it is a wrong number that looks like one.
 */
import { periodLabel } from "../analytics/period";
import type { DatosColumn, DatosGrid, DatosRow } from "../datos-types";
import { formatList } from "@/lib/format";
import type { Frequency } from "../types";

/** One accumulated column: a year, and the span of that year it sums. */
export interface AccumulatedPeriod {
  year: number;
  /** Positions in the SOURCE grid's `columns` that were summed into this one. */
  positions: number[];
  /** Period indices covered, ascending — what makes two years comparable. */
  indices: number[];
  /** The span without its year: «Ene–Jun», «Ene», «6 periodos». */
  spanLabel: string;
  /** The column header: «Acum. Ene–Jun 2026». */
  label: string;
}

export interface AccumulatedStatement {
  /**
   * Newest year first: `[0]` is the report's period and the rest are its comparatives. Empty
   * when the workspace has nothing loaded inside the visible columns.
   */
  periods: AccumulatedPeriod[];
  /** The grid with one column per entry of `periods`; rows, tree and result rows untouched. */
  grid: DatosGrid;
  /** What the reader has to be told about the comparison — at most one note per cause. */
  notes: string[];
}

export interface AccumulateInput {
  grid: DatosGrid;
  /** Positions the «Periodo» filter leaves visible. */
  visibleColumns: readonly number[];
  /** Positions the workspace actually loaded; `null` = no restriction (single mode). */
  loadedColumns: ReadonlySet<number> | null;
  /** The granularity on screen — what names a period on the header. */
  frequency: Frequency;
}

export function accumulateStatement(input: AccumulateInput): AccumulatedStatement {
  const byYear = groupPeriodsByYear(input);
  const years = [...byYear.keys()].sort((a, b) => b - a);

  if (years.length === 0) {
    return { periods: [], grid: { ...input.grid, columns: [] }, notes: [NOTHING_LOADED] };
  }

  // The newest year sets the question; every other year answers the SAME one or none at all.
  const primaryYear = years[0] as number;
  const primary = byYear.get(primaryYear) as ColumnRef[];
  const wanted = new Set(primary.map((column) => column.index));

  const notes: string[] = [];
  const periods: AccumulatedPeriod[] = [describe(primaryYear, primary, input.frequency)];

  for (const year of years.slice(1)) {
    const trimmed = (byYear.get(year) as ColumnRef[]).filter((column) => wanted.has(column.index));
    if (trimmed.length < wanted.size) {
      notes.push(missingNote(year, primary, trimmed, input.frequency));
      continue;
    }
    periods.push(describe(year, trimmed, input.frequency));
  }

  return {
    periods,
    grid: {
      ...input.grid,
      columns: periods.map(toColumn),
      rows: accumulateRows(input.grid.rows, periods),
    },
    notes,
  };
}

const NOTHING_LOADED =
  "No hay ningún periodo cargado dentro de lo que muestra el informe; la tabla queda vacía.";

/** A period column of the source grid, kept with the position it came from. */
interface ColumnRef {
  position: number;
  index: number;
}

/**
 * The period columns worth accumulating, per year: visible to the «Periodo» filter AND loaded by
 * the workspace. A year's own Total column is skipped — it is a sum of the WHOLE year, and the
 * report's period is only sometimes the whole year.
 */
function groupPeriodsByYear(input: AccumulateInput): Map<number, ColumnRef[]> {
  const visible = new Set(input.visibleColumns);
  const byYear = new Map<number, ColumnRef[]>();

  input.grid.columns.forEach((column, position) => {
    if (column.kind !== "period" || !visible.has(position)) {
      return;
    }
    if (input.loadedColumns !== null && !input.loadedColumns.has(position)) {
      return;
    }
    const list = byYear.get(column.year);
    if (list) {
      list.push({ position, index: column.index });
    } else {
      byYear.set(column.year, [{ position, index: column.index }]);
    }
  });

  for (const list of byYear.values()) {
    list.sort((a, b) => a.index - b.index);
  }
  return byYear;
}

function describe(year: number, columns: ColumnRef[], frequency: Frequency): AccumulatedPeriod {
  const indices = columns.map((column) => column.index);
  const spanLabel = describeSpan(year, indices, frequency);
  return {
    year,
    positions: columns.map((column) => column.position),
    indices,
    spanLabel,
    label: `Acum. ${spanLabel} ${year}`,
  };
}

/**
 * How the header names the span. A contiguous run reads as a range — which is what a close almost
 * always is — and a scattered selection is spelled out while it is short enough to read, then
 * counted. The count is not a cop-out: «5 periodos» plus the cover's list of marked periods says
 * everything, and a header is not the place for a nine-item enumeration.
 */
function describeSpan(year: number, indices: readonly number[], frequency: Frequency): string {
  const labels = indices.map((index) => periodLabel({ year, frequency, index }));
  if (labels.length === 0) {
    return "";
  }
  if (labels.length === 1) {
    return labels[0] as string;
  }
  const first = indices[0] as number;
  const last = indices[indices.length - 1] as number;
  if (last - first + 1 === indices.length) {
    return `${labels[0]}–${labels[labels.length - 1]}`;
  }
  return labels.length <= 4 ? formatList(labels) : `${labels.length} periodos`;
}

/** Why a year is not on the table, naming the periods it is missing rather than just refusing. */
function missingNote(
  year: number,
  primary: readonly ColumnRef[],
  trimmed: readonly ColumnRef[],
  frequency: Frequency,
): string {
  const present = new Set(trimmed.map((column) => column.index));
  const missing = primary
    .filter((column) => !present.has(column.index))
    .map((column) => periodLabel({ year, frequency, index: column.index }));
  return `${year} no se compara: le falta ${formatList(missing)}. Un acumulado sobre menos periodos no es comparable con el de arriba.`;
}

/**
 * The accumulated column is a `"total"`, and that is exactly what it is: the total of the periods
 * it names. Its own year rides on it, like every column of this grid, so nothing downstream can
 * add one year to another.
 */
function toColumn(period: AccumulatedPeriod): DatosColumn {
  return { kind: "total", year: period.year, label: period.label };
}

function accumulateRows(
  rows: readonly DatosRow[],
  periods: readonly AccumulatedPeriod[],
): DatosRow[] {
  return rows.map((row) => ({
    ...row,
    cells: periods.map((period) => ({ value: total(row, period.positions) })),
    ...(row.children ? { children: accumulateRows(row.children, periods) } : {}),
  }));
}

/**
 * Σ of a row over the accumulated positions. A cell that is `null` inside a LOADED period is an
 * account with no entry that month, which adds nothing; a row that is `null` in every one of them
 * has no entry at all, and stays `null` rather than becoming a `$0` nobody posted.
 */
function total(row: DatosRow, positions: readonly number[]): number | null {
  let sum = 0;
  let seen = false;
  for (const position of positions) {
    const value = row.cells[position]?.value;
    if (value !== null && value !== undefined) {
      sum += value;
      seen = true;
    }
  }
  return seen ? sum : null;
}

/**
 * Change from `previous` to `current`, in %. `null` when there is nothing to divide by — a
 * variation against zero is infinite, not «100 %».
 *
 * The denominator is the ABSOLUTE value, so a loss shrinking from −100 to −50 reads as +50 % and
 * not as −50 %: the sign of a variation has to mean «mejoró/empeoró», and against a negative base
 * the raw quotient means the opposite.
 */
export function variationPct(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null || previous === 0) {
    return null;
  }
  return ((current - previous) / Math.abs(previous)) * 100;
}

/** A share of a base, in %; `null` when the base is missing or zero. Never a division by zero. */
export function sharePct(value: number | null, base: number | null): number | null {
  if (value === null || base === null || base === 0) {
    return null;
  }
  return (value / base) * 100;
}

/** The row an account code names, anywhere in the tree — what a percentage finds its base with. */
export function findRow(rows: readonly DatosRow[], code: string): DatosRow | undefined {
  for (const row of rows) {
    if (row.code === code) {
      return row;
    }
    const found = row.children ? findRow(row.children, code) : undefined;
    if (found) {
      return found;
    }
  }
  return undefined;
}
