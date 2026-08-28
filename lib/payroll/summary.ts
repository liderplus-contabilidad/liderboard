/**
 * The four "Historial de nómina" stat tiles, computed from the ALREADY-FILTERED período list — the
 * same rule PyG's cards follow (`lib/profit-loss/filters.ts`): a card built from the raw list would
 * show "Períodos registrados: 5" over a table the search box or the year filter just narrowed to 2.
 */
import type { PayrollPeriodFinancials } from "./period-detail";
import { periodShortLabel, sortPeriodsDesc } from "./periods";
import type { PayrollPeriod, PayrollRosterSummary } from "./types";

export interface PayrollSummary {
  periodCount: number;
  /** «JUN 2026», the most recent período in its short label; `null` with nothing to show. */
  latestPeriodLabel: string | null;
  /**
   * Employees of the MOST RECENT período only — never the sum across períodos, which would count the
   * same person once per month they appear in.
   */
  latestEmployees: number;
  /** Sum of `net` of the períodos that DO have totals; `null` with none — which `StatTile` paints as
   * an empty card's dash, not as zero. */
  netAccrued: number | null;
}

/**
 * `rosterByPeriod` and `financialsByPeriod` are ALWAYS what is derived from each período's stored
 * nómina (`lib/payroll/period-detail.ts`), never a total persisted next to it — a total stored
 * separately could diverge from the lines the período really has.
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
