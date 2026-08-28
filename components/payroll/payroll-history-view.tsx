"use client";

import { DataGrid } from "@/components/data-table/data-grid";
import { HeadCell } from "@/components/data-table/grid-cells";
import { EmptyState } from "@/components/ui/empty-state";
import { SearchInput } from "@/components/ui/search-input";
import { StatTile } from "@/components/ui/stat-tile";
import { formatCurrency, formatNumber, pluralize } from "@/lib/format";
import type { PayrollRosterSummary } from "@/lib/payroll/types";
import { NewPeriodButton } from "./new-period-popover";
import { usePayrollData } from "./payroll-data-provider";
import { PayrollEmptyState } from "./payroll-empty-state";
import { PayrollPeriodRow } from "./payroll-period-row";
import { PayrollYearFilter } from "./payroll-year-filter";

/** What a row reads when its período does not have a single nómina line yet. */
const EMPTY_ROSTER: PayrollRosterSummary = { employees: 0, areas: 0 };

/**
 * Historial de nómina: Rol de Pagos' initial view. No `ModuleTabs` — the module has no tabs — so this
 * is the whole page.
 */
export function PayrollHistoryView() {
  const {
    activeClientId,
    periods,
    rosterByPeriod,
    financialsByPeriod,
    visiblePeriods,
    years,
    filters,
    toggleYear,
    clearYears,
    setSearch,
    summary,
    ready,
  } = usePayrollData();

  // Before the first read from Dexie it is not known whether there are clients: waiting avoids the
  // «no clients» empty state flickering over a space that actually already has one.
  if (!ready) {
    return null;
  }

  // With no client there is no card to render empty: the empty state names the missing step.
  if (activeClientId === null) {
    return <PayrollEmptyState />;
  }

  return (
    <div className="px-7 py-5">
      <div className="mb-4 flex items-center justify-between gap-4 rounded-[13px] border border-border bg-surface px-5 py-4">
        <div>
          <h2 className="text-[15px] font-bold tracking-[-0.2px] text-ink">Historial de nómina</h2>
          <p className="mt-0.5 text-[12.5px] text-faint">
            Consulta la información de cada período de nómina y descarga los roles de pago.
          </p>
        </div>
        <NewPeriodButton />
      </div>

      <div className="mb-4 flex gap-4">
        <StatTile label="Períodos registrados" value={formatNumber(summary.periodCount)} mono />
        <StatTile label="Último período" value={summary.latestPeriodLabel} mono />
        <StatTile label="Empleados en nómina" value={formatNumber(summary.latestEmployees)} mono />
        <StatTile
          label="Líquido acumulado"
          value={
            summary.netAccrued === null ? null : formatCurrency(summary.netAccrued, { cents: true })
          }
          mono
        />
      </div>

      <div className="overflow-hidden rounded-[13px] border border-border bg-surface">
        <div className="flex flex-wrap items-center gap-2.5 border-b border-border bg-surface-header px-[18px] py-3">
          <SearchInput
            size="sm"
            value={filters.search}
            onChange={setSearch}
            placeholder="Buscar período…"
            className="min-w-[220px] flex-1"
          />
          <span className="text-[11.5px] font-medium text-faint">
            {pluralize(visiblePeriods.length, "período")}
          </span>
          <PayrollYearFilter
            years={years}
            selected={filters.years}
            onToggle={toggleYear}
            onSelectAll={clearYears}
          />
        </div>

        {periods.length === 0 ? (
          <PayrollEmptyState />
        ) : visiblePeriods.length === 0 ? (
          <EmptyState className="py-14">Ningún período coincide con lo que buscas.</EmptyState>
        ) : (
          <DataGrid minWidth={790}>
            <thead>
              <tr>
                <HeadCell width={210}>Período</HeadCell>
                <HeadCell width={110}>Tipo</HeadCell>
                <HeadCell align="right" width={100}>
                  Empleados
                </HeadCell>
                <HeadCell align="right" width={150}>
                  Líquido a pagar
                </HeadCell>
                <HeadCell align="right" width={130}>
                  Costo total
                </HeadCell>
                <HeadCell align="right" width={90} />
              </tr>
            </thead>
            <tbody>
              {visiblePeriods.map((period) => (
                <PayrollPeriodRow
                  key={period.id}
                  period={period}
                  roster={rosterByPeriod.get(period.id) ?? EMPTY_ROSTER}
                  financials={financialsByPeriod.get(period.id)}
                />
              ))}
            </tbody>
          </DataGrid>
        )}
      </div>
    </div>
  );
}
