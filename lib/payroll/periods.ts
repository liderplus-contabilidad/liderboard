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
 * La fuente de «Copiar nómina de X»: el período MÁS RECIENTE estrictamente ANTERIOR al destino
 * — nunca el más reciente que existe. Sin esa distinción, rellenar un mes hacia atrás (el
 * cliente ya tiene junio y se registra abril) copiaría del futuro. `null` sin ningún período
 * anterior al destino.
 */
export function sourceForCopy<T extends { year: number; monthIndex: number }>(
  existing: readonly T[],
  targetYear: number,
  targetMonthIndex: number,
): T | null {
  const before = existing.filter(
    (period) =>
      period.year < targetYear ||
      (period.year === targetYear && period.monthIndex < targetMonthIndex),
  );
  return before.length === 0 ? null : sortPeriodsDesc(before)[0];
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

/**
 * El período INMEDIATAMENTE anterior o siguiente a `currentId`, en el orden real de los períodos
 * guardados — lo que el navegador `‹ JULIO 2026 ›` de la pantalla de detalle usa para decidir si
 * una flecha se apaga. `null` sin vecino de ese lado, o si `currentId` no aparece en `periods`.
 */
export function adjacentPeriod<T extends { id: string; year: number; monthIndex: number }>(
  periods: readonly T[],
  currentId: string,
  direction: "prev" | "next",
): T | null {
  // Most-recent-first: "siguiente" (más nuevo) queda ANTES del actual en este orden; "anterior"
  // (más viejo) queda DESPUÉS.
  const ordered = sortPeriodsDesc(periods);
  const index = ordered.findIndex((period) => period.id === currentId);
  if (index === -1) {
    return null;
  }
  const targetIndex = direction === "next" ? index - 1 : index + 1;
  return ordered[targetIndex] ?? null;
}
