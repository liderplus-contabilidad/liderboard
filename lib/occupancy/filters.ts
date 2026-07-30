/**
 * The single selection of Ocupaciones: WHERE (sucursales) and WHEN (the period, year included).
 *
 * There is no comparison axis to declare — marking two sucursales is what produces one, and the
 * period decides whether what you get is an evolution or columns side by side.
 */
import { MONTHS_FULL_ES, MONTHS_SHORT_ES } from "@/lib/date";
import { compareDates, orderedRange, pickDate, pickId } from "./analytics/scope";
import { daysInMonth } from "./derive";
import {
  DEFAULT_METRIC,
  type DateRange,
  type DateRef,
  type OccupancyMetricId,
  type OccupancyPeriod,
  type PeriodPick,
  type Scope,
} from "./analytics/types";

/**
 * How the period was asked for. The app says which one is on, because they answer different questions:
 *
 * - `rango`: one continuous span, «del 1 de marzo al 20 de abril de 2026» → a total and an EVOLUTION.
 * - `comparar`: individual days AND whole months, of any year → a COMPARISON, one column each. The
 *   special case: «el 5 de enero contra el 12 de marzo», «marzo contra julio».
 */
export type PeriodMode = "rango" | "comparar";

export interface OccupancyFilters {
  metric: OccupancyMetricId;
  centerIds: string[];
  /** Which of the two payloads below the engine reads. */
  periodMode: PeriodMode;
  /** Always kept: switching modes back and forth must not lose what was picked. */
  range: DateRange;
  /** Always kept, same reason. Days and months picked one by one, a compared column each. */
  picks: PeriodPick[];
  scope: Scope;
}

/**
 * «El año que haya»: the filters exist before Dexie has answered, so the default span carries this and
 * `sanitizeFilters` resolves it against the years the workspace actually holds — read at render time,
 * never in an effect.
 */
export const UNRESOLVED_YEAR = 0;

/** January 1st to December 31st, which is what «todo el año» means. */
export function wholeYearRange(year: number): DateRange {
  return { from: { year, monthIndex: 0, day: 0 }, to: { year, monthIndex: 11, day: 30 } };
}

/**
 * Opens on the whole year read MONTH BY MONTH: twelve columns is the reading the accountant's own sheet
 * has, and it is the only granularity that fits both halves of the reporte — the table cannot show a
 * daily axis at all.
 */
export function emptyFilters(): OccupancyFilters {
  return {
    metric: DEFAULT_METRIC,
    centerIds: [],
    periodMode: "rango",
    range: wholeYearRange(UNRESOLVED_YEAR),
    picks: [],
    scope: "mensual",
  };
}

/** Toggles keeping the UNIVERSE's order, so series and colors never depend on click order. */
function toggled<T>(current: readonly T[], value: T, universe: readonly T[]): T[] {
  const picked = new Set(current);
  if (picked.has(value)) {
    picked.delete(value);
  } else {
    picked.add(value);
  }
  return universe.filter((candidate) => picked.has(candidate));
}

export function withMetric(filters: OccupancyFilters, metric: OccupancyMetricId): OccupancyFilters {
  return { ...filters, metric };
}

export function withScope(filters: OccupancyFilters, scope: Scope): OccupancyFilters {
  return { ...filters, scope };
}

export function withCenterToggled(
  filters: OccupancyFilters,
  centerId: string,
  universe: readonly string[],
): OccupancyFilters {
  return { ...filters, centerIds: toggled(filters.centerIds, centerId, universe) };
}

export function withCentersCleared(filters: OccupancyFilters): OccupancyFilters {
  return { ...filters, centerIds: [] };
}

export function withPeriodMode(
  filters: OccupancyFilters,
  periodMode: PeriodMode,
): OccupancyFilters {
  return { ...filters, periodMode };
}

/** A month pick has no day to clamp; a day pick does. Same guard, one entry point. */
function normalizePick(pick: PeriodPick): PeriodPick {
  const date = normalizeDate(pickDate(pick));
  return pick.kind === "dia"
    ? { kind: "dia", ...date }
    : { kind: "mes", year: date.year, monthIndex: date.monthIndex };
}

