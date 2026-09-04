/**
 * The marks of the «Reportería de ingresos» bar: **Año** and **Mes**, and nothing else.
 *
 * There is no «Cuenta contable» because the reading IS one account —the raíz 4— and there is no
 * «Centro de costo» because the reading is of the COMPANY: the Excel this replaces compares what the
 * firm invoiced, not what one center did, so the module sums every center of the year (`mergeCenters`)
 * and never offers to narrow that. It is a decision, not an omission.
 *
 * **`years` follows the house rule: no mark is ALL of them**, and the screen opens with every loaded
 * year marked.
 *
 * It was born resolving to the most recent year instead —«Ventas por servicio»' declared exception—
 * on the argument that opening on five exercises at once reads badly. That argument does not hold
 * HERE, and the difference is what the two screens do with several years: over there they are SUMMED
 * into one total, so five years make one figure nobody asked for; here each year is its own series
 * and the comparison IS the reading — the workbook this replaces is precisely a matrix of every year
 * side by side.
 *
 * What the rule still guarantees is that the list is never EMPTY: unmarking the last year resolves
 * back to all of them rather than leaving a screen with nothing to draw.
 *
 * **The MONTH is independent of the year**: a mark of «Abr» narrows the axis of ALL the marked years
 * at once instead of picking one's April. That is precisely what makes a comparison comparable, and it
 * is the correction this module makes over the source workbook, whose TOTAL row compares seven months
 * of one year against twelve of another.
 */
import { MONTHS_FULL_ES, MONTHS_SHORT_ES } from "@/lib/date";
import { namedSpans, SPAN_KINDS, type NamedSpan, type SpanKind } from "@/lib/period";

export interface RevenueFilters {
  /** Marked years, ascending. Empty resolves to ALL of them on read, never to none. */
  years: number[];
  /** Indices 0–11, in order. Empty = every LOADED month of the marked years. */
  months: number[];
}

/** What the client has, and what the marked years allow choosing. */
export interface RevenueUniverse {
  /** Every year with at least one loaded month, ascending. */
  years: number[];
  /**
   * The months loaded IN THE MARKED YEARS — the union, not the intersection: a month only one of the
   * years has is still a month that can be looked at, and the comparison will say the other one is
   * missing it.
   */
  months: number[];
}

export function emptyFilters(): RevenueFilters {
  return { years: [], months: [] };
}

/**
 * Pruned against what the client has NOW, on READ and never in an effect: switching client cannot
 * leave a render marking a year this client does not have.
 */
export function sanitizeFilters(
  filters: RevenueFilters,
  universe: RevenueUniverse,
): RevenueFilters {
  const years = universe.years.filter((year) => filters.years.includes(year));
  // No mark is ALL of them, and that is also what keeps the list from ever being empty: unmarking the
  // last year gives every year back instead of leaving nothing to draw.
  const resolved = years.length > 0 ? years : [...universe.years];
  return {
    years: resolved,
    months: universe.months.filter((month) => filters.months.includes(month)),
  };
}

export function withYearToggled(
  filters: RevenueFilters,
  year: number,
  universe: readonly number[],
): RevenueFilters {
  const marked = new Set(filters.years);
  if (marked.has(year)) {
    marked.delete(year);
  } else {
    marked.add(year);
  }
  // The months SURVIVE a change of year: a mark of «Abr» means «April», not «April of 2026», so
  // removing a year does not invalidate it. What prunes it is `sanitizeFilters`, if that month stops
  // existing in what is marked. Kept in UNIVERSE order, never in click order.
  return { ...filters, years: universe.filter((entry) => marked.has(entry)) };
}

/** Back to «todos los años», which is what an empty list already means — the months' same shortcut. */
export function withYearsCleared(filters: RevenueFilters): RevenueFilters {
  return { ...filters, years: [] };
}

export function withMonthToggled(
  filters: RevenueFilters,
  month: number,
  universe: readonly number[],
): RevenueFilters {
  const marked = new Set(filters.months);
  if (marked.has(month)) {
    marked.delete(month);
  } else {
    marked.add(month);
  }
  return { ...filters, months: universe.filter((entry) => marked.has(entry)) };
}

export function withMonthsCleared(filters: RevenueFilters): RevenueFilters {
  return { ...filters, months: [] };
}

/**
 * The months every reading is bounded by: the marked ones, or ALL the loaded ones of the marked
 * years. It is the ONE translation of the marks into a span, so the cards, the tiles, the Excel and
 * the report cannot end up reading different months.
 */
export function selectedMonths(filters: RevenueFilters, universe: RevenueUniverse): number[] {
  return filters.months.length > 0 ? filters.months : universe.months;
}

/**
 * **THE rótulo of a set of months**, and the only one in the module: «Abril», «Ene–Jul», «Ene, Mar,
 * Abr». Every subtitle, tile, note, chip and report header composes on top of it.
 *
 * A set with gaps is ENUMERATED instead of asserting a range: «Ene–Abr» would claim February is
 * included. `null` for the empty set, so whoever composes has to say out loud what «no months» reads
 * as — a shared «Sin meses» is exactly how a subtitle ended up saying «Sin meses 2026».
 *
 * It was two functions —this one and the cards' own `periodOfMonths`— with two different rules for
 * the same figure, which is the class of debt this module was built not to have.
 */
