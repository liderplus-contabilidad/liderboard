/**
 * The four "Historial de nómina" stat tiles, computed from the ALREADY-FILTERED período list — the
 * same rule PyG's cards follow (`lib/profit-loss/filters.ts`): a card built from the raw list would
 * show "Períodos registrados: 5" over a table the búsqueda or el filtro de año just narrowed to 2.
 */
import type { PayrollPeriodFinancials } from "./period-detail";
import { periodShortLabel, sortPeriodsDesc } from "./periods";
import type { PayrollPeriod, PayrollRosterSummary } from "./types";

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

/**
 * `rosterByPeriod` y `financialsByPeriod` son SIEMPRE lo derivado de la nómina guardada de cada
 * período (`lib/payroll/period-detail.ts`), nunca un total persistido junto a él — un total
 * guardado aparte podría divergir de las líneas que de verdad tiene el período.
 */
export function buildPayrollSummary(
  periods: readonly PayrollPeriod[],
  rosterByPeriod: ReadonlyMap<string, PayrollRosterSummary>,
  financialsByPeriod: ReadonlyMap<string, PayrollPeriodFinancials>,
): PayrollSummary {
  const [latest] = sortPeriodsDesc(periods);
  const withFinancials = periods.filter((period) => financialsByPeriod.has(period.id));

  return {
    periodCount: periods.length,
    latestPeriodLabel: latest ? periodShortLabel(latest.year, latest.monthIndex) : null,
    latestEmployees: latest ? (rosterByPeriod.get(latest.id)?.employees ?? 0) : 0,
    netAccrued:
      withFinancials.length > 0
        ? withFinancials.reduce(
            (total, period) => total + (financialsByPeriod.get(period.id)?.net ?? 0),
            0,
          )
        : null,
  };
}
