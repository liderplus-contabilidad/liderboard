/**
 * The shapes the presentation layer can draw, and the two pure functions that keep a query
 * honest: one translates the filter bar's marks into a `SeriesQuery`, the other resolves the
 * color every series gets.
 *
 * Both live here rather than in a component for the same reason the engine does: a query
 * assembled inline is a query nobody can test — and the moment two views assemble one each they
 * drift. Every card goes through `toSeriesQuery`; there is no dimension to declare, so unlike
 * the "Comparar por" model this replaces, there is nothing else to keep in sync with it.
 */
import { CHART_MAX_SERIES, CHART_SECTION, colorForEntity } from "@/lib/charts/palette";
import { sectionOf } from "../datos-sections";
import type { PygFilters } from "../filters";
import type {
  AnalyticsSource,
  PeriodRef,
  PeriodSlot,
  SeriesKey,
  SeriesQuery,
} from "../analytics/types";
import type { Frequency } from "../types";

/** The shapes the presentation layer can draw. One per entry of the design's form table. */
export type ChartType =
  | "barras"
  | "barras-apiladas"
  | "barras-100"
  | "barras-horizontales"
  | "pastel"
  | "dona"
  | "linea"
  | "combo"
  | "pareto"
  | "cascada";

/** The engine transformation a card applies. `montos` is the identity — the raw series. */
export type TransformId =
  | "montos"
  | "composicion"
  | "ytd"
  | "index100"
  | "media-movil"
  | "anio-anterior"
  | "pct-ingresos"
  | "pct-contenedor"
  | "variacion"
  | "pareto"
  | "cascada";

/**
 * Which shapes a transformation admits, in preference order. The head is what a view falls
 * back to; offering anything outside the list would draw a unit the shape cannot carry (a
 * percentage stacked to 100 against amounts, an index as a pie slice).
 */
export const SHAPES_BY_TRANSFORM: Record<TransformId, readonly ChartType[]> = {
  montos: ["barras", "barras-apiladas", "linea"],
  composicion: ["dona", "pastel"],
  ytd: ["barras", "linea"],
  index100: ["linea"],
  "media-movil": ["combo"],
  "anio-anterior": ["combo"],
  "pct-ingresos": ["barras-horizontales"],
  "pct-contenedor": ["barras-100"],
  variacion: ["barras"],
  pareto: ["pareto"],
  // Una cascada es una cascada: la lista de una sola entrada es lo que hace que `shapeFor`
  // devuelva siempre la misma forma y que la tarjeta no tenga selector que ofrecer.
  cascada: ["cascada"],
};

export type TransformGroup = "temporal" | "estructura" | "variacion";

/** The Análisis selector, in Spanish, grouped the way the tab presents it. */
export const ANALYSIS_TRANSFORMS: readonly {
  id: TransformId;
  label: string;
  group: TransformGroup;
}[] = [
  { id: "ytd", label: "Acumulado del año", group: "temporal" },
  { id: "index100", label: "Índice base 100", group: "temporal" },
  { id: "media-movil", label: "Media móvil (3)", group: "temporal" },
  { id: "anio-anterior", label: "Mismo periodo del año anterior", group: "temporal" },
  { id: "pct-ingresos", label: "% sobre ingresos", group: "estructura" },
  { id: "pct-contenedor", label: "% sobre la cuenta padre", group: "estructura" },
  { id: "pareto", label: "Concentración de gastos", group: "estructura" },
  { id: "variacion", label: "Variación contra el periodo anterior", group: "variacion" },
];

/** Ingresos — what a query falls back to when no account is marked. */
export const DEFAULT_FOCUS_CODE = "4";

/** What a query is read against: the sources, the resolved center, the frequency and the year. */
export interface SelectionContext {
  sources: readonly AnalyticsSource[];
  /** The center a fixed-question card reads (`resolveActiveCenterId`'s result) — Consolidado
   * when none or several centers are marked, the lone marked one otherwise. */
  activeCenterId: string;
  /** Always the "Ver por" control's — no chart carries a frequency of its own. */
  frequency: Frequency;
  year: number;
  /**
   * Los centros del cliente SIN el Consolidado, que no es un centro sino su suma. `[]` en modo
   * estado único.
   *
   * Cada uno dice si es un establecimiento o el cajón «Sin centro de costo» del sistema contable,
   * porque la vista de líneas de negocio reparte por establecimiento y ese cajón no lo es: entra
   * solo si el usuario lo marca a mano. Lo llena el proveedor porque el rol de cada vista vive
   * ahí; una fuente de analítica solo trae id y nombre, y distinguirlos por el nombre sería
   * adivinar.
   */
  centers: readonly { id: string; name: string; kind: "centro" | "sin-centro" }[];
}

