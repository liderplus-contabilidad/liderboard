/**
 * The single selection of PyG: which accounts, cost centers and periods are marked in the
 * filter bar. There is no dimension to declare here — unlike the "Comparar por" model this
 * replaces, the comparison axis is never chosen; it falls out of whichever lists end up
 * populated. `lib/profit-loss/charts/selection.ts` turns this into a `SeriesQuery`; this module
 * only owns the state and its own sanitation, so `PygDataProvider` (which needs it for the
 * Datos tab too) never has to import from `charts/`.
 */
import { periodLabels } from "./derive";
import type { PeriodSlot } from "./analytics/types";
import type { Frequency } from "./types";

/** Marking no center IS the Consolidado; it never appears as a checkbox of its own. */
export const CONSOLIDADO_ID = "consolidado";

/** What the filter bar has marked. */
export interface PygFilters {
  codes: string[];
  centerIds: string[];
  /**
   * Marked clients — they ONLY make sense in the cross-client consolidado, and outside it they are
   * pruned to empty. Marking none is not «no client»: it is all of them, the same rule as center and
   * year.
   */
  clientIds: string[];
  /** Marked years. Marking none is not "no years": it is every year the workspace holds. */
  years: number[];
  /** Marked periods, year-less: a mark narrows the axis of EVERY visible year. */
  periods: PeriodSlot[];
  /**
   * The chosen PRESET VIEW (`preset-views.ts`), or `null`. It is not a mark but another way of
   * deciding what the first Gráficos card compares, and that is why it is MUTUALLY EXCLUSIVE with
   * `codes` in both directions: choosing one clears the account marks and marking an account
   * deselects it. Both at once would put two different answers to «which series do I draw» with
   * nothing to arbitrate them. It is a `string` and not the catalogue's type so this module —which
   * `PygDataProvider` imports for Datos— does not drag `charts/` along with it.
   */
  preset: string | null;
}

export function emptyFilters(): PygFilters {
  return { codes: [], centerIds: [], clientIds: [], years: [], periods: [], preset: null };
}

/**
 * Adds or removes `value`, keeping the list in the UNIVERSE's order rather than click order —
 * so the series come out in file order and the colors line up with what `colorResolver`
 * computes from that same universe.
 */
function toggled<T>(current: readonly T[], value: T, universe: readonly T[]): T[] {
  const picked = new Set(current);
  if (picked.has(value)) {
    picked.delete(value);
  } else {
    picked.add(value);
  }
  return universe.filter((candidate) => picked.has(candidate));
}

/**
 * Marking an account deselects the preset view, BECAUSE NORMALLY they are two answers to the same
 * question: «Ventas» draws categories that are not accounts of the plan, so nothing could arbitrate
 * between what it breaks down and what some marks ask for.
 *
 * `keepPreset` is the exception, and it is declared by the view whose lines ARE accounts of the plan:
 * in the expense annex the mark and the view say the same thing, so marking one narrows the breakdown
 * instead of contradicting it. Without this exit, narrowing the annex would switch the whole view off
 * — which is precisely the opposite of what marks are for.
 */
export function withCodeToggled(
  filters: PygFilters,
  code: string,
  universe: readonly string[],
  options: { keepPreset?: boolean } = {},
): PygFilters {
  return {
    ...filters,
    codes: toggled(filters.codes, code, universe),
    ...(options.keepPreset ? {} : { preset: null }),
  };
}

/**
 * Picks a preset view — and picking the one already in place removes it, which is how one exits it
 * without a «none» that says nothing.
 *
 * And it SEEDS what the view breaks down —the centers and the periods— instead of breaking it down on
 * its own: what it draws stays marked in the usual dropdowns, so it is visible what goes in and it is
 * removed from where the user already knows to look. On leaving they are cleared: they were marks the
 * view made, and leaving chips behind a switched-off toggle is litter the user did not create.
 *
 * The ACCOUNTS are always cleared on entering and no view seeds them. The expense annex did —its
 * lines are accounts of the plan, so marking them was «seeing which ones go in»—, and it did not work
 * out: they are all the movement ones of the expense tree, over a hundred in a real plan, that is,
 * over a hundred chips in the strip. That it can be narrowed by account without switching the view off
 * survives separately, in `withCodeToggled`'s `keepPreset`, which the view now declares instead of
 * inheriting it from the seeding.
 */
