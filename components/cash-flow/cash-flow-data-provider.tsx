"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { deriveCashMatrix, type CashMatrix } from "@/lib/cash-flow/cash-entries";
import * as cashDb from "@/lib/cash-flow/db";
import {
  applyCheckFilters,
  checkYears,
  emptyCheckFilters,
  resolveVisibleYears,
  sanitizeCheckFilters,
  type CheckFilters,
} from "@/lib/cash-flow/check-filters";
import { todayISO } from "@/lib/cash-flow/dates";
import { payableTotals, type PayableTotals } from "@/lib/cash-flow/derive";
import {
  applyFilters,
  emptyPayableFilters,
  sanitizeFilters,
  type PayableFilters,
} from "@/lib/cash-flow/filters";
import { deriveFlow, previousFlow, type DerivedFlow } from "@/lib/cash-flow/flow";
import type {
  BankAccount,
  CashEntry,
  CashFlowCenter,
  Check,
  Payable,
  PaymentFlow,
} from "@/lib/cash-flow/types";
import type { EntityLogo } from "@/lib/workspaces";

const EMPTY_CLIENTS: cashDb.CashFlowClientSummary[] = [];
const EMPTY_CENTERS: CashFlowCenter[] = [];
const EMPTY_ACCOUNTS: BankAccount[] = [];
const EMPTY_PAYABLES: Payable[] = [];
const EMPTY_CHECKS: Check[] = [];
const EMPTY_FLOWS: PaymentFlow[] = [];
const EMPTY_CASH_ENTRIES: CashEntry[] = [];
const EMPTY_CUTS: cashDb.CutMeta[] = [];

interface CashFlowDataValue {
  clients: cashDb.CashFlowClientSummary[];
  activeClientId: string | null;
  activeClient: cashDb.CashFlowClientSummary | undefined;
  createClient: (name: string, logo?: EntityLogo) => Promise<string>;
  updateClient: (clientId: string, name: string, logo: EntityLogo | null) => Promise<void>;
  deleteClient: (clientId: string) => Promise<void>;
  selectClient: (clientId: string) => Promise<void>;
  /** False only on the very first Dexie read, so the empty state doesn't flash. */
  ready: boolean;

  centers: CashFlowCenter[];
  accounts: BankAccount[];
  payables: Payable[];
  checks: Check[];
  flows: PaymentFlow[];
  cuts: cashDb.CutMeta[];
  /** The hand-written rows of «Cargas cash», both sections. */
  cashEntries: CashEntry[];

  /** The FECHA DE CORTE — the one date every tab reads at (design D11). Today by default. */
  asOf: string;
  setAsOf: (iso: string) => void;
  isToday: boolean;

  payableFilters: PayableFilters;
  setPayableFilters: (update: (current: PayableFilters) => PayableFilters) => void;
  /** `payables` after the bar — what the CxP grid, tiles and Excel read. */
  visiblePayables: Payable[];
  /** Open documents narrowed by the bar's CENTER only — what the flow and Resumen read. */
  scopedPayables: Payable[];
  totals: PayableTotals;

  checkFilters: CheckFilters;
  setCheckFilters: (update: (current: CheckFilters) => CheckFilters) => void;
  checkYearUniverse: number[];
  /** The years on screen once the exception resolves (`resolveVisibleYears`) — what «Año» names. */
  visibleCheckYears: number[];
  visibleChecks: Check[];

  /** The flow OF `asOf`, or `null` when nothing was captured that day. */
  flow: PaymentFlow | null;
  /** The latest flow strictly before `asOf` — what «Copiar del anterior» offers. */
  previous: PaymentFlow | null;
  derived: DerivedFlow;
  /** The three matrices of «Cargas cash»: the manual rows plus PROVEEDORES off `scopedPayables`. */
  cashMatrix: CashMatrix;
}

const CashFlowDataContext = createContext<CashFlowDataValue | null>(null);

