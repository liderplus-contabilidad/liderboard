/**
 * Rol de Pagos period math: pure. A período's identity is `(year, monthIndex)` — one per cliente,
 * enforced by `db.ts`'s compound index — and everything here reads or orders that pair. Month
 * labels reuse `@/lib/date.ts` rather than redeclaring them.
 */
import { MONTHS_FULL_ES, MONTHS_SHORT_ES } from "@/lib/date";
import { matchesSearch as matchesLabel } from "@/lib/workspaces";
import type { PayrollPeriodKind } from "./types";

const KIND_LABELS: Record<PayrollPeriodKind, string> = { ordinario: "Ordinario" };

export function periodKindLabel(kind: PayrollPeriodKind): string {
  return KIND_LABELS[kind];
}

/** Most recent first: by year, then by month within the year. */
export function sortPeriodsDesc<T extends { year: number; monthIndex: number }>(
  periods: readonly T[],
): T[] {
  return [...periods].sort((a, b) => b.year - a.year || b.monthIndex - a.monthIndex);
}

/** «JUNIO 2026» — the row's bold, uppercase name. */
export function periodLongLabel(year: number, monthIndex: number): string {
  return `${MONTHS_FULL_ES[monthIndex].toUpperCase()} ${year}`;
}

/** «JUN 2026» — the "Último período" stat tile. */
export function periodShortLabel(year: number, monthIndex: number): string {
  return `${MONTHS_SHORT_ES[monthIndex].toUpperCase()} ${year}`;
}

/** The search box: matches the long label, ignoring case and accents — the same rule
 * `@/lib/workspaces` already gives the client selector, so there is one definition of "matches". */
export function matchesSearch(
  period: { year: number; monthIndex: number },
  query: string,
): boolean {
  return matchesLabel(periodLongLabel(period.year, period.monthIndex), query);
}

/** Whether a cliente already has this período — what the "Nuevo período" dialog rejects, naming it. */
export function hasPeriod(
  existing: readonly { year: number; monthIndex: number }[],
  year: number,
  monthIndex: number,
): boolean {
  return existing.some((period) => period.year === year && period.monthIndex === monthIndex);
}

/**
 * The `(año, mes)` the "Nuevo período" dialog preselects: the month after the most recent período,
 * or the current month when the cliente has none yet. `today` arrives as a parameter — never
 * `Date.now()` inside pure code — so the caller can test this deterministically.
 */
export function proposeNextPeriod(
  existing: readonly { year: number; monthIndex: number }[],
  today: Date,
): { year: number; monthIndex: number } {
  if (existing.length === 0) {
    return { year: today.getFullYear(), monthIndex: today.getMonth() };
  }
  const [latest] = sortPeriodsDesc(existing);
  return latest.monthIndex === 11
    ? { year: latest.year + 1, monthIndex: 0 }
    : { year: latest.year, monthIndex: latest.monthIndex + 1 };
}
