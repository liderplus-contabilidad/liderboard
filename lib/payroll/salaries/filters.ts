/**
 * Sueldos por Áreas' marks: which areas, which years and which months are compared.
 *
 * Three flat lists and the same rules as the rest of the app (`lib/profit-loss/filters.ts`,
 * `lib/payroll/filters.ts`):
 *
 *   - **No mark is the same as ALL of them.** There is no «nothing selected» state that empties the
 *     screen; emptying a list is going back to the universe.
 *   - **The order is the UNIVERSE's, not the clicks'.** If the order were that of clicking, the rows
 *     and the columns would reorder themselves on unmarking and marking again.
 *   - **Pruning happens on READ, never in an effect.** Switching client cannot leave a render with
 *     marks for years that client does not have.
 *
 * What the three marks do NOT declare is the table's MODE: that marking exactly one area gives the
 * per-employee detail and anything else gives the consolidado is a rule of the grid
 * (`resolveAreaMode`), not of this file, because it is a reading of the marks and not a separate state
 * that could contradict them.
 */

export interface SalariesFilters {
  /** Marked areas, in the universe's order. Empty = all. */
  areas: string[];
  /** Marked years, ascending. Empty = all. */
  years: number[];
  /** Marked months (0–11), ascending. Empty = all. */
  months: number[];
}

/** The universe the marks are pruned against: what the active client actually has. */
export interface SalariesUniverse {
  areas: readonly string[];
  years: readonly number[];
  months: readonly number[];
}

export function emptyFilters(): SalariesFilters {
  return { areas: [], years: [], months: [] };
}

/** Mark or unmark, keeping the universe's order. */
function toggle<T>(picked: readonly T[], value: T, universe: readonly T[]): T[] {
  const next = new Set(picked);
  if (next.has(value)) {
    next.delete(value);
  } else {
    next.add(value);
  }
  return universe.filter((candidate) => next.has(candidate));
}

export function withAreaToggled(
  filters: SalariesFilters,
  area: string,
  universe: readonly string[],
): SalariesFilters {
  return { ...filters, areas: toggle(filters.areas, area, universe) };
}

export function withYearToggled(
  filters: SalariesFilters,
  year: number,
  universe: readonly number[],
): SalariesFilters {
  return { ...filters, years: toggle(filters.years, year, universe) };
}

export function withMonthToggled(
  filters: SalariesFilters,
  monthIndex: number,
  universe: readonly number[],
): SalariesFilters {
  return { ...filters, months: toggle(filters.months, monthIndex, universe) };
}

/** «Todas las áreas», «Todos los años», «Todos los meses»: empty the list, do not mark everything. */
export function withAreasCleared(filters: SalariesFilters): SalariesFilters {
  return { ...filters, areas: [] };
}

export function withYearsCleared(filters: SalariesFilters): SalariesFilters {
  return { ...filters, years: [] };
}

export function withMonthsCleared(filters: SalariesFilters): SalariesFilters {
  return { ...filters, months: [] };
}

/**
 * The marks pruned against the current universe and reordered like it.
 *
 * It returns the SAME object when there was nothing to prune and nothing to reorder, so a `useMemo`
 * downstream is not invalidated on every render.
 */
export function sanitizeFilters(
  filters: SalariesFilters,
  universe: SalariesUniverse,
): SalariesFilters {
  const areas = prune(filters.areas, universe.areas);
  const years = prune(filters.years, universe.years);
  const months = prune(filters.months, universe.months);
  const unchanged =
    same(areas, filters.areas) && same(years, filters.years) && same(months, filters.months);
  return unchanged ? filters : { areas, years, months };
}

function prune<T>(picked: readonly T[], universe: readonly T[]): T[] {
  const marked = new Set(picked);
  return universe.filter((candidate) => marked.has(candidate));
}

function same<T>(a: readonly T[], b: readonly T[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

/** Whether a mark lets a value through: the «none is all» rule, in a single place. */
export function passes<T>(picked: readonly T[], value: T): boolean {
  return picked.length === 0 || picked.includes(value);
}

/** How many marks are set in total — what decides whether the bar shows «quitar filtros». */
export function activeMarkCount(filters: SalariesFilters): number {
  return filters.areas.length + filters.years.length + filters.months.length;
}