/**
 * Mounted in the dashboard layout so the header can name the empresa while the page renders the
 * open tab. Everything it reads is bounded to the OPEN empresa and goes through `db.ts`.
 *
 * The cut date, the bar's filters and the derived flow live here and not in a tab because the
 * four tabs read the SAME date and the same center mark, and Resumen reads the same `deriveFlow`
 * the Flujo tab paints: two copies of that state would be two readings waiting to disagree.
 */
export function CashFlowDataProvider({ children }: { children: ReactNode }) {
  const clientRows = useLiveQuery(() => cashDb.listClientSummaries(), []);
  const activeClientId = useLiveQuery(() => cashDb.getActiveClientId(), []) ?? null;
  const centerRows = useLiveQuery(
    () => (activeClientId ? cashDb.listCenters(activeClientId) : Promise.resolve(EMPTY_CENTERS)),
    [activeClientId],
  );
  const accountRows = useLiveQuery(
    () => (activeClientId ? cashDb.listAccounts(activeClientId) : Promise.resolve(EMPTY_ACCOUNTS)),
    [activeClientId],
  );
  const payableRows = useLiveQuery(
    () => (activeClientId ? cashDb.listPayables(activeClientId) : Promise.resolve(EMPTY_PAYABLES)),
    [activeClientId],
  );
  const checkRows = useLiveQuery(
    () => (activeClientId ? cashDb.listChecks(activeClientId) : Promise.resolve(EMPTY_CHECKS)),
    [activeClientId],
  );
  const flowRows = useLiveQuery(
    () => (activeClientId ? cashDb.listFlows(activeClientId) : Promise.resolve(EMPTY_FLOWS)),
    [activeClientId],
  );
  const cutRows = useLiveQuery(
    () => (activeClientId ? cashDb.listCuts(activeClientId) : Promise.resolve(EMPTY_CUTS)),
    [activeClientId],
  );
  const cashEntryRows = useLiveQuery(
    () =>
      activeClientId ? cashDb.listCashEntries(activeClientId) : Promise.resolve(EMPTY_CASH_ENTRIES),
    [activeClientId],
  );

  const [asOf, setAsOf] = useState<string>(() => todayISO());
  const [rawPayableFilters, setRawPayableFilters] = useState<PayableFilters>(emptyPayableFilters);
  const [rawCheckFilters, setRawCheckFilters] = useState<CheckFilters>(emptyCheckFilters);

  const clients = clientRows ?? EMPTY_CLIENTS;
  const centers = centerRows ?? EMPTY_CENTERS;
  const accounts = accountRows ?? EMPTY_ACCOUNTS;
  const payables = payableRows ?? EMPTY_PAYABLES;
  const checks = checkRows ?? EMPTY_CHECKS;
  const flows = flowRows ?? EMPTY_FLOWS;
  const cuts = cutRows ?? EMPTY_CUTS;
  const cashEntries = cashEntryRows ?? EMPTY_CASH_ENTRIES;
  const ready = clientRows !== undefined;

  const activeClient = useMemo(
    () => clients.find((client) => client.id === activeClientId),
    [clients, activeClientId],
  );

  // Pruned on read, never in an effect.
  const payableFilters = useMemo(
    () => sanitizeFilters(rawPayableFilters, centers),
    [rawPayableFilters, centers],
  );
  const visiblePayables = useMemo(
    () => applyFilters(payables, payableFilters, centers, asOf),
    [payables, payableFilters, centers, asOf],
  );
  // The center mark alone: the flow and Resumen are not narrowed by the CxP tab's own marks.
  const scopedPayables = useMemo(
    () =>
      applyFilters(
        payables,
        { ...emptyPayableFilters(), centerIds: payableFilters.centerIds },
        centers,
        asOf,
      ),
    [payables, payableFilters.centerIds, centers, asOf],
  );
  const totals = useMemo(() => payableTotals(visiblePayables, asOf), [visiblePayables, asOf]);

  const checkYearUniverse = useMemo(() => checkYears(checks), [checks]);
  const accountIds = useMemo(() => accounts.map((account) => account.id), [accounts]);
  const checkFilters = useMemo(
    () => sanitizeCheckFilters(rawCheckFilters, accountIds, checkYearUniverse),
    [rawCheckFilters, accountIds, checkYearUniverse],
  );
  const asOfYear = Number(asOf.slice(0, 4));
  const visibleChecks = useMemo(
    () => applyCheckFilters(checks, checkFilters, checkYearUniverse, asOfYear),
    [checks, checkFilters, checkYearUniverse, asOfYear],
  );
  const visibleCheckYears = useMemo(
    () => resolveVisibleYears(checkFilters.years, checkYearUniverse, asOfYear),
    [checkFilters.years, checkYearUniverse, asOfYear],
  );

  const flow = useMemo(() => flows.find((row) => row.date === asOf) ?? null, [flows, asOf]);
  const previous = useMemo(() => previousFlow(flows, asOf), [flows, asOf]);
  const scopedAccounts = useMemo(() => {
    const marked = new Set(payableFilters.centerIds);
    return marked.size === 0
      ? accounts
      : accounts.filter((account) => account.centerId && marked.has(account.centerId));
  }, [accounts, payableFilters.centerIds]);
  const derived = useMemo(
    () =>
      deriveFlow({
        date: asOf,
        flow,
        accounts: scopedAccounts,
        centers,
        payables: scopedPayables,
        checks,
        since: previous?.date ?? null,
      }),
    [asOf, flow, scopedAccounts, centers, scopedPayables, checks, previous],
  );
  const cashMatrix = useMemo(
    () => deriveCashMatrix(cashEntries, centers, scopedPayables),
    [cashEntries, centers, scopedPayables],
  );

  const createClient = useCallback(async (name: string, logo?: EntityLogo) => {
    const client = await cashDb.createClient(name, logo);
    return client.id;
  }, []);
  const updateClient = useCallback(
    (clientId: string, name: string, logo: EntityLogo | null) =>
      cashDb.updateClient(clientId, name, logo),
    [],
  );
  const deleteClient = useCallback((clientId: string) => cashDb.deleteClient(clientId), []);
  const selectClient = useCallback(async (clientId: string) => {
    await cashDb.setActiveClient(clientId);
    // Nothing of the previous empresa's selection carries over: it named centers and accounts this
    // one does not have.
    setRawPayableFilters(emptyPayableFilters());
    setRawCheckFilters(emptyCheckFilters());
  }, []);

  const value = useMemo<CashFlowDataValue>(
    () => ({
      clients,
      activeClientId,
      activeClient,
      createClient,
      updateClient,
      deleteClient,
      selectClient,
      ready,
      centers,
      accounts,
      payables,
      checks,
      flows,
      cuts,
      cashEntries,
      asOf,
      setAsOf,
      isToday: asOf === todayISO(),
      payableFilters,
      setPayableFilters: setRawPayableFilters,
      visiblePayables,
      scopedPayables,
      totals,
      checkFilters,
      setCheckFilters: setRawCheckFilters,
      checkYearUniverse,
      visibleCheckYears,
      visibleChecks,
      flow,
      previous,
      derived,
      cashMatrix,
    }),
    [
      clients,
      activeClientId,
      activeClient,
      createClient,
      updateClient,
      deleteClient,
      selectClient,
      ready,
      centers,
      accounts,
      payables,
      checks,
      flows,
      cuts,
      cashEntries,
      asOf,
      payableFilters,
      visiblePayables,
      scopedPayables,
      totals,
      checkFilters,
      checkYearUniverse,
      visibleCheckYears,
      visibleChecks,
      flow,
      previous,
      derived,
      cashMatrix,
    ],
  );

  return <CashFlowDataContext.Provider value={value}>{children}</CashFlowDataContext.Provider>;
}

export function useCashFlowData(): CashFlowDataValue {
  const context = useContext(CashFlowDataContext);
  if (!context) {
    throw new Error("useCashFlowData debe usarse dentro de <CashFlowDataProvider>.");
  }
  return context;
}