/**
 * The single translation from the filter bar's marks to a query. The comparison axis is never
 * declared: marking accounts, centers or periods populates the matching field, and the cartesian
 * product of whichever axes end up populated is `buildSeries`' job, not this function's.
 *
 * `limit` is the chart's cap and not the engine's: past eight series the palette has no slot
 * left, so the engine truncates and reports it instead of the view inventing a ninth color.
 */
export function toSeriesQuery(filters: PygFilters, context: SelectionContext): SeriesQuery {
  return {
    codes: filters.codes.length > 0 ? filters.codes : [DEFAULT_FOCUS_CODE],
    centerIds: filters.centerIds.length > 0 ? filters.centerIds : [context.activeCenterId],
    years: [context.year],
    frequency: context.frequency,
    ...(filters.periods.length > 0
      ? { periods: expandSlots(filters.periods, [context.year]) }
      : {}),
    limit: CHART_MAX_SERIES,
  };
}

/**
 * A marked period is a year-less slot (`PeriodSlot`); the engine reads dated `PeriodRef`s. This
 * is the one place the two meet — the slot is stamped with each year in play, which is what
 * makes «Ene» narrow every visible year rather than only the first.
 *
 * Charts read a single resolved year for now, so `years` has one entry; opening them to real
 * multi-year series is a later change, and this expansion is already what it will need.
 */
export function expandSlots(slots: readonly PeriodSlot[], years: readonly number[]): PeriodRef[] {
  return years.flatMap((year) =>
    slots.map((slot) => ({ year, frequency: slot.frequency, index: slot.index })),
  );
}

/** Clamps a shape to one the transformation admits; the head of the list is the default. */
export function shapeFor(transform: TransformId, wanted: ChartType): ChartType {
  const allowed = SHAPES_BY_TRANSFORM[transform];
  return allowed.includes(wanted) ? wanted : allowed[0];
}

/**
 * Color by center, ordered by the FILTER's own list. That order does not move when a series
 * leaves the chart, so dropping one center repaints nothing and a center keeps its color across
 * the cards of a tab — exactly what the requirement asks for.
 */
export function centerColorResolver(centerIds: readonly string[]): (key: SeriesKey) => string {
  const order = [...centerIds];
  return (key) => colorForEntity(key.centerId, order);
}

/**
 * Color by account, ordered by the file among the accounts being compared.
 *
 * The universe here is the COMPARED set and not the whole chart of accounts, which is the one
 * concession in the color rule: a real statement carries dozens of accounts and only eight
 * slots exist, so ordering against the whole file would paint almost everything neutral. The
 * cost is that removing one account can shift the slots of the rest.
 */
export function codeColorResolver(codes: readonly string[]): (key: SeriesKey) => string {
  const order = [...codes];

  if (order.length > 0 && order.every(isStatementRoot)) {
    return (key) => sectionFill(key.code) ?? colorForEntity(key.code, order);
  }
  return (key) => colorForEntity(key.code, order);
}

function isStatementRoot(code: string): boolean {
  return !code.includes(".") && sectionOf(code) !== null;
}

function sectionFill(code: string): string | null {
  const section = sectionOf(code);
  return section ? CHART_SECTION[section] : null;
}

/**
 * The color rule, derived from how many entries are marked rather than from a declared
 * dimension: a pair of axes both populated colors by the (cuenta, centro) pair — because that
 * is what its legend names — several centers alone colors by center, and everything else colors
 * by account.
 */
export function colorResolver(
  filters: PygFilters,
  context: SelectionContext,
): (key: SeriesKey) => string {
  const queryCodes = filters.codes.length > 0 ? filters.codes : [DEFAULT_FOCUS_CODE];

  if (filters.centerIds.length > 1 && filters.codes.length > 1) {
    const order = queryCodes.flatMap((code) =>
      filters.centerIds.map((centerId) => pairId(code, centerId)),
    );
    return (key) => colorForEntity(pairId(key.code, key.centerId), order);
  }
  if (filters.centerIds.length > 1) {
    return centerColorResolver(context.sources.map((source) => source.centerId));
  }
  return codeColorResolver(queryCodes);
}

export function activeSource(context: SelectionContext): AnalyticsSource | undefined {
  return context.sources.find((source) => source.centerId === context.activeCenterId);
}

function pairId(code: string, centerId: string): string {
  return `${code}|${centerId}`;
}
