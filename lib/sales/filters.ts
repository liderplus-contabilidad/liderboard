/**
 * Las marcas de la barra de «Ventas por servicio»: **Año** y **Mes**, y nada más. No hay «Cuenta
 * contable» ni «Centro de costo» porque ninguna de las dos significa nada sobre una factura, que
 * es exactamente el motivo por el que esto no es una cuarta pestaña de PyG.
 *
 * **Los dos son de marca MÚLTIPLE, y el año lo es porque la comparación interanual es la pregunta
 * más útil de un informe de ventas**: «abril de 2026 contra abril de 2025». Nació de elección única
 * con el argumento de que dos años no tendrían eje sobre el que dibujarse, y eso era falso — el eje
 * son los doce meses y cada AÑO es una serie, que es la figura que Ocupaciones y PyG ya usan.
 *
 * El MES es independiente del año: una marca de «Abr» acota el eje de TODOS los años marcados en
 * vez de elegir el abril de uno, que es lo que hace que la comparación signifique algo. Es la misma
 * regla por la que un `PeriodSlot` de PyG no es un `PeriodRef`.
 *
 * **`years` nunca queda vacío**, y ahí se separa de la regla de la casa a propósito: «ninguna marca
 * es todas» convertiría la pantalla de entrada en la suma de tres ejercicios, y una tarjeta que
 * abre diciendo «Venta total $3,1M» de tres años a la vez se lee mal antes de que nadie toque un
 * filtro. Sin marcas se resuelve al año MÁS RECIENTE, que es lo último que la firma cargó.
 */
import { MONTHS_FULL_ES, MONTHS_SHORT_ES } from "@/lib/date";

export interface SalesFilters {
  /** Años marcados, ascendentes. Vacío se resuelve al más reciente al leer, nunca a «todos». */
  years: number[];
  /** Índices 0–11, en orden. Vacío = todos los meses CARGADOS de los años marcados. */
  months: number[];
}

/** Lo que el cliente tiene, y lo que los años marcados dejan elegir. */
export interface SalesUniverse {
  /** Todos los años cargados, ascendentes. */
  years: number[];
  /** Los meses cargados EN LOS AÑOS MARCADOS — la unión, no la intersección: un mes que solo tiene
   *  uno de los años sigue siendo un mes que se puede mirar, y la comparación dirá que al otro le
   *  falta. */
  months: number[];
}

export function emptyFilters(): SalesFilters {
  return { years: [], months: [] };
}

/**
 * Poda contra lo que el cliente tiene AHORA, en la LECTURA y nunca en un efecto: cambiar de cliente
 * no puede dejar un render marcando un año que este cliente no tiene.
 */
export function sanitizeFilters(filters: SalesFilters, universe: SalesUniverse): SalesFilters {
  const years = universe.years.filter((year) => filters.years.includes(year));
  const resolved = years.length > 0 ? years : universe.years.slice(-1);
  const available = new Set(universe.months);
  return {
    years: resolved,
    months: universe.months.filter(
      (month) => available.has(month) && filters.months.includes(month),
    ),
  };
}

export function withYearToggled(
  filters: SalesFilters,
  year: number,
  universe: readonly number[],
): SalesFilters {
  const marked = new Set(filters.years);
  if (marked.has(year)) {
    marked.delete(year);
  } else {
    marked.add(year);
  }
  // Los meses SOBREVIVEN al cambio de año, al revés que cuando el año era de elección única: una
  // marca de «Abr» ya no significa «el abril de 2026» sino «abril», así que quitar un año no la
  // invalida. Lo que sí la poda es `sanitizeFilters`, si ese mes deja de existir en lo marcado.
  return { ...filters, years: universe.filter((entry) => marked.has(entry)) };
}

/** Marca TODOS los años. No es «vaciar la lista»: aquí una lista vacía significa «el más
 *  reciente», así que el atajo tiene que poblarla de verdad. */
export function withAllYears(filters: SalesFilters, universe: readonly number[]): SalesFilters {
  return { ...filters, years: [...universe] };
}

export function withMonthToggled(
  filters: SalesFilters,
  month: number,
  universe: readonly number[],
): SalesFilters {
  const marked = new Set(filters.months);
  if (marked.has(month)) {
    marked.delete(month);
  } else {
    marked.add(month);
  }
  return { ...filters, months: universe.filter((entry) => marked.has(entry)) };
}

export function withMonthsCleared(filters: SalesFilters): SalesFilters {
  return { ...filters, months: [] };
}

/**
 * Los meses que la lectura suma: los marcados, o TODOS los cargados de los años marcados. Es la
 * única traducción de las marcas al periodo, así que las tarjetas, los tiles y el informe no pueden
 * acabar sumando tramos distintos.
 */
export function selectedMonths(filters: SalesFilters, universe: SalesUniverse): number[] {
  return filters.months.length > 0 ? filters.months : universe.months;
}

/**
 * El periodo en castellano llano — lo que dicen los tiles, el subtítulo de cada tarjeta y la
 * cabecera del informe, para que nada de la pantalla nombre un tramo distinto del de al lado.
 *
 * Un conjunto de meses con huecos se ENUMERA («Ene, Mar, Abr») en vez de afirmar un rango: «Ene–Abr»
 * diría que febrero está sumado, la misma regla de `periodRangeLabel` en PyG. Con VARIOS años los
 * meses se escriben una sola vez y los años detrás («Abr · 2025, 2026»), porque repetir «abril» por
 * cada año es justo lo que hace ilegible un rótulo de comparación.
 */
export function periodLabel(months: readonly number[], years: readonly number[]): string {
  if (years.length === 0) {
    return "Sin datos";
  }
  const yearsLabel = [...years].sort((a, b) => a - b).join(", ");
  if (months.length === 0) {
    return yearsLabel;
  }
  const single = years.length === 1;
  if (months.length === 1) {
    // Con un solo año el mes va entero («Abril 2026»); con varios, abreviado, porque el rótulo ya
    // carga la lista de años.
    return single
      ? `${MONTHS_FULL_ES[months[0]]} ${yearsLabel}`
      : `${MONTHS_SHORT_ES[months[0]]} · ${yearsLabel}`;
  }
  const sorted = [...months].sort((a, b) => a - b);
  const contiguous = sorted[sorted.length - 1] - sorted[0] === sorted.length - 1;
  const monthsLabel = contiguous
    ? `${MONTHS_SHORT_ES[sorted[0]]}–${MONTHS_SHORT_ES[sorted[sorted.length - 1]]}`
    : sorted.map((month) => MONTHS_SHORT_ES[month]).join(", ");
  return single ? `${monthsLabel} ${yearsLabel}` : `${monthsLabel} · ${yearsLabel}`;
}

/**
 * Cuántas marcas hay puestas — lo que decide si la tira de chips se dibuja. Cuenta solo los MESES:
 * `years` nunca está vacío, así que un chip de año no siempre se podría quitar, y el desplegable ya
 * enseña la selección entera en su rótulo.
 */
export function activeMarkCount(filters: SalesFilters): number {
  return filters.months.length;
}
