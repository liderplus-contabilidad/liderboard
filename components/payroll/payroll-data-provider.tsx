"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import * as payrollDb from "@/lib/payroll/db";
import {
  emptyFilters,
  sanitizeFilters,
  selectPeriods,
  withSearch,
  withYearsCleared,
  withYearToggled,
  type PayrollFilters,
} from "@/lib/payroll/filters";
import { hasPeriod, periodLongLabel } from "@/lib/payroll/periods";
import { buildPayrollSummary, type PayrollSummary } from "@/lib/payroll/summary";
import type { PayrollPeriod, PayrollPeriodKind } from "@/lib/payroll/types";

const EMPTY_PERIODS: PayrollPeriod[] = [];
const EMPTY_CLIENTS: payrollDb.PayrollClientSummary[] = [];

interface PayrollDataValue {
  clients: payrollDb.PayrollClientSummary[];
  activeClientId: string | null;
  activeClient: payrollDb.PayrollClientSummary | undefined;
  createClient: (name: string) => Promise<string>;
  renameClient: (clientId: string, name: string) => Promise<void>;
  deleteClient: (clientId: string) => Promise<void>;
  selectClient: (clientId: string) => Promise<void>;
  /** Every período of the active cliente, unfiltered — the count `PayrollEmptyState` reads to
   * decide between "sin períodos" and the table. */
  periods: PayrollPeriod[];
  /** Years the active cliente holds, newest first — the "Año" filter's universe. */
  years: number[];
  filters: PayrollFilters;
  toggleYear: (year: number) => void;
  clearYears: () => void;
  setSearch: (search: string) => void;
  /** `periods` after the año filter and the search box — what the table renders. */
  visiblePeriods: PayrollPeriod[];
  /** Built from `visiblePeriods`, never raw `periods`, so the four tiles always agree with the
   * table underneath them. */
  summary: PayrollSummary;
  /** The período already registered at `(year, monthIndex)`, in its long label, or `null` — what
   * lets "Nuevo período" name the clash instead of failing in the abstract. */
  periodClash: (year: number, monthIndex: number) => string | null;
  createPeriod: (year: number, monthIndex: number, kind?: PayrollPeriodKind) => Promise<void>;
  /** False only on the very first Dexie read, so the empty state doesn't flash. */
  ready: boolean;
}

const PayrollDataContext = createContext<PayrollDataValue | null>(null);

/**
 * Mounted in the dashboard layout so the header can name the cliente while Historial de nómina
 * renders the table.
 *
 * Todo lo que lee está acotado al CLIENTE abierto, y siempre a través de `db.ts`: con varios
 * clientes compartiendo una tabla, una consulta sin acotar mezcla dos empresas en silencio y nada
 * de lo que hay debajo puede notarlo.
 */
export function PayrollDataProvider({ children }: { children: ReactNode }) {
  const clientRows = useLiveQuery(() => payrollDb.listClientSummaries(), []);
  const activeClientId = useLiveQuery(() => payrollDb.getActiveClientId(), []) ?? null;
  const stored = useLiveQuery(
    () =>
      activeClientId
        ? payrollDb.listPeriods(activeClientId)
        : Promise.resolve<PayrollPeriod[]>(EMPTY_PERIODS),
    [activeClientId],
  );
  const [rawFilters, setRawFilters] = useState<PayrollFilters>(emptyFilters);

  const clients = clientRows ?? EMPTY_CLIENTS;
  const periods = stored ?? EMPTY_PERIODS;
  const ready = clientRows !== undefined && stored !== undefined;

  const activeClient = useMemo(
    () => clients.find((client) => client.id === activeClientId),
    [clients, activeClientId],
  );

  const years = useMemo(
    () => [...new Set(periods.map((period) => period.year))].sort((a, b) => b - a),
    [periods],
  );

  // Pruned on read, never in an effect: the marks are never a render behind the workspace (a
  // cliente switch, a período that no longer exists).
  const filters = useMemo(() => sanitizeFilters(rawFilters, years), [rawFilters, years]);

  const visiblePeriods = useMemo(() => selectPeriods(periods, filters), [periods, filters]);
  // Las tarjetas leen el conjunto FILTRADO — no `periods` crudo — para que sus cifras siempre
  // cuadren con lo que la tabla de abajo está mostrando: un "Períodos registrados: 5" sobre una
  // tabla que la búsqueda dejó en 2 sería una tarjeta mintiendo por omisión.
  const summary = useMemo(() => buildPayrollSummary(visiblePeriods), [visiblePeriods]);

  const createClient = useCallback(async (name: string) => {
    const client = await payrollDb.createClient(name);
    return client.id;
  }, []);

  const renameClient = useCallback(
    (clientId: string, name: string) => payrollDb.renameClient(clientId, name),
    [],
  );

  const deleteClient = useCallback(async (clientId: string) => {
    await payrollDb.deleteClient(clientId);
  }, []);

  const selectClient = useCallback(async (clientId: string) => {
    await payrollDb.setActiveClient(clientId);
    // Nothing of the previous cliente's selection carries over: it named períodos this one does
    // not have.
    setRawFilters(emptyFilters());
  }, []);

  const toggleYear = useCallback(
    (year: number) => setRawFilters((current) => withYearToggled(current, year, years)),
    [years],
  );
  const clearYears = useCallback(() => setRawFilters(withYearsCleared), []);
  const setSearch = useCallback(
    (search: string) => setRawFilters((current) => withSearch(current, search)),
    [],
  );

  const periodClash = useCallback(
    (year: number, monthIndex: number) =>
      hasPeriod(periods, year, monthIndex) ? periodLongLabel(year, monthIndex) : null,
    [periods],
  );

  const createPeriod = useCallback(
    async (year: number, monthIndex: number, kind: PayrollPeriodKind = "ordinario") => {
      if (!activeClientId) {
        return;
      }
      await payrollDb.createPeriod(activeClientId, year, monthIndex, kind);
    },
    [activeClientId],
  );

  const value = useMemo<PayrollDataValue>(
    () => ({
      clients,
      activeClientId,
      activeClient,
      createClient,
      renameClient,
      deleteClient,
      selectClient,
      periods,
      years,
      filters,
      toggleYear,
      clearYears,
      setSearch,
      visiblePeriods,
      summary,
      periodClash,
      createPeriod,
      ready,
    }),
    [
      clients,
      activeClientId,
      activeClient,
      createClient,
      renameClient,
      deleteClient,
      selectClient,
      periods,
      years,
      filters,
      toggleYear,
      clearYears,
      setSearch,
      visiblePeriods,
      summary,
      periodClash,
      createPeriod,
      ready,
    ],
  );

  return <PayrollDataContext.Provider value={value}>{children}</PayrollDataContext.Provider>;
}

export function usePayrollData(): PayrollDataValue {
  const context = useContext(PayrollDataContext);
  if (!context) {
    throw new Error("usePayrollData debe usarse dentro de <PayrollDataProvider>.");
  }
  return context;
}