export function withPresetSelected(
  filters: PygFilters,
  id: string,
  seedCenterIds: readonly string[] = [],
  seedPeriods: readonly PeriodSlot[] = [],
): PygFilters {
  const next = filters.preset === id ? null : id;
  return {
    ...filters,
    preset: next,
    codes: [],
    centerIds: next === null ? [] : [...seedCenterIds],
    periods: next === null ? [] : [...seedPeriods],
  };
}

export function withPresetCleared(filters: PygFilters): PygFilters {
  return { ...filters, preset: null, centerIds: [], periods: [] };
}

export function withCenterToggled(
  filters: PygFilters,
  centerId: string,
  universe: readonly string[],
): PygFilters {
  return { ...filters, centerIds: toggled(filters.centerIds, centerId, universe) };
}

export function withClientToggled(
  filters: PygFilters,
  clientId: string,
  universe: readonly string[],
): PygFilters {
  return { ...filters, clientIds: toggled(filters.clientIds, clientId, universe) };
}

export function withYearToggled(
  filters: PygFilters,
  year: number,
  universe: readonly number[],
): PygFilters {
  return { ...filters, years: toggled(filters.years, year, universe) };
}

/**
 * Periods toggle by INDEX — a `PeriodSlot` is a `(frequency, index)` pair and two periods of the
 * same axis only ever differ by index.
 */
export function withPeriodToggled(
  filters: PygFilters,
  period: PeriodSlot,
  universe: readonly PeriodSlot[],
): PygFilters {
  const picked = new Set(filters.periods.map((p) => p.index));
  if (picked.has(period.index)) {
    picked.delete(period.index);
  } else {
    picked.add(period.index);
  }
  return { ...filters, periods: universe.filter((candidate) => picked.has(candidate.index)) };
}

/** Every period of a granularity, year-less — the "Periodo" dropdown's universe. */
export function periodSlots(frequency: Frequency): PeriodSlot[] {
  return periodLabels(frequency).map((_, index) => ({ frequency, index }));
}

/** Each dropdown's own "Quitar selección" footer button clears only ITS list. */
export function withCodesCleared(filters: PygFilters): PygFilters {
  return { ...filters, codes: [] };
}

/** The "Todos (Consolidado)" shortcut: clears only the center selection. */
export function withCentersCleared(filters: PygFilters): PygFilters {
  return { ...filters, centerIds: [] };
}

export function withClientsCleared(filters: PygFilters): PygFilters {
  return { ...filters, clientIds: [] };
}

export function withYearsCleared(filters: PygFilters): PygFilters {
  return { ...filters, years: [] };
}

export function withPeriodsCleared(filters: PygFilters): PygFilters {
  return { ...filters, periods: [] };
}

/** "Quitar todo" in the active-filter chip strip. */
export function clearFilters(): PygFilters {
  return emptyFilters();
}

/** One selector entry the Datos table can read: its id, whether it accepts value edits, and
 * every account code its own dataset declares (parents included) — enough for `sanitizeFilters`
 * to prune a marked account without this module reaching into the analytics/charts layers. */
export interface FilterView {
  id: string;
  editable: boolean;
  codes: readonly string[];
}

/**
 * The center the Datos table reads, derived rather than stored: no center marked or several
 * marked both resolve to the Consolidado, because the table has no column to show two centers
 * at once. A workspace with a single view (no Consolidado to fall back to — a lone statement)
 * resolves to that one view instead.
 */
export function resolveActiveCenterId(filters: PygFilters, views: readonly FilterView[]): string {
  if (filters.centerIds.length === 1 && views.some((view) => view.id === filters.centerIds[0])) {
    return filters.centerIds[0];
  }
  return views.length === 1 ? views[0].id : CONSOLIDADO_ID;
}

/** Whether Datos can edit the resolved center's values — false for the Consolidado, for an
 * annual-only view, or whenever the resolution above lands on more than one marked center. */
export function canEditActiveCenter(filters: PygFilters, views: readonly FilterView[]): boolean {
  const id = resolveActiveCenterId(filters, views);
  return views.find((view) => view.id === id)?.editable ?? false;
}

/**
 * The years Datos renders, ascending: the marked ones, or every loaded year when none is marked.
 *
 * Unlike centers, years are NOT summed when several are in play — a Consolidado of 2025 and 2026
 * would be a number nobody asked for. They are laid side by side instead, which is why "none
 * marked" means "all of them" rather than "an aggregate of them".
 */
