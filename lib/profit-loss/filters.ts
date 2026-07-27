/**
 * The single selection of PyG: which accounts, cost centers and periods are marked in the
 * filter bar. There is no dimension to declare here — unlike the "Comparar por" model this
 * replaces, the comparison axis is never chosen; it falls out of whichever lists end up
 * populated. `lib/profit-loss/charts/selection.ts` turns this into a `SeriesQuery`; this module
 * only owns the state and its own sanitation, so `PygDataProvider` (which needs it for the
 * Datos tab too) never has to import from `charts/`.
 */
import { periodsForYear } from "./analytics/period";
import type { PeriodRef } from "./analytics/types";
import type { Frequency } from "./types";

/** Marking no center IS the Consolidado; it never appears as a checkbox of its own. */
export const CONSOLIDADO_ID = "consolidado";

/** What the filter bar has marked. */
export interface PygFilters {
  codes: string[];
  centerIds: string[];
  periods: PeriodRef[];
}

export function emptyFilters(): PygFilters {
  return { codes: [], centerIds: [], periods: [] };
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

export function withCodeToggled(
  filters: PygFilters,
  code: string,
  universe: readonly string[],
): PygFilters {
  return { ...filters, codes: toggled(filters.codes, code, universe) };
}

export function withCenterToggled(
  filters: PygFilters,
  centerId: string,
  universe: readonly string[],
): PygFilters {
  return { ...filters, centerIds: toggled(filters.centerIds, centerId, universe) };
}

/**
 * Periods toggle by INDEX rather than by reference/deep-equality — a `PeriodRef` is a plain
 * `(year, frequency, index)` triple and two periods of the same axis only ever differ by index.
 */
export function withPeriodToggled(
  filters: PygFilters,
  period: PeriodRef,
  universe: readonly PeriodRef[],
): PygFilters {
  const picked = new Set(filters.periods.map((p) => p.index));
  if (picked.has(period.index)) {
    picked.delete(period.index);
  } else {
    picked.add(period.index);
  }
  return { ...filters, periods: universe.filter((candidate) => picked.has(candidate.index)) };
}

/** Each dropdown's own "Quitar selección" footer button clears only ITS list. */
export function withCodesCleared(filters: PygFilters): PygFilters {
  return { ...filters, codes: [] };
}

/** The "Todos (Consolidado)" shortcut: clears only the center selection. */
export function withCentersCleared(filters: PygFilters): PygFilters {
  return { ...filters, centerIds: [] };
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

/** The workspace's persisted `activeCenterId` becomes the initial center selection: the
 * Consolidado (or nothing persisted yet) seeds no marks, a real center seeds itself marked. */
export function seedCenterIds(persistedActiveCenterId: string | undefined): string[] {
  return persistedActiveCenterId && persistedActiveCenterId !== CONSOLIDADO_ID
    ? [persistedActiveCenterId]
    : [];
}

export interface FilterSanitizeContext {
  views: readonly FilterView[];
  year: number;
  frequency: Frequency;
}

/**
 * Prunes what stopped existing, read at render time rather than in an effect so the filters are
 * never a render out of step with the workspace: a center that left the workspace, an account
 * the RESOLVED center no longer reports, a period a coarser frequency no longer has a slot for.
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

  const axis = periodsForYear(context.year, context.frequency);
  const prunedPeriods = filters.periods.filter(
    (period) =>
      period.year === context.year &&
      period.frequency === context.frequency &&
      period.index < axis.length,
  );

  if (
    prunedCodes.length === filters.codes.length &&
    prunedCenterIds.length === filters.centerIds.length &&
    prunedPeriods.length === filters.periods.length
  ) {
    return filters;
  }
  return { codes: prunedCodes, centerIds: prunedCenterIds, periods: prunedPeriods };
}
