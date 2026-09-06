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
 * **Only what no estado de resultados can answer lives here** — the three captured figures, and the
 * manual ventas of the years that predate the workspace. Wherever PyG declares coverage the ingreso is
 * still the raíz 4 and is derived on every read; no percentage, total, average or growth is ever
 * written down.
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
    // `manualRevenue` was added to the row WITHOUT a version bump, and deliberately: Dexie versions
    // INDEXES, not fields, and this field is indexed by nothing. What a row written before it needs is
    // not a migration but a default, and `externalForClient` gives it one at the door — the same door
    // every other invariant of this table is enforced at. A bump here would have run an upgrade
    // transaction over every client's history to write a column nobody queries by.
  }
}

const db = new RevenueDb();

/**
 * Every captured month of ONE client. The only way of reading the table: there is no query without a
 * `clientId`, which is what stops another company's figures slipping into a read.
 */
export async function externalForClient(clientId: string | null): Promise<RevenueExternalMonth[]> {
  if (!clientId) {
    return [];
  }
  const rows = await db.external.where("clientId").equals(clientId).toArray();
  // A row stored before `manualRevenue` existed carries `undefined` there, and `undefined` is NOT the
  // module's «no se registró» — `null` is. Normalising here and not at each reader is what stops one
  // card treating the two as the same and another as different.
  return rows.map((row) => ({ ...row, manualRevenue: row.manualRevenue ?? null }));
}

/**
 * Writes a month's four figures into the OPEN client, STAMPING its owner at the door: which client a
 * figure belongs to is decided by which client is open, never by anything the caller carries — PyG's
 * same rule for turning a `ParsedDataset` into a `PygDataset`.
 *
 * A month left with its four amounts empty is DELETED rather than stored as a row of nulls. An empty
 * row and no row have to mean the same thing, because they do: «este mes no se ha registrado». Keeping
 * it would leave the table growing a row per month the user merely visited.
 */
export async function saveExternalMonth(
  clientId: string,
  year: number,
  monthIndex: number,
  amounts: RevenueExternalAmounts,
): Promise<void> {
  // One month is the batch of one: a second body here is a second answer to «cuándo se borra una
  // fila», and the two would drift the day the emptiness rule changes.
  await saveExternalMonths(clientId, year, [{ monthIndex, amounts }]);
}

/**
 * Several months of ONE year in a SINGLE transaction — what a column pasted from Excel writes.
 *
 * Twelve separate `saveExternalMonth` calls are twelve transactions and twelve notifications to
 * `useLiveQuery`, so the drawer would repaint twelve times and, worse, a failure halfway would leave
 * half a column written with no way to tell which half. Here the twelve rows land or none do, and the
 * screen sees one update.
 *
 * The emptiness rule is the same one and applied per month: a month left with its four amounts empty
 * is DELETED rather than stored as a row of nulls.
 */
export async function saveExternalMonths(
  clientId: string,
  year: number,
  months: readonly { monthIndex: number; amounts: RevenueExternalAmounts }[],
): Promise<void> {
  const toPut: RevenueExternalMonth[] = [];
  const toDelete: string[] = [];
  for (const { monthIndex, amounts } of months) {
    const id = revenueMonthId(clientId, year, monthIndex);
    if (hasAnyAmount(amounts)) {
      toPut.push({ id, clientId, year, monthIndex, ...amounts });
    } else {
      toDelete.push(id);
    }
  }
  await db.transaction("rw", db.external, async () => {
    if (toPut.length > 0) {
      await db.external.bulkPut(toPut);
    }
    if (toDelete.length > 0) {
      await db.external.bulkDelete(toDelete);
    }
  });
}

/**
 * Every stored month of ONE year of ONE client — what «quitar año» erases.
 *
 * Bounded by the compound index and never by the year alone: `[clientId+year]` is exactly why that
 * index exists. A `where("year").equals(...)` here would delete 2024 for EVERY company sharing the
 * table, and it would do it in silence.
 */
export async function deleteRevenueYear(clientId: string, year: number): Promise<void> {
  await db.external.where("[clientId+year]").equals([clientId, year]).delete();
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
