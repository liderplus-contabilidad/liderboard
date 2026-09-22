/**
 * Cheques' selection: search · account · step · year, under the same house rules as `filters.ts`.
 *
 * «Año» is the declared exception of Ventas, Costo de personal and PyG: no mark resolves to ONE year
 * and not to all of them — the register holds twelve thousand rows since 2017, and a grid that
 * opened on every year would be a wall. That one year is the CUT DATE's (what the reader is working
 * in), and only when the register has nothing for it the most recent one it does hold, so the grid
 * never opens empty over a book full of rows. `yearMarkLabel` names what is on screen; «Todos los
 * años» MARKS them all.
 */
import { normalizeLabel } from "@/lib/workspaces";
import type { Check, CheckStep } from "./types";
import { CHECK_STEPS } from "./checks";

/** «Anulado» is a value of the step filter, so it has a name here. */
export type StepMark = CheckStep | "voided";

export const STEP_MARKS: readonly StepMark[] = [...CHECK_STEPS, "voided"];

export interface CheckFilters {
  search: string;
  /** Account ids, or the sentinel `UNASSIGNED` for the checks that resolved to none. */
  accountIds: string[];
  steps: StepMark[];
  years: number[];
}

export const UNASSIGNED = "__unassigned__";

export function emptyCheckFilters(): CheckFilters {
  return { search: "", accountIds: [], steps: [], years: [] };
}

function toggled<T>(marks: readonly T[], value: T, universe: readonly T[]): T[] {
  const picked = new Set(marks);
  if (picked.has(value)) {
    picked.delete(value);
  } else {
    picked.add(value);
  }
  return universe.filter((candidate) => picked.has(candidate));
}

export function withCheckSearch(filters: CheckFilters, search: string): CheckFilters {
  return { ...filters, search };
}

export function withAccountToggled(
  filters: CheckFilters,
  accountId: string,
  universe: readonly string[],
): CheckFilters {
  return { ...filters, accountIds: toggled(filters.accountIds, accountId, universe) };
}

export function withStepToggled(filters: CheckFilters, step: StepMark): CheckFilters {
  return { ...filters, steps: toggled(filters.steps, step, STEP_MARKS) };
}

export function withYearToggled(
  filters: CheckFilters,
  year: number,
  universe: readonly number[],
): CheckFilters {
  return { ...filters, years: toggled(filters.years, year, universe) };
}

/** «Todos los años» MARKS every year — under the exception, clearing would mean the latest. */
export function withAllYears(filters: CheckFilters, universe: readonly number[]): CheckFilters {
  return { ...filters, years: [...universe] };
}

export function withYearsCleared(filters: CheckFilters): CheckFilters {
  return { ...filters, years: [] };
}

export function sanitizeCheckFilters(
  filters: CheckFilters,
  accountIds: readonly string[],
  years: readonly number[],
): CheckFilters {
  const knownAccounts = new Set([...accountIds, UNASSIGNED]);
  const knownYears = new Set(years);
  const accounts = filters.accountIds.filter((id) => knownAccounts.has(id));
  const marked = filters.years.filter((year) => knownYears.has(year));
  if (accounts.length === filters.accountIds.length && marked.length === filters.years.length) {
    return filters;
  }
  return { ...filters, accountIds: accounts, years: marked };
}

/** The years the register holds, DESCENDING — the universe of «Año». A check with no issue date
 *  belongs to no year and is listed only with every year marked. */
export function checkYears(checks: readonly Check[]): number[] {
  const years = new Set<number>();
  for (const check of checks) {
    if (check.issuedOn) {
      years.add(Number(check.issuedOn.slice(0, 4)));
    }
  }
  return [...years].sort((a, b) => b - a);
}

/**
 * No year marked = the cut date's year, or the most recent the register holds when that one is
 * absent (the exception); every year marked = all, undated included.
 */
export function resolveVisibleYears(
  marked: readonly number[],
  universe: readonly number[],
  currentYear: number,
): number[] {
  if (marked.length > 0) {
    return [...marked];
  }
  if (universe.includes(currentYear)) {
    return [currentYear];
  }
  return universe.length > 0 ? [universe[0]] : [];
}

export function matchesCheckSearch(check: Check, search: string): boolean {
  const query = normalizeLabel(search);
  if (!query) {
    return true;
  }
  return [check.payee, check.number, check.voucher, check.bank]
    .map(normalizeLabel)
    .some((field) => field.includes(query));
}

export function applyCheckFilters(
  checks: readonly Check[],
  filters: CheckFilters,
  universeYears: readonly number[],
  currentYear: number,
): Check[] {
  const accounts = new Set(filters.accountIds);
  const steps = new Set(filters.steps);
  const visible = resolveVisibleYears(filters.years, universeYears, currentYear);
  const years = new Set(visible);
  const everyYear = visible.length === universeYears.length;
  return checks.filter((check) => {
    if (accounts.size > 0 && !accounts.has(check.accountId ?? UNASSIGNED)) {
      return false;
    }
    if (steps.size > 0 && !steps.has(check.voided ? "voided" : check.step)) {
      return false;
    }
    const year = check.issuedOn ? Number(check.issuedOn.slice(0, 4)) : null;
    if (year === null ? !everyYear : !years.has(year)) {
      return false;
    }
    return matchesCheckSearch(check, filters.search);
  });
}
