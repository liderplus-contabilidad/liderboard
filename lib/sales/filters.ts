/**
 * The marks of the bar —Año · Mes · Seguro · Tipo de servicio → Artículo · Vendedor— and the
 * universes they are chosen from.
 *
 * House rule for all but the year: no mark = ALL, kept in universe order, pruned on READ
 * (`sanitizeFilters`), an orphan mark counts as none. «Año» is the declared exception: never
 * empty, it resolves to the most recent year. The month is independent of the year. «Artículo» is
 * nested in «Tipo» as a LIST only — the two marks still cross with AND.
 */
import { MONTHS_FULL_ES, MONTHS_SHORT_ES } from "@/lib/date";
import { monthMarkLabel, yearMarkLabel } from "@/lib/period";
import { byArticle, byInsurer, byType, byVendor, loadedMonths, loadedYears } from "./derive";
import type { SalesGroup } from "./derive";
import type { SalesCoverage, SalesLine } from "./types";

/** Re-exported from `lib/period.ts` so this module's callers keep their import. */
export { monthMarkLabel, yearMarkLabel };

export interface SalesFilters {
  /** Marked years, ascending. Empty resolves to the most recent on read, never to «all». */
  years: number[];
  /** Indices 0–11, in order. Empty = every LOADED month of the marked years. */
  months: number[];
  /** Marked insurers, in the universe's order. Empty is ALL of them. */
  seguros: string[];
  /** Marked service types, in the universe's order. Empty is ALL of them. */
  tipos: string[];
  /** Marked article CODES, in the universe's order. Empty is ALL of them. */
  articles: string[];
  /** Marked salespeople, in the universe's order. Empty is ALL of them. */
  vendors: string[];
}

/** One choosable value: `id` is what a mark stores, `label` what the dropdown shows. */
export type SalesChoice = Pick<SalesGroup, "id" | "label">;

/** What the client has, and what the marked years allow choosing. */
export interface SalesUniverse {
  /** Every loaded year, ascending — from the COVERAGE, without reading a line. */
  years: number[];
  /** The months loaded in the marked years — their union. */
  months: number[];
  seguros: SalesChoice[];
  tipos: SalesChoice[];
  /** The articles of the MARKED TYPES, or of all of them with no type marked. */
  articles: SalesChoice[];
  vendors: SalesChoice[];
}

export function emptyFilters(): SalesFilters {
  return { years: [], months: [], seguros: [], tipos: [], articles: [], vendors: [] };
}

export function emptyUniverse(): SalesUniverse {
  return { years: [], months: [], seguros: [], tipos: [], articles: [], vendors: [] };
}

/** Which years the reading covers. Resolved FIRST —it decides which lines are read— and the one
 *  place «no mark means the most recent year» lives. */
export function resolveYears(filters: SalesFilters, coverage: readonly SalesCoverage[]): number[] {
  const universe = loadedYears(coverage);
  const marked = universe.filter((year) => filters.years.includes(year));
  return marked.length > 0 ? marked : universe.slice(-1);
}

function toChoices(groups: readonly SalesGroup[]): SalesChoice[] {
  return groups.map((group) => ({ id: group.id, label: group.label }));
}

/**
 * The universe: years and months from the COVERAGE, the other four axes from the LINES of the
 * resolved years, ordered by amount. Never persisted, and read off the marked YEARS rather than
 * the span «Mes» narrows to, so marking a month cannot erase a value from its own list.
 */
export function buildSalesUniverse(
  coverage: readonly SalesCoverage[],
  lines: readonly SalesLine[],
  years: readonly number[],
  markedTipos: readonly string[],
): SalesUniverse {
  const tipos = toChoices(byType(lines));
  // Orphan type marks are dropped first, so they cannot empty the article list.
  const liveTipos = new Set(tipos.map((tipo) => tipo.id).filter((id) => markedTipos.includes(id)));
  const forArticles =
    liveTipos.size === 0 ? lines : lines.filter((line) => liveTipos.has(line.tipo));
  return {
    years: loadedYears(coverage),
    months: loadedMonths(coverage, years),
    seguros: toChoices(byInsurer(lines)),
    tipos,
    articles: toChoices(byArticle(forArticles)),
    vendors: toChoices(byVendor(lines)),
  };
}

/** Keeps the marked ids that still exist, in the universe's order. */
function prune(marked: readonly string[], universe: readonly SalesChoice[]): string[] {
  return universe.map((choice) => choice.id).filter((id) => marked.includes(id));
}