/** Clamps to a real date: there is no 31 de febrero, and a month is 0–11. */
function normalizeDate(date: DateRef): DateRef {
  const monthIndex = Math.min(11, Math.max(0, Math.trunc(date.monthIndex)));
  const year = Math.trunc(date.year);
  return {
    year,
    monthIndex,
    day: Math.min(Math.max(0, Math.trunc(date.day)), daysInMonth(year, monthIndex) - 1),
  };
}

/** One end of the span. Ends given in reverse are normalized, so picking backwards still reads. */
export function withRangeEdge(
  filters: OccupancyFilters,
  edge: "from" | "to",
  ref: DateRef,
): OccupancyFilters {
  return {
    ...filters,
    periodMode: "rango",
    range: orderedRange({ ...filters.range, [edge]: normalizeDate(ref) }),
  };
}

/** Back to the whole year the span already sat in. */
export function withRangeCleared(filters: OccupancyFilters): OccupancyFilters {
  return { ...filters, range: wholeYearRange(filters.range.from.year) };
}

/**
 * A day or a whole month in the «comparación de periodos» comparison. Picking one IS that mode, and picking the
 * same one twice removes it.
 *
 * `scope` is deliberately left alone: this mode gives one column per pick whatever the axis says, and
 * coming back to rango must not land the reader on a granularity the control cannot show.
 */
export function withPickToggled(filters: OccupancyFilters, pick: PeriodPick): OccupancyFilters {
  const wanted = normalizePick(pick);
  const id = pickId(wanted);
  const already = filters.picks.some((candidate) => pickId(candidate) === id);
  const picks = already
    ? filters.picks.filter((candidate) => pickId(candidate) !== id)
    : [...filters.picks, wanted].sort((a, b) => compareDates(pickDate(a), pickDate(b)));
  return { ...filters, periodMode: "comparar", picks };
}

export function withPicksCleared(filters: OccupancyFilters): OccupancyFilters {
  return { ...filters, picks: [] };
}

/** "Quitar todo": the métrica and the axis survive — they are not marks, they are the lens. */
export function clearMarks(filters: OccupancyFilters): OccupancyFilters {
  return { ...filters, centerIds: [], picks: [], range: wholeYearRange(filters.range.from.year) };
}

/** Whether the span covers a year end to end: what «Año 2026» reads off. */
export function isWholeYearRange(range: DateRange): boolean {
  const { from, to } = orderedRange(range);
  return (
    from.year === to.year &&
    from.monthIndex === 0 &&
    from.day === 0 &&
    to.monthIndex === 11 &&
    to.day >= 30
  );
}

/** The period as the engine reads it: one shape or the other, never both. */
export function toPeriod(filters: OccupancyFilters): OccupancyPeriod {
  return filters.periodMode === "comparar"
    ? { mode: "comparar", picks: filters.picks }
    : { mode: "rango", range: orderedRange(filters.range) };
}

export interface FilterUniverse {
  centerIds: readonly string[];
  years: readonly number[];
}

/**
 * Prunes what stopped existing and resolves «el año que haya», read at render time so the selection is
 * never a render behind the workspace. A year the workspace does not hold moves to the newest one it
 * does: a span nobody can see would read as a bug in the data.
 */
export function sanitizeFilters(
  filters: OccupancyFilters,
  universe: FilterUniverse,
): OccupancyFilters {
  const centerIds = new Set(universe.centerIds);
  const years = [...universe.years].sort((a, b) => a - b);
  const newest = years[years.length - 1];
  const resolve = (date: DateRef): DateRef =>
    newest === undefined || years.includes(date.year)
      ? normalizeDate(date)
      : normalizeDate({ ...date, year: newest });

  return {
    ...filters,
    centerIds: filters.centerIds.filter((id) => centerIds.has(id)),
    range: orderedRange({ from: resolve(filters.range.from), to: resolve(filters.range.to) }),
    picks: filters.picks
      .map((pick) => normalizePick({ ...pick, year: resolve(pickDate(pick)).year }))
      .sort((a, b) => compareDates(pickDate(a), pickDate(b))),
  };
}

