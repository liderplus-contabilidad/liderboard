/**
 * Las marcas de Sueldos por Áreas: qué áreas, qué años y qué meses se comparan.
 *
 * Tres listas planas y las mismas reglas que el resto de la app (`lib/profit-loss/filters.ts`,
 * `lib/payroll/filters.ts`):
 *
 *   - **Ninguna marca equivale a TODAS.** No hay un estado «nada seleccionado» que vacíe la
 *     pantalla; vaciar una lista es volver al universo.
 *   - **El orden es el del UNIVERSO, no el de los clicks.** Si el orden fuera el de pulsación, las
 *     filas y las columnas se reordenarían solas al desmarcar y volver a marcar.
 *   - **La poda ocurre en la LECTURA, nunca en un efecto.** Cambiar de cliente no puede dejar un
 *     render con marcas de años que ese cliente no tiene.
 *
 * Lo que las tres marcas NO declaran es el MODO de la tabla: que marcar exactamente un área dé el
 * detalle por empleado y cualquier otra cosa dé el consolidado es una regla del grid
 * (`resolveAreaMode`), no de este archivo, porque es una lectura de las marcas y no un estado
 * aparte que pueda contradecirlas.
 */

export interface SalariesFilters {
  /** Áreas marcadas, en el orden del universo. Vacío = todas. */
  areas: string[];
  /** Años marcados, ascendentes. Vacío = todos. */
  years: number[];
  /** Meses marcados (0–11), ascendentes. Vacío = todos. */
  months: number[];
}

/** El universo contra el que se podan las marcas: lo que el cliente activo realmente tiene. */
export interface SalariesUniverse {
  areas: readonly string[];
  years: readonly number[];
  months: readonly number[];
}

export function emptyFilters(): SalariesFilters {
  return { areas: [], years: [], months: [] };
}

/** Marcar o desmarcar, conservando el orden del universo. */
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

/** «Todas las áreas», «Todos los años», «Todos los meses»: vaciar la lista, no marcarlo todo. */
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
 * Las marcas podadas contra el universo vigente y reordenadas como él.
 *
 * Devuelve el MISMO objeto cuando no había nada que podar ni que reordenar, para que un `useMemo`
 * río abajo no se invalide en cada render.
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

/** Si una marca deja pasar un valor: la regla de «ninguna es todas», en un solo sitio. */
export function passes<T>(picked: readonly T[], value: T): boolean {
  return picked.length === 0 || picked.includes(value);
}

/** Cuántas marcas hay puestas en total — lo que decide si la barra enseña «quitar filtros». */
export function activeMarkCount(filters: SalariesFilters): number {
  return filters.areas.length + filters.years.length + filters.months.length;
}
