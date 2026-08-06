/**
 * Rol de Pagos' selection: which years are marked and what the search box holds. Mirrors
 * `lib/profit-loss/filters.ts`'s rules — no year marked means EVERY year, a toggle keeps universe
 * order rather than click order, and pruning happens on READ so the selection is never a render
 * behind the workspace.
 */
import { matchesSearch as matchesPeriod, sortPeriodsDesc } from "./periods";
import type { PayrollPeriod } from "./types";

export interface PayrollFilters {
  years: number[];
  search: string;
}

export function emptyFilters(): PayrollFilters {
  return { years: [], search: "" };
}

export function withYearToggled(
  filters: PayrollFilters,
  year: number,
  universe: readonly number[],
): PayrollFilters {
  const picked = new Set(filters.years);
  if (picked.has(year)) {
    picked.delete(year);
  } else {
    picked.add(year);
  }
  return { ...filters, years: universe.filter((candidate) => picked.has(candidate)) };
}

/** "Todos los años": clears the selection rather than marking every year. */
export function withYearsCleared(filters: PayrollFilters): PayrollFilters {
  return { ...filters, years: [] };
}

export function withSearch(filters: PayrollFilters, search: string): PayrollFilters {
  return { ...filters, search };
}

/**
 * Pruned on read against the years the cliente actually holds — never in an effect, so the marks
 * are never a render behind the workspace (a cliente switch, a período deleted elsewhere).
 */
export function sanitizeFilters(
  filters: PayrollFilters,
  loadedYears: readonly number[],
): PayrollFilters {
  const loaded = new Set(loadedYears);
  const prunedYears = filters.years.filter((year) => loaded.has(year));
  if (prunedYears.length === filters.years.length) {
    return filters;
  }
  return { ...filters, years: prunedYears };
}

/** Marking no year is every year; the search box narrows what's left, most-recent-first. */
export function selectPeriods(
  periods: readonly PayrollPeriod[],
  filters: PayrollFilters,
): PayrollPeriod[] {
  const years = new Set(filters.years);
  const filtered = periods.filter(
    (period) =>
      (years.size === 0 || years.has(period.year)) && matchesPeriod(period, filters.search),
  );
  return sortPeriodsDesc(filtered);
}
