/**
 * Sueldos por Áreas' grid: from the client's períodos, their nóminas and the bar's marks, to the table
 * that is drawn. Pure, and therefore testable against the accountant's sheet.
 *
 * The three rules that hold up the reading and that is why they live here and not in a component:
 *
 *   1. **A column exists only if its PERÍODO exists.** A month nobody registered is not a month at
 *      zero: the app can claim nothing about it, so it produces no column.
 *   2. **An empty cell is not a zero.** `null` is «this row was not in that month's nómina» —whoever
 *      had not joined yet, the area that had nobody that month— and `0` is a real zero, asserted by a
 *      record that was there. Painting them alike would make a gap indistinguishable from a real fall,
 *      which is the same distinction PyG holds up with its coverage.
 *   3. **The total sums THE ROWS PRESENT**, not the universe. With two areas marked it is those two's:
 *      a closing row that does not square with what is above it cannot be checked by eye, and checking
 *      it against their own Excel is exactly what this screen exists for.
 *
 * The MODE is not a separate state but a reading of the marks (`resolveAreaMode`): exactly one area
 * marked gives the per-employee detail, anything else gives the consolidado by area. A mode stored
 * next to the marks could contradict them —being left in «detail» with no area—, and the bar would
 * have two controls for one decision.
 */
import { MONTHS_SHORT_ES } from "@/lib/date";
import { areaKey, areaOptions } from "../areas";
import { computeLinePayroll } from "../employee-input";
import type { PayrollParameters } from "../engine/parameters";
import type { PayrollEmployeeLine } from "../types";
import { passes, type SalariesFilters, type SalariesUniverse } from "./filters";
import { employeeKey } from "./identity";

/** A período, reduced to what the grid needs from it. */
export interface SalariesPeriodRef {
  id: string;
  year: number;
  /** 0–11, as in the rest of the app. */
  monthIndex: number;
}

export interface SalariesColumn {
  year: number;
  monthIndex: number;
  /** «Ene» with a single year in sight, «Ene 25» with several — the rule of PyG's `DatosColumn`. */
  label: string;
}

export interface SalariesRow {
  /** Stable between renders: the area's key or the employee's, never their position. */
  id: string;
  label: string;
  /** The job title, in the per-employee detail. Absent on the area rows. */
  sublabel?: string;
  /** One value per column. `null` = the row was not in that período's nómina. */
  values: (number | null)[];
}

/** Consolidado by area, or the detail of ONE area by employee. */
export type SalariesMode = "consolidado" | "detalle";

export interface SalariesGrid {
  mode: SalariesMode;
  /** The detail's area, with the universe's spelling; `null` in consolidado. */
  area: string | null;
  columns: SalariesColumn[];
  rows: SalariesRow[];
  /** The closing row. `null` when there is no row to close. */
  total: SalariesRow | null;
}

/** What the grid reads: the períodos and each one's nómina. */
export interface SalariesSource {
  periods: readonly SalariesPeriodRef[];
  /** Each período's records, indexed by `periodId`. A período absent from the map is a período with
   *  no nómina, which is different from a período that does not exist. */
  linesByPeriod: ReadonlyMap<string, readonly PayrollEmployeeLine[]>;
}

/**
 * The universe the marks are pruned against.
 *
 * It is computed over ALL the client's períodos and not over the ones the marks let through: if the
 * universe of areas depended on the year marks, marking a year could erase an area mark and the bar
 * would reorganize itself under the pointer. That way, besides, marking an area with no data in the
 * visible range is a legitimate state —the screen says so— instead of a mark that evaporates.
 */
export function salariesUniverse(source: SalariesSource): SalariesUniverse {
  const lines = [...source.linesByPeriod.values()].flat();
  const present = new Set(lines.map((line) => areaKey(line.area)));
  return {
    areas: areaOptions(lines).filter((area) => present.has(areaKey(area))),
    years: [...new Set(source.periods.map((period) => period.year))].sort((a, b) => a - b),
    months: [...new Set(source.periods.map((period) => period.monthIndex))].sort((a, b) => a - b),
  };
}

/**
 * The mode, read off the marks: **exactly one** area marked gives that area's detail; none or several
 * give the consolidado.
 *
 * It is the same figure PyG already writes for «Centro de costo» and «Año» (`resolveActiveCenterId`),
 * and what keeps the screen from having a second place to pick the area.
 */
export function resolveAreaMode(filters: SalariesFilters): {
  mode: SalariesMode;
  area: string | null;
} {
  return filters.areas.length === 1
    ? { mode: "detalle", area: filters.areas[0] }
    : { mode: "consolidado", area: null };
}

/** The períodos that survive the year and month marks, in ascending chronological order. */
function visiblePeriods(
  periods: readonly SalariesPeriodRef[],
  filters: SalariesFilters,
): SalariesPeriodRef[] {
  return periods
    .filter(
      (period) => passes(filters.years, period.year) && passes(filters.months, period.monthIndex),
    )
    .sort((a, b) => a.year - b.year || a.monthIndex - b.monthIndex);
}

