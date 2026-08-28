"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useCallback, useMemo, useState } from "react";
import { ChartCard } from "@/components/ui/chart-card";
import { EmptyState } from "@/components/ui/empty-state";
import { costCenterHeading, letterheadLogos } from "@/lib/cost-center";
import { employeesForPeriods } from "@/lib/payroll/db";
import { DEFAULT_PAYROLL_PARAMETERS } from "@/lib/payroll/engine/parameters";
import { buildSalariesCard } from "@/lib/payroll/salaries/chart";
import {
  emptyFilters,
  sanitizeFilters,
  withAreasCleared,
  withAreaToggled,
  withMonthsCleared,
  withMonthToggled,
  withYearsCleared,
  withYearToggled,
  type SalariesFilters,
} from "@/lib/payroll/salaries/filters";
import {
  buildSalariesGrid,
  salariesUniverse,
  type SalariesSource,
} from "@/lib/payroll/salaries/grid";
import type { PayrollEmployeeLine } from "@/lib/payroll/types";
import { PayrollEmptyState } from "../payroll-empty-state";
import { usePayrollData } from "../payroll-data-provider";
import { SalariesReportButton } from "./report/salaries-report-button";
import { SalariesToolbar } from "./salaries-toolbar";

const EMPTY_LINES: Map<string, PayrollEmployeeLine[]> = new Map();

/**
 * Sueldos por Áreas: the evolution of the TOTAL COST by area —or by employee within an area— across
 * the months and years the client has registered.
 *
 * Everything it shows is DERIVED and nothing is stored: each employee's figure comes out of the
 * engine on every render (`buildSalariesGrid`), just like the período totals and the journal entry. A
 * copy stored on the side would go stale on the next adjustment and the screen would say one thing
 * and the data another.
 *
 * The marks live HERE and not in `PayrollDataProvider`: the house rule is that a provider is in the
 * layout because the header reads from the same state as the panel, and the only thing the header
 * reads from this module is the client, which the provider already gives. Lifting these marks would
 * put something in the layout that no other screen reads.
 */
export function SalariesView() {
  const { activeClient, activeClientId, periods, ready } = usePayrollData();
  const [rawFilters, setRawFilters] = useState<SalariesFilters>(emptyFilters);

  // One single query for ALL the client's períodos, bounded by their ids — never an unbounded read,
  // which is what would mix the nómina of two companies.
  const linesByPeriod = useLiveQuery(
    () => employeesForPeriods(periods.map((period) => period.id)),
    [periods],
  );

  const source = useMemo<SalariesSource>(
    () => ({ periods, linesByPeriod: linesByPeriod ?? EMPTY_LINES }),
    [periods, linesByPeriod],
  );

  const universe = useMemo(() => salariesUniverse(source), [source]);
  // The letterhead's left/right split, resolved where it is resolved on the other two papers.
  const reportLogos = letterheadLogos(activeClient?.logo, activeClient?.costCenter);
  // Pruned on READ, never in an effect: switching client does not leave a render with marks for years
  // this client does not have.
  const filters = useMemo(() => sanitizeFilters(rawFilters, universe), [rawFilters, universe]);

  const grid = useMemo(
    () => buildSalariesGrid(source, filters, DEFAULT_PAYROLL_PARAMETERS),
    [source, filters],
  );
  const card = useMemo(() => buildSalariesCard(grid, describeSelection(grid)), [grid]);

  const toggleArea = useCallback(
    (area: string) => setRawFilters((current) => withAreaToggled(current, area, universe.areas)),
    [universe.areas],
  );
  const toggleYear = useCallback(
    (year: number) => setRawFilters((current) => withYearToggled(current, year, universe.years)),
    [universe.years],
  );
  const toggleMonth = useCallback(
    (month: number) =>
      setRawFilters((current) => withMonthToggled(current, month, universe.months)),
    [universe.months],
  );
  const clearAreas = useCallback(() => setRawFilters(withAreasCleared), []);
  const clearYears = useCallback(() => setRawFilters(withYearsCleared), []);
  const clearMonths = useCallback(() => setRawFilters(withMonthsCleared), []);
  const clearAll = useCallback(() => setRawFilters(emptyFilters()), []);

  // Before the first read from Dexie it is not known whether there are clients: waiting avoids the
  // empty state flickering over a space that actually already has one.
  if (!ready) {
    return null;
  }

  // With no client and no períodos the empty state names the missing step, not this screen.
  if (activeClientId === null || periods.length === 0) {
    return <PayrollEmptyState />;
  }

  return (
    <div className="px-7 py-5">
      <div className="mb-4 flex items-center justify-between gap-4 rounded-[13px] border border-border bg-surface px-5 py-4">
        <div>
          <h2 className="text-[15px] font-bold tracking-[-0.2px] text-ink">Sueldos por áreas</h2>
          <p className="mt-0.5 text-[12.5px] text-faint">
            Evolución del costo total de la nómina, mes a mes. Marca un área para ver a sus
            empleados uno por uno.
          </p>
        </div>
        <SalariesReportButton
          clientName={costCenterHeading(activeClient?.name ?? "Cliente", activeClient?.costCenter)}
          {...(reportLogos.left ? { logo: reportLogos.left } : {})}
          {...(reportLogos.right ? { rightLogo: reportLogos.right } : {})}
          source={source}
          filters={filters}
          hasPayroll={universe.areas.length > 0}
        />
      </div>

      <div className="mb-4">
        <SalariesToolbar
          universe={universe}
          filters={filters}
          onToggleArea={toggleArea}
          onToggleYear={toggleYear}
          onToggleMonth={toggleMonth}
          onClearAreas={clearAreas}
          onClearYears={clearYears}
          onClearMonths={clearMonths}
          onClearAll={clearAll}
        />
      </div>

      {grid.columns.length === 0 || grid.rows.length === 0 ? (
        <div className="rounded-[13px] border border-border bg-surface">
          <EmptyState className="py-14">{emptyReason(grid.columns.length === 0)}</EmptyState>
        </div>
      ) : (
        <ChartCard
          title={card.title}
          subtitle={card.subtitle}
          option={card.option}
          table={card.table}
          note={card.note}
          height={card.height}
        />
      )}
    </div>
  );
}

/** What period it is showing, in plain Spanish — what the card's subtitle says. */
function describeSelection(grid: ReturnType<typeof buildSalariesGrid>): string | undefined {
  const { columns } = grid;
  if (columns.length === 0) {
    return undefined;
  }
  const first = columns[0].label;
  const last = columns[columns.length - 1].label;
  const range = columns.length === 1 ? first : `${first} – ${last}`;
  return grid.mode === "detalle"
    ? `Costo total por empleado · ${range}`
    : `Costo total por área · ${range}`;
}

/** The empty state names the mark that produced it, so it is clear which one to remove. */
function emptyReason(noColumns: boolean): string {
  return noColumns
    ? "Ningún período coincide con el año y el mes marcados."
    : "Ninguna área tiene nómina en los meses marcados.";
}