export function monthSpanLabel(months: readonly number[]): string | null {
  if (months.length === 0) {
    return null;
  }
  const sorted = [...new Set(months)].sort((a, b) => a - b);
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  if (first === last) {
    return MONTHS_FULL_ES[first];
  }
  const contiguous = last - first === sorted.length - 1;
  return contiguous
    ? `${MONTHS_SHORT_ES[first]}–${MONTHS_SHORT_ES[last]}`
    : sorted.map((month) => MONTHS_SHORT_ES[month]).join(", ");
}

/**
 * The period in plain Spanish — what the tiles, each card's subtitle and the report's header say, so
 * nothing on the screen names a different span from the one beside it.
 *
 * The months come from `monthSpanLabel`; with SEVERAL years they are written once and the years
 * behind them («Abr · 2025, 2026»), because repeating «abril» per year is what makes a comparison
 * label illegible.
 *
 * It receives the RESOLVED span and not the marks: with no month marked the reading still covers a
 * tramo —every loaded month of the marked years— and a header that wrote only «2024, 2025, 2026»
 * left the reader to guess which months the figures under it were measured over.
 */
export function periodLabel(months: readonly number[], years: readonly number[]): string {
  if (years.length === 0) {
    return "Sin datos";
  }
  const yearsLabel = [...years].sort((a, b) => a - b).join(", ");
  const monthsLabel = monthSpanLabel(months);
  if (monthsLabel === null) {
    return yearsLabel;
  }
  return years.length === 1 ? `${monthsLabel} ${yearsLabel}` : `${monthsLabel} · ${yearsLabel}`;
}

/**
 * The period with a card's own narrowing IN FRONT — the one composition of the two, read by the
 * subtitles and by the report's header. Two of them would let the screen and the paper name the same
 * reading differently.
 */
export function scopedPeriodLabel(scope: string | null, period: string): string {
  return scope ? `${scope} · ${period}` : period;
}

/**
 * **Semestre y quimestre are SHORTCUTS, not a third axis.** They resolve to a set of months and mark
 * `months`, so everything downstream —the span, the growth's shared tramo, the ratios— keeps reading
 * one selection under one rule, and «ninguna marca = todos» survives untouched.
 *
 * Only the months the marked years actually LOADED are marked: a shortcut cannot select a month the
 * data does not have, and marking one would put a category on an axis with nothing under it.
 */
export function withSpanToggled(
  filters: RevenueFilters,
  span: NamedSpan,
  universe: readonly number[],
): RevenueFilters {
  const loaded = span.months.filter((month) => universe.includes(month));
  const marked = new Set(filters.months);
  const complete = loaded.length > 0 && loaded.every((month) => marked.has(month));
  for (const month of loaded) {
    if (complete) {
      marked.delete(month);
    } else {
      marked.add(month);
    }
  }
  // Kept in UNIVERSE order, never in click order — the months' same rule.
  return { ...filters, months: universe.filter((month) => marked.has(month)) };
}

/** Whether every loaded month of the span is marked — what draws the option's tick. */
export function spanIsMarked(
  filters: RevenueFilters,
  span: NamedSpan,
  universe: readonly number[],
): boolean {
  const loaded = span.months.filter((month) => universe.includes(month));
  return loaded.length > 0 && loaded.every((month) => filters.months.includes(month));
}

/** The spans of a kind that this data can offer at all: one with no loaded month RENDERS NOTHING,
 *  the bar's rule for a control that means nothing for the open data. */
export function availableSpans(kind: SpanKind, universe: readonly number[]): NamedSpan[] {
  return namedSpans(kind).filter((span) => span.months.some((month) => universe.includes(month)));
}

/**
 * The span the marks ARE, or `null` — DERIVED and never stored, which is what lets the shortcut stay
 * a shortcut: there is no fourth mark to keep in sync, and the chip strip can still say «Q1» instead
 * of five month chips.
 *
 * It demands the span's WHOLE month list, not the loaded part of it. Marking «S2» over a year that
 * only reaches julio marks one month, and a chip reading «S2 · Jul–Dic» over it would be the lie
 * `bucketLabel` refuses to tell about a two-month «T1»: that case falls back to month chips.
 */
export function markedSpanOf(months: readonly number[]): NamedSpan | null {
  const marked = new Set(months);
  for (const kind of SPAN_KINDS) {
    for (const span of namedSpans(kind)) {
      if (span.months.length === marked.size && span.months.every((month) => marked.has(month))) {
        return span;
      }
    }
  }
  return null;
}

/** «Q1 · Ene–May» — the option's and the chip's one composition. */
export function namedSpanLabel(span: NamedSpan): string {
  return `${span.code} · ${monthSpanLabel(span.months)}`;
}

/**
 * How many marks are set — what decides whether the chip strip is drawn. It counts the MONTHS and
 * never the years.
 *
 * Not because a year chip could not be closed —it could, and closing the last one would give every
 * year back— but because the screen OPENS with every year marked: a chip per year would put four or
 * five chips in the strip before the user has touched anything, which is the opposite of what a strip
 * of active marks is for. The dropdown's own label already shows the whole selection.
 */
export function activeMarkCount(filters: RevenueFilters): number {
  return filters.months.length;
}