/** Whether anything narrows the view at all — what the chip strip and the fallback both ask. */
export function hasMarks(filters: OccupancyFilters): boolean {
  if (filters.centerIds.length > 0) {
    return true;
  }
  return filters.periodMode === "comparar"
    ? filters.picks.length > 0
    : !isWholeYearRange(filters.range);
}

/** "5 ene 2026" — short, because these go in chips and axis labels. */
export function dateLabel(date: DateRef): string {
  return `${date.day + 1} ${MONTHS_SHORT_ES[date.monthIndex].toLowerCase()} ${date.year}`;
}

/** A day says its day; a month says its month. The label is what tells the two granularities apart. */
export function pickLabel(pick: PeriodPick): string {
  return pick.kind === "dia"
    ? dateLabel(pickDate(pick))
    : `${MONTHS_FULL_ES[pick.monthIndex]} ${pick.year}`;
}

/**
 * The span by its ends. It says the year ONCE when both ends share it, names the month once when the
 * span sits inside it, and reads a whole month or a whole year as what it is.
 */
export function rangeLabel(range: DateRange): string {
  const { from, to } = orderedRange(range);
  const monthName = (month: number) => MONTHS_FULL_ES[month].toLowerCase();

  if (isWholeYearRange(range)) {
    return `Año ${from.year}`;
  }
  if (from.year !== to.year) {
    return `del ${from.day + 1} de ${monthName(from.monthIndex)} de ${from.year} al ${to.day + 1} de ${monthName(to.monthIndex)} de ${to.year}`;
  }
  if (from.monthIndex === to.monthIndex) {
    if (from.day === 0 && to.day >= daysInMonth(from.year, from.monthIndex) - 1) {
      return `${MONTHS_FULL_ES[from.monthIndex]} ${from.year}`;
    }
    return from.day === to.day
      ? `${from.day + 1} de ${monthName(from.monthIndex)} de ${from.year}`
      : `del ${from.day + 1} al ${to.day + 1} de ${monthName(from.monthIndex)} de ${from.year}`;
  }
  return `del ${from.day + 1} de ${monthName(from.monthIndex)} al ${to.day + 1} de ${monthName(to.monthIndex)} de ${from.year}`;
}

/** How many picks a comparison names before it starts counting them instead. */
const PICKS_LISTED = 3;

export function picksLabel(picks: readonly PeriodPick[]): string {
  if (picks.length === 0) {
    return "Sin periodos elegidos";
  }
  const listed = picks.slice(0, PICKS_LISTED).map(pickLabel).join(" · ");
  const rest = picks.length - PICKS_LISTED;
  return rest > 0 ? `${listed} y ${rest} más` : listed;
}

/** What the control is labelled with and what «Mostrando …» reads, whichever mode is on. */
export function periodLabel(filters: OccupancyFilters): string {
  return filters.periodMode === "comparar" ? picksLabel(filters.picks) : rangeLabel(filters.range);
}

/** Cased for the middle of a sentence: «marzo de 2026», but «Año 2026» keeps its capital. */
export function periodPhrase(filters: OccupancyFilters): string {
  const label = periodLabel(filters);
  return /^(Año|Sin) /.test(label) ? label.toLowerCase() : label;
}

/**
 * The whole selection as one sentence. Reading it off two separate controls is what makes «el 5 de
 * enero de 2025 contra el de 2026» hard to be sure of before looking at the cards.
 *
 * The métrica is deliberately NOT in it: it does not narrow anything, it is the lens of one section.
 */
export function describeSelection(
  filters: OccupancyFilters,
  centerNames: readonly string[],
): string {
  return [
    periodLabel(filters),
    centerNames.length > 0 ? centerNames.join(" y ") : "todas las sucursales",
  ].join(" · ");
}