export function resolveVisibleYears(filters: PygFilters, loadedYears: readonly number[]): number[] {
  const loaded = new Set(loadedYears);
  const marked = filters.years.filter((year) => loaded.has(year));
  return (marked.length > 0 ? marked : [...loadedYears]).sort((a, b) => a - b);
}

/**
 * Whether the resolved year is editable: exactly one year on screen. That covers both the single
 * marked year and the workspace that only ever loaded one — in both cases the table has one
 * column per period and nowhere for an edit to be ambiguous.
 */
export function canEditActiveYear(filters: PygFilters, loadedYears: readonly number[]): boolean {
  return resolveVisibleYears(filters, loadedYears).length === 1;
}

/** The workspace's persisted `activeCenterId` becomes the initial center selection: the
 * Consolidado (or nothing persisted yet) seeds no marks, a real center seeds itself marked. */
export function seedCenterIds(persistedActiveCenterId: string | undefined): string[] {
  return persistedActiveCenterId && persistedActiveCenterId !== CONSOLIDADO_ID
    ? [persistedActiveCenterId]
    : [];
}

export interface FilterSanitizeContext {
  /** One entry per center, whose `codes` are the UNION over the years currently visible. */
  views: readonly FilterView[];
  /** Every year the workspace holds. */
  loadedYears: readonly number[];
  /**
   * The clients the consolidado can sum, by id. `[]` outside the consolidado — which is what keeps a
   * mark from surviving a return to a particular client, where it would mean nothing.
   */
  clients: readonly string[];
  frequency: Frequency;
}

/**
 * Prunes what stopped existing, read at render time rather than in an effect so the filters are
 * never a render out of step with the workspace: a center that left the workspace, a year that
 * was deleted, an account the RESOLVED center no longer reports, a period a coarser frequency no
 * longer has a slot for.
 *
 * An account is pruned against the union of the visible years, not against one of them: a
 * cuenta that 2025 reports and 2026 does not must survive while 2025 is on screen.
 *
 * Loading an entirely different workspace is the provider's job (it resets the raw state before
 * this ever runs) — by construction, though, an old selection almost never survives this prune
 * either: a different Excel means different account codes and different center ids.
 *
 * Pruning NOTHING returns the very same object, which is the common case and is what keeps the
 * Datos table cheap: this runs against a context rebuilt on every edit, and a fresh `periods`
 * array — even an identically empty one — invalidates the visible columns and re-renders every
 * row of the statement. Comparing lengths is enough: filtering only ever removes, in order.
 */
export function sanitizeFilters(filters: PygFilters, context: FilterSanitizeContext): PygFilters {
  const centerIds = new Set(context.views.map((view) => view.id));
  const prunedCenterIds = filters.centerIds.filter((id) => centerIds.has(id));

  const resolvedId = resolveActiveCenterId(
    { ...filters, centerIds: prunedCenterIds },
    context.views,
  );
  const view = context.views.find((candidate) => candidate.id === resolvedId);
  const codes = new Set(view?.codes ?? []);
  const prunedCodes = filters.codes.filter((code) => codes.has(code));

  const loadedYears = new Set(context.loadedYears);
  const prunedYears = filters.years.filter((year) => loadedYears.has(year));

  const clients = new Set(context.clients);
  const prunedClientIds = filters.clientIds.filter((id) => clients.has(id));

  // A slot carries no year, so the only thing that can strand it is a coarser granularity with
  // fewer slots to land on.
  const axis = periodSlots(context.frequency);
  const prunedPeriods = filters.periods.filter(
    (period) => period.frequency === context.frequency && period.index < axis.length,
  );

  if (
    prunedCodes.length === filters.codes.length &&
    prunedCenterIds.length === filters.centerIds.length &&
    prunedClientIds.length === filters.clientIds.length &&
    prunedYears.length === filters.years.length &&
    prunedPeriods.length === filters.periods.length
  ) {
    return filters;
  }
  return {
    codes: prunedCodes,
    centerIds: prunedCenterIds,
    clientIds: prunedClientIds,
    years: prunedYears,
    periods: prunedPeriods,
    // It is not pruned here: whether a preset view is drawable is known from the account NAMES, which
    // this context does not carry. With a plan that does not admit it it stays inert —the card draws
    // the usual thing— and the bar's section does not even render.
    preset: filters.preset,
  };
}
