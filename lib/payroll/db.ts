/**
 * IndexedDB persistence via Dexie, and the ONLY door to it — the same rule PyG's and Ocupaciones'
 * `db.ts` follow: with several clientes sharing these tables, an unbounded query mixes two
 * companies' nómina in silence, and nothing above can tell. Every read and write below takes a
 * `clientId`.
 *
 * A SEPARATE database (`liderboard-payroll`) from PyG's and Ocupaciones': a cliente of Rol de
 * Pagos and a cliente of PyG are not the same row, even when the contador calls them by the same
 * name — the same resolution already standing between those two modules.
 */
import Dexie, { type Table } from "dexie";
import { sortByName } from "@/lib/workspaces";
import { sortPeriodsDesc } from "./periods";
import type { PayrollClient, PayrollPeriod, PayrollPeriodKind } from "./types";

/** The one-row table that remembers which cliente is open, so it survives a reload. */
interface ActiveClientRow {
  key: "active";
  clientId: string | null;
}

const ACTIVE_KEY = "active";

class PayrollDb extends Dexie {
  clients!: Table<PayrollClient, string>;
  periods!: Table<PayrollPeriod, string>;
  active!: Table<ActiveClientRow, string>;

  constructor() {
    super("liderboard-payroll");
    this.version(1).stores({
      clients: "id",
      // The compound index is UNIQUE (`&`): a cliente cannot hold the same (year, mes) twice, and
      // Dexie rejects the second `add` instead of silently overwriting the first.
      periods: "id, clientId, &[clientId+year+monthIndex]",
      active: "key",
    });
  }
}

export const db = new PayrollDb();

// ---------------------------------------------------------------------------
// Clientes
// ---------------------------------------------------------------------------

/** Every cliente, ordered by name — the list's only order. */
export async function listClients(): Promise<PayrollClient[]> {
  return sortByName(await db.clients.toArray());
}

export async function getClient(clientId: string): Promise<PayrollClient | undefined> {
  return db.clients.get(clientId);
}

/**
 * Creates an EMPTY cliente and opens it. The name is taken as given: validation and duplicate
 * checking are `useEntityNaming`'s job, run where the caller can say what is wrong.
 */
export async function createClient(name: string): Promise<PayrollClient> {
  const client: PayrollClient = { id: crypto.randomUUID(), name };
  await db.transaction("rw", db.clients, db.active, async () => {
    await db.clients.add(client);
    await db.active.put({ key: ACTIVE_KEY, clientId: client.id });
  });
  return client;
}

/** Renaming touches the label and NOTHING else. */
export async function renameClient(clientId: string, name: string): Promise<void> {
  await db.clients.update(clientId, { name });
}

/**
 * Deletes a cliente and every período that hangs off it, in ONE transaction. No other cliente is
 * touched.
 *
 * Deleting the OPEN cliente hands the module to the first remaining one BY NAME; deleting the last
 * one leaves no active cliente, and the module falls back to its empty state.
 */
export async function deleteClient(clientId: string): Promise<void> {
  await db.transaction("rw", db.clients, db.periods, db.active, async () => {
    const doomed = await db.periods.where("clientId").equals(clientId).primaryKeys();
    await db.periods.bulkDelete(doomed);
    await db.clients.delete(clientId);

    const active = await db.active.get(ACTIVE_KEY);
    if (active?.clientId !== clientId) {
      return;
    }
    const remaining = sortByName(await db.clients.toArray());
    await db.active.put({ key: ACTIVE_KEY, clientId: remaining[0]?.id ?? null });
  });
}

export async function setActiveClient(clientId: string | null): Promise<void> {
  await db.active.put({ key: ACTIVE_KEY, clientId });
}

/** The open cliente's id, or `null` — which is also what a brand-new install reads. */
export async function getActiveClientId(): Promise<string | null> {
  return (await db.active.get(ACTIVE_KEY))?.clientId ?? null;
}

/** One cliente as the selector shows it: its label and what it holds. */
export interface PayrollClientSummary extends PayrollClient {
  periodCount: number;
  /** Ascending; `[]` for a cliente with no períodos. */
  years: number[];
}

/** Every cliente with its período count and years — ONE query behind the selector's sublines. */
export async function listClientSummaries(): Promise<PayrollClientSummary[]> {
  const [clients, periods] = await Promise.all([db.clients.toArray(), db.periods.toArray()]);
  const byClient = new Map<string, PayrollPeriod[]>();
  for (const period of periods) {
    byClient.set(period.clientId, [...(byClient.get(period.clientId) ?? []), period]);
  }
  return sortByName(
    clients.map((client) => {
      const own = byClient.get(client.id) ?? [];
      return {
        ...client,
        periodCount: own.length,
        years: [...new Set(own.map((period) => period.year))].sort((a, b) => a - b),
      };
    }),
  );
}

/** What deleting a cliente discards, in the terms the confirmation counts in. */
export interface PayrollClientContents {
  periodCount: number;
  years: number[];
}

/**
 * Quantifies what deleting a cliente discards. Naming it in the abstract («sus períodos») is what
 * makes an irreversible action easy to confirm by accident, so the modal counts instead.
 */
export async function describeClientContents(clientId: string): Promise<PayrollClientContents> {
  const periods = await db.periods.where("clientId").equals(clientId).toArray();
  return {
    periodCount: periods.length,
    years: [...new Set(periods.map((period) => period.year))].sort((a, b) => a - b),
  };
}

// ---------------------------------------------------------------------------
// Períodos
// ---------------------------------------------------------------------------

/** Every período of ONE cliente, most-recent-first — the order Historial de nómina reads them. */
export async function listPeriods(clientId: string): Promise<PayrollPeriod[]> {
  const periods = await db.periods.where("clientId").equals(clientId).toArray();
  return sortPeriodsDesc(periods);
}

/**
 * Creates an empty período: born `"captura"`, `totals` ausente — no se ha cargado ningún Excel
 * todavía. The owner is stamped HERE, at the door, the same as every other module's `db.ts`.
 *
 * Duplicate rejection with a message that NAMES the period is the dialog's job (it already holds
 * the loaded list); the unique compound index below is the safety net under it.
 */
export async function createPeriod(
  clientId: string,
  year: number,
  monthIndex: number,
  kind: PayrollPeriodKind,
): Promise<PayrollPeriod> {
  const period: PayrollPeriod = {
    id: crypto.randomUUID(),
    clientId,
    year,
    monthIndex,
    kind,
    status: "captura",
  };
  await db.periods.add(period);
  return period;
}