/** Pruned against what the client has NOW, on read and never in an effect. */
export function sanitizeFilters(filters: SalesFilters, universe: SalesUniverse): SalesFilters {
  const years = universe.years.filter((year) => filters.years.includes(year));
  const resolved = years.length > 0 ? years : universe.years.slice(-1);
  return {
    years: resolved,
    months: universe.months.filter((month) => filters.months.includes(month)),
    seguros: prune(filters.seguros, universe.seguros),
    tipos: prune(filters.tipos, universe.tipos),
    // An article whose type is no longer marked left the universe, so it prunes itself here.
    articles: prune(filters.articles, universe.articles),
    vendors: prune(filters.vendors, universe.vendors),
  };
}

/** The lines the marks let through, crossed with AND — the one translation of marks into data. */
export function narrowLines(lines: readonly SalesLine[], filters: SalesFilters): SalesLine[] {
  const seguros = new Set(filters.seguros);
  const tipos = new Set(filters.tipos);
  const articles = new Set(filters.articles);
  const vendors = new Set(filters.vendors);
  return lines.filter(
    (line) =>
      (seguros.size === 0 || seguros.has(line.seguro)) &&
      (tipos.size === 0 || tipos.has(line.tipo)) &&
      (articles.size === 0 || articles.has(line.articleCode)) &&
      (vendors.size === 0 || vendors.has(line.vendor)),
  );
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
  // The months survive a change of year: «Abr» means April, not April 2026.
  return { ...filters, years: universe.filter((entry) => marked.has(entry)) };
}

/** Marks ALL the years — an empty list would mean «the most recent». */
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

/** The four id-based axes, which share one toggle. */
export type SalesAxis = "seguros" | "tipos" | "articles" | "vendors";

export function withChoiceToggled(
  filters: SalesFilters,
  axis: SalesAxis,
  id: string,
  universe: readonly SalesChoice[],
): SalesFilters {
  const marked = new Set(filters[axis]);
  if (marked.has(id)) {
    marked.delete(id);
  } else {
    marked.add(id);
  }
  return {
    ...filters,
    [axis]: universe.map((choice) => choice.id).filter((entry) => marked.has(entry)),
  };
}

export function withAxisCleared(filters: SalesFilters, axis: SalesAxis): SalesFilters {
  return { ...filters, [axis]: [] };
}

/**
 * What the marked slice is called, read by every card so none names a different one: a single
 * mark by its name, several as «n de m», axes joined in the bar's order.
 */
export function describeScope(filters: SalesFilters, universe: SalesUniverse): string | null {
  const parts: string[] = [];
  const axes: { axis: SalesAxis; noun: string }[] = [
    { axis: "seguros", noun: "seguros" },
    { axis: "tipos", noun: "tipos" },
    { axis: "articles", noun: "artículos" },
    { axis: "vendors", noun: "vendedores" },
  ];
  for (const { axis, noun } of axes) {
    const marked = universe[axis].filter((choice) => filters[axis].includes(choice.id));
    if (marked.length === 0) {
      continue;
    }
    parts.push(
      marked.length === 1
        ? marked[0].label
        : `${marked.length} de ${universe[axis].length} ${noun}`,
    );
  }
  return parts.length === 0 ? null : parts.join(" · ");
}

/**
 * Which type the composition card is opened INTO, and who decided it.
 *
 * «Exactly one marked» is the house figure: with ONE type marked in the bar the card shows that
 * type's articles — a single bar would say nothing — and it is `pinned`: the way out is the bar,
 * not the card. Otherwise it is whatever bar the reader pressed, or level one.
 */
export function resolveOpenType(
  pressed: string | null,
  filters: SalesFilters,
): { id: string; pinned: boolean } | null {
  if (filters.tipos.length === 1) {
    return { id: filters.tipos[0], pinned: true };
  }
  return pressed === null ? null : { id: pressed, pinned: false };
}

/** The months the reading sums: the marked ones, or all the loaded ones. */
export function selectedMonths(filters: SalesFilters, universe: SalesUniverse): number[] {
  return filters.months.length > 0 ? filters.months : universe.months;
}

/**
 * The period in plain Spanish. Months with gaps are ENUMERATED («Ene, Mar, Abr»): a range would
 * claim February is summed. With several years the months are written once.
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

/** The period with the marked slice in front — the one composition of the two. */
export function scopedPeriodLabel(scope: string | null, period: string): string {
  return scope ? `${scope} · ${period}` : period;
}

/** How many marks are set, years excluded: the year is never empty and is not chipped. */
export function activeMarkCount(filters: SalesFilters): number {
  return (
    filters.months.length +
    filters.seguros.length +
    filters.tipos.length +
    filters.articles.length +
    filters.vendors.length
  );
}
