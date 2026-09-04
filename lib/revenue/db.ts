/**
 * The persistence of «Reportería de ingresos» in IndexedDB, and **the ONLY door to its table** — the
 * same rule `lib/profit-loss/db.ts`, `lib/sales/db.ts`, `lib/occupancy/db.ts` and `lib/payroll/db.ts`
 * hold up, and here for the same reason: with several clients sharing one table, a query with no
 * `clientId` mixes two companies' figures in silence, and nothing downstream —not the ratios, not the
 * cards, not the report— can notice. Every read and every write below carries its `clientId`.
 *
 * **A database of its own** (`liderboard-revenue`), separate from PyG's even though the partition is
 * PyG's client: what is stored here is not an account of any chart of accounts —a card collection, an
 * issuer's commission, an advertising spend— and putting it in the estado de resultados' database
 * would force that database to hold something that is not an account. What is shared is the client's
 * identity, not the store.
 *
 * **Only the three captured figures live here.** The ingreso is the raíz 4 of the PyG and is derived
 * on every read; no percentage, total, average or growth is ever written down.
 */
import Dexie, { type Table } from "dexie";
import {
  hasAnyAmount,
  revenueMonthId,
  type RevenueExternalAmounts,
  type RevenueExternalMonth,
} from "./types";

class RevenueDb extends Dexie {
  external!: Table<RevenueExternalMonth, string>;

  constructor() {
    super("liderboard-revenue");
    this.version(1).stores({
      // The compound index is UNIQUE (`&`) because a client cannot have the same (year, month) twice:
      // rewriting a month REPLACES it, and with an `id` derived from that triple the replacement is
      // done by `put` by construction instead of depending on someone remembering to delete first.
      external: "id, clientId, &[clientId+year+monthIndex], [clientId+year]",
    });
  }
}

const db = new RevenueDb();

/**
 * Every captured month of ONE client. The only way of reading the table: there is no query without a
 * `clientId`, which is what stops another company's figures slipping into a read.
 */
export function externalForClient(clientId: string | null): Promise<RevenueExternalMonth[]> {
  if (!clientId) {
    return Promise.resolve([]);
  }
  return db.external.where("clientId").equals(clientId).toArray();
}

/**
 * Writes a month's three figures into the OPEN client, STAMPING its owner at the door: which client a
 * figure belongs to is decided by which client is open, never by anything the caller carries — PyG's
 * same rule for turning a `ParsedDataset` into a `PygDataset`.
 *
 * A month left with its three amounts empty is DELETED rather than stored as a row of nulls. An empty
 * row and no row have to mean the same thing, because they do: «este mes no se ha registrado». Keeping
 * it would leave the table growing a row per month the user merely visited.
 */
export async function saveExternalMonth(
  clientId: string,
  year: number,
  monthIndex: number,
  amounts: RevenueExternalAmounts,
): Promise<void> {
  const id = revenueMonthId(clientId, year, monthIndex);
  if (!hasAnyAmount(amounts)) {
    await db.external.delete(id);
    return;
  }
  await db.external.put({ id, clientId, year, monthIndex, ...amounts });
}

/**
 * The CASCADE when a PyG client is deleted. It lives here —and is called by whoever deletes the
 * client— rather than PyG's database knowing this one: the dependency goes from the new module to the
 * one that already existed, and never the other way round. Without this, the captured figures would be
 * left in a partition no screen lists and no deletion reaches.
 */
export async function deleteRevenueForClient(clientId: string): Promise<void> {
  await db.external.where("clientId").equals(clientId).delete();
}
