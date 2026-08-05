/**
 * The four "Historial de nómina" stat tiles, computed from the ALREADY-FILTERED período list — the
 * same rule PyG's cards follow (`lib/profit-loss/filters.ts`): a card built from the raw list would
 * show "Períodos registrados: 5" over a table the búsqueda or el filtro de año just narrowed to 2.
 */
import { periodShortLabel, sortPeriodsDesc } from "./periods";
import type { PayrollPeriod } from "./types";

export interface PayrollSummary {
  periodCount: number;
  /** «JUN 2026», el período más reciente en su etiqueta corta; `null` sin nada que mostrar. */
  latestPeriodLabel: string | null;
  /**
   * Empleados del período MÁS RECIENTE únicamente — nunca la suma entre períodos, que contaría a
   * la misma persona una vez por cada mes en que aparece.
   */
  latestEmployees: number;
  /** Suma de `net` de los períodos que SÍ tienen totales; `null` sin ninguno — que `StatTile`
   * pinta como la raya de una tarjeta vacía, no como cero. */
  netAccrued: number | null;
}

export function buildPayrollSummary(periods: readonly PayrollPeriod[]): PayrollSummary {
  const [latest] = sortPeriodsDesc(periods);
  const withTotals = periods.filter((period) => period.totals !== undefined);

  return {
    periodCount: periods.length,
    latestPeriodLabel: latest ? periodShortLabel(latest.year, latest.monthIndex) : null,
    latestEmployees: latest?.totals?.employees ?? 0,
    netAccrued:
      withTotals.length > 0
        ? withTotals.reduce((total, period) => total + (period.totals?.net ?? 0), 0)
        : null,
  };
}
