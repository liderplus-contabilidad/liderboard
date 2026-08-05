/**
 * Which columns of a `DatosGrid` are on screen, and which of them the workspace actually loaded.
 *
 * Both answers are needed twice — by the editable Datos table and by the printable report — and
 * both speak in COLUMN POSITIONS rather than period indices, because a year's Total sits in the
 * same list as its periods and only its position tells them apart.
 *
 * They live here rather than inline in a view for the same reason the chart cards do: two
 * derivations of one question drift, and a report that resolved coverage differently from the
 * screen would print a figure for a month nobody ever loaded.
 */
import { aggregateCoverage } from "./analytics/source";
import type { PeriodSlot } from "./analytics/types";
import type { DatosColumn, DatosGrid, DatosRow } from "./datos-types";
import type { Frequency } from "./types";

/**
 * How a header names a column.
 *
 * A Total column stays the full year even when a period mark bounds the columns — relabeled so
 * nobody reads it as the sum of what happens to be visible. With several years the suffix rides
 * along ("Total 25" → "Total año 25").
 *
 * It lives here rather than inside the Datos table because the printed report asks the same
 * question, and a report that named its columns differently from the screen would be describing a
 * different table.
 */
export function columnHeaderLabel(column: DatosColumn, trimmed: boolean): string {
  if (column.kind !== "total" || !trimmed) {
    return column.label;
  }
  return column.label.replace(/^Total/, "Total año");
}

/**
 * The positions the «Periodo» filter leaves visible; every one when nothing is marked.
 *
 * A Total is never trimmed: it is the year's total, not one of its periods.
 */
export function visibleColumnPositions(
  columns: readonly DatosColumn[],
  periods: readonly PeriodSlot[],
): number[] {
  if (periods.length === 0) {
    return columns.map((_, position) => position);
  }
  const marked = new Set(periods.map((period) => period.index));
  const positions: number[] = [];
  columns.forEach((column, position) => {
    if (column.kind === "total" || marked.has(column.index)) {
      positions.push(position);
    }
  });
  return positions;
}

export interface LoadedColumnsInput {
  columns: readonly DatosColumn[];
  /** Declared coverage per year — month indices, whatever the view's frequency. */
  loadedMonthsByYear: Readonly<Record<number, readonly number[]>>;
  /** The frequency the file provides; coverage is declared against it. */
  baseFrequency: Frequency;
  /** The frequency on screen — coarser than the base, never finer. */
  frequency: Frequency;
}

/**
 * The positions the workspace has actually loaded, or `null` when there is no restriction — a
 * single-statement workspace whose whole year always arrives at once.
 *
 * Coverage is resolved PER COLUMN against its OWN year: a month loaded in 2025 says nothing
 * about the same month of 2026. A Total is derived from whatever its year loaded, so it is never
 * itself "unloaded".
 */
export function loadedColumnPositions(input: LoadedColumnsInput): ReadonlySet<number> {
  const coveredByYear = new Map<number, ReadonlySet<number>>();
  const positions = new Set<number>();

  input.columns.forEach((column, position) => {
    if (column.kind === "total") {
      positions.add(position);
      return;
    }
    let covered = coveredByYear.get(column.year);
    if (!covered) {
      covered = aggregateCoverage(
        new Set(input.loadedMonthsByYear[column.year] ?? []),
        input.baseFrequency,
        input.frequency,
      );
      coveredByYear.set(column.year, covered);
    }
    if (covered.has(column.index)) {
      positions.add(position);
    }
  });
  return positions;
}

/**
 * The grid with only the columns at `positions`, cells realigned to them.
 *
 * The screen never needs this — `DatosTable` renders positions out of the full grid and leaves the
 * cells where they are. The printed report does: it hands the table a grid whose `columns[i]` IS
 * the i-th printed column, so nothing downstream has to carry a position map into a `<colgroup>`
 * that already speaks in order.
 */
export function sliceColumns(grid: DatosGrid, positions: readonly number[]): DatosGrid {
  if (positions.length === grid.columns.length) {
    return grid;
  }
  return {
    ...grid,
    columns: positions.map((position) => grid.columns[position] as DatosColumn),
    rows: sliceRows(grid.rows, positions),
  };
}

function sliceRows(rows: readonly DatosRow[], positions: readonly number[]): DatosRow[] {
  return rows.map((row) => ({
    ...row,
    cells: positions.map((position) => row.cells[position] ?? { value: null }),
    ...(row.children ? { children: sliceRows(row.children, positions) } : {}),
  }));
}
