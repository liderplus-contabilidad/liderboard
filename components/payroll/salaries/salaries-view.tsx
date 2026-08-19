"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useCallback, useMemo, useState } from "react";
import { ChartCard } from "@/components/ui/chart-card";
import { EmptyState } from "@/components/ui/empty-state";
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
 * Sueldos por Áreas: la evolución del COSTO TOTAL por área —o por empleado dentro de un área— a lo
 * largo de los meses y años que el cliente tenga registrados.
 *
 * Todo lo que enseña es DERIVADO y nada se guarda: la cifra de cada empleado sale del motor en cada
 * render (`buildSalariesGrid`), igual que los totales del período y el asiento contable. Una copia
 * guardada aparte quedaría desactualizada al siguiente ajuste y la pantalla diría una cosa y los
 * datos otra.
 *
 * Las marcas viven AQUÍ y no en `PayrollDataProvider`: la regla de la casa es que un provider está
 * en el layout porque la cabecera lee del mismo estado que el panel, y lo único que la cabecera lee
 * de este módulo es el cliente, que el provider ya da. Subir estas marcas sería poner en el layout
 * algo que ninguna otra pantalla lee.
 */
export function SalariesView() {
  const { activeClient, activeClientId, periods, ready } = usePayrollData();
  const [rawFilters, setRawFilters] = useState<SalariesFilters>(emptyFilters);

  // Una sola consulta para TODOS los períodos del cliente, acotada por sus ids — nunca una lectura
  // sin acotar, que es lo que mezclaría la nómina de dos empresas.
  const linesByPeriod = useLiveQuery(
    () => employeesForPeriods(periods.map((period) => period.id)),
    [periods],
  );

  const source = useMemo<SalariesSource>(
    () => ({ periods, linesByPeriod: linesByPeriod ?? EMPTY_LINES }),
    [periods, linesByPeriod],
  );

  const universe = useMemo(() => salariesUniverse(source), [source]);
  // Podado en la LECTURA, nunca en un efecto: cambiar de cliente no deja un render con marcas de
  // años que este cliente no tiene.
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

  // Antes de la primera lectura de Dexie no se sabe si hay clientes: esperar evita el parpadeo del
  // vacío sobre un espacio que en realidad ya tiene uno.
  if (!ready) {
    return null;
  }

  // Sin cliente y sin períodos el vacío nombra el paso que falta, no esta pantalla.
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
          clientName={activeClient?.name ?? "Cliente"}
          {...(activeClient?.logo ? { logo: activeClient.logo } : {})}
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

/** Qué periodo está mostrando, en español llano — lo que el subtítulo de la tarjeta dice. */
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

/** El vacío nombra la marca que lo produjo, para que se sepa cuál quitar. */
function emptyReason(noColumns: boolean): string {
  return noColumns
    ? "Ningún período coincide con el año y el mes marcados."
    : "Ninguna área tiene nómina en los meses marcados.";
}