function buildColumns(periods: readonly SalariesPeriodRef[]): SalariesColumn[] {
  const multiYear = new Set(periods.map((period) => period.year)).size > 1;
  return periods.map((period) => ({
    year: period.year,
    monthIndex: period.monthIndex,
    label: multiYear
      ? `${MONTHS_SHORT_ES[period.monthIndex]} ${String(period.year).slice(-2)}`
      : MONTHS_SHORT_ES[period.monthIndex],
  }));
}

/** A record's employer cost: the book's `AY` column, always derived by the engine. The bonus rows
 *  travel inside the capture, so nothing needs to be brought from the período. */
function costOf(line: PayrollEmployeeLine, parameters: PayrollParameters): number {
  return computeLinePayroll(line, parameters).employerCost;
}

/**
 * A row survives if it has at least one value in the visible columns. A whole row of gaps says nothing
 * the absence of the row does not say just as well, and in the consolidado it would fill the table
 * with areas this range never saw.
 */
function hasAnyValue(values: readonly (number | null)[]): boolean {
  return values.some((value) => value !== null);
}

/**
 * The consolidado: one row per area, with each month's cost summed under the area THAT período's
 * record declares. An employee who changed area mid-year adds up in each month where they were, which
 * is what keeps the sum of the areas being the whole nómina.
 */
function buildAreaRows(
  source: SalariesSource,
  periods: readonly SalariesPeriodRef[],
  filters: SalariesFilters,
  parameters: PayrollParameters,
): SalariesRow[] {
  // The order is the universe's (the standard ones first), not the order of appearance: taking it
  // from the nómina would reorder the rows on loading another month.
  const order = salariesUniverse(source).areas.filter((area) => passes(filters.areas, area));

  return order
    .map((area) => {
      const key = areaKey(area);
      const values = periods.map((period) => {
        const own = (source.linesByPeriod.get(period.id) ?? []).filter(
          (line) => areaKey(line.area) === key,
        );
        // No record of that area that month: a gap, not a zero.
        return own.length === 0
          ? null
          : own.reduce((sum, line) => sum + costOf(line, parameters), 0);
      });
      return { id: `area:${key}`, label: area, values };
    })
    .filter((row) => hasAnyValue(row.values));
}

/**
 * One area's detail: one row per employee, alphabetically.
 *
 * A month in which the person was in ANOTHER area is left empty, not at zero: under this area they had
 * no cost that month, and writing `$0.00` would claim they did receive zero here.
 *
 * The label and the job title are those of the most recent record among the visible ones — if the
 * accountant corrected a spelling or the employee changed job title, what is current is what one wants
 * to read.
 */
function buildEmployeeRows(
  source: SalariesSource,
  periods: readonly SalariesPeriodRef[],
  area: string,
  parameters: PayrollParameters,
): SalariesRow[] {
  const key = areaKey(area);
  const rows = new Map<string, { label: string; sublabel: string; values: (number | null)[] }>();

  periods.forEach((period, column) => {
    for (const line of source.linesByPeriod.get(period.id) ?? []) {
      const id = employeeKey(line);
      // A record with neither cédula NOR name cannot be labelled, so it cannot be a row.
      if (id === null || areaKey(line.area) !== key) {
        continue;
      }
      const row = rows.get(id) ?? {
        label: line.name,
        sublabel: line.role,
        values: Array<number | null>(periods.length).fill(null),
      };
      // The períodos are walked in ascending order, so the last pass is the most recent one.
      row.label = line.name;
      row.sublabel = line.role;
      row.values[column] = (row.values[column] ?? 0) + costOf(line, parameters);
      rows.set(id, row);
    }
  });

  return [...rows.entries()]
    .map(([id, row]) => ({ id, label: row.label, sublabel: row.sublabel, values: row.values }))
    .sort((a, b) => a.label.localeCompare(b.label, "es", { sensitivity: "base" }));
}

/**
 * The closing row: the sum of the rows present, column by column. `null` in a column where no row has
 * a value —there is nothing to total— and `null` entirely when there are no rows.
 */
function buildTotalRow(rows: readonly SalariesRow[], mode: SalariesMode): SalariesRow | null {
  if (rows.length === 0) {
    return null;
  }
  const values = rows[0].values.map((_, column) => {
    const present = rows.map((row) => row.values[column]).filter((value) => value !== null);
    return present.length === 0 ? null : present.reduce((sum, value) => sum + value, 0);
  });
  return {
    id: "total",
    // «SUBTOTAL» is what the accountant's sheet labels the close of an area with; «SUMAN» closes the
    // whole book and here there is no more than one area to close, so it is superfluous.
    label: mode === "detalle" ? "SUBTOTAL" : "TOTAL",
    values,
  };
}

export function buildSalariesGrid(
  source: SalariesSource,
  filters: SalariesFilters,
  parameters: PayrollParameters,
): SalariesGrid {
  const { mode, area } = resolveAreaMode(filters);
  const periods = visiblePeriods(source.periods, filters);
  const rows =
    mode === "detalle" && area !== null
      ? buildEmployeeRows(source, periods, area, parameters)
      : buildAreaRows(source, periods, filters, parameters);

  return {
    mode,
    area,
    columns: buildColumns(periods),
    rows,
    total: buildTotalRow(rows, mode),
  };
}
