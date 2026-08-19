"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import type { CompanyProfile } from "@/lib/company-profile";
import type { EntityLogo } from "@/lib/workspaces";
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
import type { PayrollPeriodFinancials } from "@/lib/payroll/period-detail";
import { hasPeriod, periodLongLabel } from "@/lib/payroll/periods";
import { buildPayrollSummary, type PayrollSummary } from "@/lib/payroll/summary";
import type {
  ParsedPayrollEmployeeLine,
  PayrollPeriod,
  PayrollRosterSummary,
} from "@/lib/payroll/types";

const EMPTY_PERIODS: PayrollPeriod[] = [];
const EMPTY_CLIENTS: payrollDb.PayrollClientSummary[] = [];
const EMPTY_ROSTER: Map<string, PayrollRosterSummary> = new Map();
const EMPTY_FINANCIALS: Map<string, PayrollPeriodFinancials> = new Map();

interface PayrollDataValue {
  clients: payrollDb.PayrollClientSummary[];
  activeClientId: string | null;
  activeClient: payrollDb.PayrollClientSummary | undefined;
  createClient: (name: string, logo?: EntityLogo, company?: CompanyProfile) => Promise<string>;
  /** Cambia la ETIQUETA — nombre, logo y datos de la empresa — y nada más. */
  updateClient: (
    clientId: string,
    name: string,
    logo: EntityLogo | null,
    company?: CompanyProfile,
  ) => Promise<void>;
  deleteClient: (clientId: string) => Promise<void>;
  selectClient: (clientId: string) => Promise<void>;
  /** Every período of the active cliente, unfiltered — the count `PayrollEmptyState` reads to
   * decide between "sin períodos" and the table. */
  periods: PayrollPeriod[];
  /** Empleados y áreas de CADA período del cliente activo, derivado de su nómina guardada —
   * nunca un total persistido junto a ella. Keyed by `period.id`. */
  rosterByPeriod: Map<string, PayrollRosterSummary>;
  /** Los cuatro totales de CADA período del cliente activo, derivados de su nómina guardada —
   * misma regla que `rosterByPeriod`. Sin entrada para un período que aún no recibió `figures`.
   * Keyed by `period.id`. */
  financialsByPeriod: Map<string, PayrollPeriodFinancials>;
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
  /** `copyFrom` is a período id: with it, the new período's nómina is copied from that período's
   * (see `db.createPeriod`); without it, the período is born blank. */
  createPeriod: (year: number, monthIndex: number, copyFrom?: string) => Promise<void>;
  /** Escribe la nómina que trajo un archivo, REEMPLAZANDO la que el período tuviera — ver
   * `db.importRoster` para por qué reemplaza en vez de fusionar. */
  importRoster: (periodId: string, lines: readonly ParsedPayrollEmployeeLine[]) => Promise<void>;
  /** Borra un período y su nómina en una transacción; quien llama decide a dónde navegar
   *  después (la pantalla de detalle vuelve a `/payroll`). */
  deletePeriod: (periodId: string) => Promise<void>;
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
  // Depends on `periods` (which período ids to look up) but re-runs on its own whenever the
  // `employees` table changes — Dexie tracks the tables a live query touches, deps here are only
  // for the extra reactivity `periods` itself doesn't already give it.
  const rosterRows = useLiveQuery(
    () => payrollDb.rosterCounts((stored ?? EMPTY_PERIODS).map((period) => period.id)),
    [stored],
  );
  // Mismo precedente batcheado que `rosterRows`: una consulta para TODOS los períodos visibles,
  // en vez de una por fila.
  const financialsRows = useLiveQuery(
    () => payrollDb.periodFinancials((stored ?? EMPTY_PERIODS).map((period) => period.id)),
    [stored],
  );
  const [rawFilters, setRawFilters] = useState<PayrollFilters>(emptyFilters);

  const clients = clientRows ?? EMPTY_CLIENTS;
  const periods = stored ?? EMPTY_PERIODS;
  const rosterByPeriod = rosterRows ?? EMPTY_ROSTER;
  const financialsByPeriod = financialsRows ?? EMPTY_FINANCIALS;
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
  const summary = useMemo(
    () => buildPayrollSummary(visiblePeriods, rosterByPeriod, financialsByPeriod),
    [visiblePeriods, rosterByPeriod, financialsByPeriod],
  );

  const createClient = useCallback(
    async (name: string, logo?: EntityLogo, company?: CompanyProfile) => {
      const client = await payrollDb.createClient(name, logo, company);
      return client.id;
    },
    [],
  );

  const updateClient = useCallback(
    (clientId: string, name: string, logo: EntityLogo | null, company?: CompanyProfile) =>
      payrollDb.updateClient(clientId, name, logo, company),
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

  const importRoster = useCallback(
    (periodId: string, lines: readonly ParsedPayrollEmployeeLine[]) =>
      payrollDb.importRoster(periodId, lines),
    [],
  );

  const deletePeriod = useCallback(async (periodId: string) => {
    await payrollDb.deletePeriod(periodId);
  }, []);

  const periodClash = useCallback(
    (year: number, monthIndex: number) =>
      hasPeriod(periods, year, monthIndex) ? periodLongLabel(year, monthIndex) : null,
    [periods],
  );

  const createPeriod = useCallback(
    async (year: number, monthIndex: number, copyFrom?: string) => {
      if (!activeClientId) {
        return;
      }
      await payrollDb.createPeriod(
        activeClientId,
        year,
        monthIndex,
        copyFrom ? { copyFrom } : undefined,
      );
    },
    [activeClientId],
  );

  const value = useMemo<PayrollDataValue>(
    () => ({
      clients,
      activeClientId,
      activeClient,
      createClient,
      updateClient,
      deleteClient,
      selectClient,
      periods,
      rosterByPeriod,
      financialsByPeriod,
      years,
      filters,
      toggleYear,
      clearYears,
      setSearch,
      visiblePeriods,
      summary,
      periodClash,
      createPeriod,
      importRoster,
      deletePeriod,
      ready,
    }),
    [
      clients,
      activeClientId,
      activeClient,
      createClient,
      updateClient,
      deleteClient,
      selectClient,
      periods,
      rosterByPeriod,
      financialsByPeriod,
      years,
      filters,
      toggleYear,
      clearYears,
      setSearch,
      visiblePeriods,
      summary,
      periodClash,
      createPeriod,
      importRoster,
      deletePeriod,
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
