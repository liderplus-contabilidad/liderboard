"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import type { CompanyProfile } from "@/lib/company-profile";
import type { CostCenter } from "@/lib/cost-center";
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
  createClient: (
    name: string,
    logo?: EntityLogo,
    company?: CompanyProfile,
    costCenter?: CostCenter,
  ) => Promise<string>;
  /** Changes the LABEL — name, logo, company data and cost center — and nothing else. */
  updateClient: (
    clientId: string,
    name: string,
    logo: EntityLogo | null,
    company?: CompanyProfile,
    /** `null` erases the stored center; `undefined` leaves it as it is. */
    costCenter?: CostCenter | null,
  ) => Promise<void>;
  deleteClient: (clientId: string) => Promise<void>;
  selectClient: (clientId: string) => Promise<void>;
  /** Every período of the active cliente, unfiltered — the count `PayrollEmptyState` reads to
   * decide between "sin períodos" and the table. */
  periods: PayrollPeriod[];
  /** Employees and areas of EACH período of the active cliente, derived from its stored nómina —
   * never a total persisted alongside it. Keyed by `period.id`. */
  rosterByPeriod: Map<string, PayrollRosterSummary>;
  /** The four totals of EACH período of the active cliente, derived from its stored nómina — same
   * rule as `rosterByPeriod`. No entry for a período that has not received its `figures` yet.
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
  /** Writes the nómina a file brought in, REPLACING whatever the período held — see
   * `db.importRoster` for why it replaces instead of merging. */
  importRoster: (periodId: string, lines: readonly ParsedPayrollEmployeeLine[]) => Promise<void>;
  /** Deletes a período and its nómina in one transaction; the caller decides where to navigate
   *  afterwards (the detail screen goes back to `/payroll`). */
  deletePeriod: (periodId: string) => Promise<void>;
  /** False only on the very first Dexie read, so the empty state doesn't flash. */
  ready: boolean;
}

const PayrollDataContext = createContext<PayrollDataValue | null>(null);

/**
 * Mounted in the dashboard layout so the header can name the cliente while Historial de nómina
 * renders the table.
 *
 * Everything it reads is bounded to the OPEN client, and always through `db.ts`: with several clients
 * sharing one table, an unbounded query mixes two companies in silence and nothing below it can tell.
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
  // Same batched precedent as `rosterRows`: one query for ALL visible períodos, instead of one per
  // row.
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
  // The cards read the FILTERED set — not raw `periods` — so their figures always square with what
  // the table below is showing: a "Períodos registrados: 5" over a table the search box left at 2
  // would be a card lying by omission.
  const summary = useMemo(
    () => buildPayrollSummary(visiblePeriods, rosterByPeriod, financialsByPeriod),
    [visiblePeriods, rosterByPeriod, financialsByPeriod],
  );

  const createClient = useCallback(
    async (name: string, logo?: EntityLogo, company?: CompanyProfile, costCenter?: CostCenter) => {
      const client = await payrollDb.createClient(name, logo, company, costCenter);
      return client.id;
    },
    [],
  );

  const updateClient = useCallback(
    (
      clientId: string,
      name: string,
      logo: EntityLogo | null,
      company?: CompanyProfile,
      costCenter?: CostCenter | null,
    ) => payrollDb.updateClient(clientId, name, logo, company, costCenter),
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
