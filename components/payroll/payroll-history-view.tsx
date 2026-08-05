"use client";

import { DataGrid } from "@/components/data-table/data-grid";
import { HeadCell } from "@/components/data-table/grid-cells";
import { EmptyState } from "@/components/ui/empty-state";
import { SearchInput } from "@/components/ui/search-input";
import { StatTile } from "@/components/ui/stat-tile";
import { formatAmount, formatNumber, pluralize } from "@/lib/format";
import { NewPeriodButton } from "./new-period-dialog";
import { usePayrollData } from "./payroll-data-provider";
import { PayrollEmptyState } from "./payroll-empty-state";
import { PayrollPeriodRow } from "./payroll-period-row";
import { PayrollYearFilter } from "./payroll-year-filter";

/**
 * Historial de nómina: la vista inicial de Rol de Pagos. Sin `ModuleTabs` — el módulo no tiene
 * pestañas — así que esta es toda la página.
 */
export function PayrollHistoryView() {
  const {
    activeClientId,
    periods,
    visiblePeriods,
    years,
    filters,
    toggleYear,
    clearYears,
    setSearch,
    summary,
    ready,
  } = usePayrollData();

  // Antes de la primera lectura de Dexie no se sabe si hay clientes: esperar evita el parpadeo
  // del vacío «sin clientes» sobre un espacio que en realidad ya tiene uno.
  if (!ready) {
    return null;
  }

  // Sin cliente no hay tarjeta que rendir vacía: el vacío nombra el paso que falta.
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
          value={summary.netAccrued === null ? null : formatAmount(summary.netAccrued)}
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
          <DataGrid minWidth={870}>
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
                <HeadCell width={110}>Estado</HeadCell>
                <HeadCell align="right" width={90} />
              </tr>
            </thead>
            <tbody>
              {visiblePeriods.map((period) => (
                <PayrollPeriodRow key={period.id} period={period} />
              ))}
            </tbody>
          </DataGrid>
        )}
      </div>
    </div>
  );
}
