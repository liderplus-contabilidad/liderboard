/**
 * The marks of the «Ventas por servicio» bar: **Año** and **Mes**, and nothing else. There is no
 * «Cuenta contable» and no «Centro de costo» because neither means anything about an invoice, which is
 * exactly why this is not a fourth tab of PyG.
 *
 * **Both are MULTIPLE-mark, and the year is because the year-on-year comparison is the most useful
 * question of a sales report**: «April 2026 against April 2025». It was born single-choice with the
 * argument that two years would have no axis to be drawn on, and that was false — the axis is the
 * twelve months and each YEAR is a series, which is the figure Ocupaciones and PyG already use.
 *
 * The MONTH is independent of the year: a mark of «Abr» narrows the axis of ALL the marked years
 * instead of picking one's April, which is what makes the comparison mean something. It is the same
 * rule by which a `PeriodSlot` of PyG is not a `PeriodRef`.
 *
 * **`years` is never left empty**, and there it deliberately departs from the house rule: «no mark is
 * all of them» would turn the entry screen into the sum of three exercises, and a card that opens
 * saying «Venta total $3.1M» of three years at once reads badly before anyone touches a filter. With
 * no marks it resolves to the MOST RECENT year, which is the last thing the firm loaded.
 */
import { MONTHS_FULL_ES, MONTHS_SHORT_ES } from "@/lib/date";

export interface SalesFilters {
  /** Marked years, ascending. Empty resolves to the most recent on read, never to «all». */
  years: number[];
  /** Indices 0–11, in order. Empty = every LOADED month of the marked years. */
  months: number[];
  /**
   * Marked service CODES, verbatim (`\\01`) and in the universe's order. Empty is ALL of them — the
   * house rule the year is the only exception to.
   *
   * It narrows the WHOLE screen and not one card, which is why it is a mark of the bar and not a
   * control in a header: the question it answers is «Farmacia: cuánto, quién la paga y cómo
   * evoluciona», and that has to be heard by the tiles and the three readings at once.
   */
  services: string[];
}

/** A service of the universe: its code is the identity, its name is what the dropdown shows. */
export interface SalesServiceRef {
  code: string;
  name: string;
}

/** What the client has, and what the marked years allow choosing. */
export interface SalesUniverse {
  /** Every loaded year, ascending. */
  years: number[];
  /** The months loaded IN THE MARKED YEARS — the union, not the intersection: a month only one of the
   *  years has is still a month that can be looked at, and the comparison will say the other one is
   *  missing it. */
  months: number[];
  /**
   * The services of the MARKED YEARS, largest to smallest, and deliberately not those of the span
   * «Mes» narrows to: marking a month a service did not sell must not erase it from the list you
   * unmark it from. It is the same rule by which PyG reads its years off the universe and not off the
   * narrowed sum.
   */
  services: SalesServiceRef[];
}

export function emptyFilters(): SalesFilters {
  return { years: [], months: [], services: [] };
}

/**
 * Pruned against what the client has NOW, on READ and never in an effect: switching client cannot
 * leave a render marking a year this client does not have.
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
    services: universe.services
      .map((service) => service.code)
      .filter((code) => filters.services.includes(code)),
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
  // The months SURVIVE a change of year, the opposite of when the year was single-choice: a mark of
  // «Abr» no longer means «April 2026» but «April», so removing a year does not invalidate it. What
  // does prune it is `sanitizeFilters`, if that month stops existing in what is marked.
  return { ...filters, years: universe.filter((entry) => marked.has(entry)) };
}

/** Marks ALL the years. It is not «emptying the list»: here an empty list means «the most recent»,
 *  so the shortcut has to populate it for real. */
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

export function withServiceToggled(
  filters: SalesFilters,
  code: string,
  universe: readonly string[],
): SalesFilters {
  const marked = new Set(filters.services);
  if (marked.has(code)) {
    marked.delete(code);
  } else {
    marked.add(code);
  }
  return { ...filters, services: universe.filter((entry) => marked.has(entry)) };
}

export function withServicesCleared(filters: SalesFilters): SalesFilters {
  return { ...filters, services: [] };
}

/**
 * What the marked services are CALLED — the one wording of the narrowing, which the subtitles and the
 * notes of the three cards read so none of them names a different slice from the one beside it.
 *
 * With one it is its NAME, which is what the reader recognises against their own report; with several
 * it says how many of how many, because four service names do not fit in a subtitle. An orphan mark
 * —one this client does not have— is worth none: emptying the wording would be worse than not
 * narrowing, the same defence `sanitizeFilters` mounts.
 */
export function describeServiceScope(
  filters: SalesFilters,
  universe: SalesUniverse,
): string | null {
  const marked = universe.services.filter((service) => filters.services.includes(service.code));
  if (marked.length === 0) {
    return null;
  }
  return marked.length === 1
    ? marked[0].name
    : `${marked.length} de ${universe.services.length} servicios`;
}

/**
 * The months the reading sums: the marked ones, or ALL the loaded ones of the marked years. It is the
 * only translation of the marks into the period, so the cards, the tiles and the report cannot end up
 * summing different spans.
 */
export function selectedMonths(filters: SalesFilters, universe: SalesUniverse): number[] {
  return filters.months.length > 0 ? filters.months : universe.months;
}

/**
 * The period in plain Spanish — what the tiles, each card's subtitle and the report's header say, so
 * nothing on the screen names a different span from the one beside it.
 *
 * A set of months with gaps is ENUMERATED («Ene, Mar, Abr») instead of asserting a range: «Ene–Abr»
 * would say February is summed, `periodRangeLabel`'s same rule in PyG. With SEVERAL years the months
 * are written once and the years behind them («Abr · 2025, 2026»), because repeating «abril» for each
 * year is precisely what makes a comparison label illegible.
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
    // With a single year the month goes in full («Abril 2026»); with several, abbreviated, because
    // the label already carries the list of years.
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
 * How many marks are set — what decides whether the chip strip is drawn. It counts the MONTHS and the
 * SERVICES, never the years: `years` is never empty, so a year chip could not always be removed, and
 * its dropdown already shows the whole selection in its label.
 */
/**
 * The period with the marked slice IN FRONT — the one composition of the two, read by the tiles, by
 * the three cards' subtitles and by the report's header. Two of them would let the screen and the
 * paper name the same reading differently.
 */
export function scopedPeriodLabel(scope: string | null, period: string): string {
  return scope ? `${scope} · ${period}` : period;
}

export function activeMarkCount(filters: SalesFilters): number {
  return filters.months.length + filters.services.length;
}
