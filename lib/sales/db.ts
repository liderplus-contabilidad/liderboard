/**
 * The persistence of «Ventas por servicio» in IndexedDB, and **the ONLY door to its tables** — the
 * same rule `lib/profit-loss/db.ts`, `lib/occupancy/db.ts` and `lib/payroll/db.ts` hold up, and for
 * the same reason, which here is not tidiness but mitigation: with several clients sharing one table,
 * a query with no `clientId` mixes the billing of two companies in silence, and nothing downstream
 * —not `derive.ts`'s aggregations, not the cards, not the report— can notice. Every read and every
 * write below carries its `clientId`.
 *
 * **A database of its own** (`liderboard-sales`), separate from PyG's even though the partition is
 * PyG's client: the grain of this is the INVOICE LINE, and putting it in the estado de resultados'
 * database would force that database to store something that is not an account. What is shared is the
 * client's identity, not the store.
 *
 * Nothing derived is stored: the breakdown by service, the concentration by payer and the year's
 * evolution are recomputed on every read. A copy would go stale on the next upload.
 */
import Dexie, { type Table } from "dexie";
import { salesMonthId, type ParsedSalesMonth, type SalesMonth } from "./types";

class SalesDb extends Dexie {
  months!: Table<SalesMonth, string>;

  constructor() {
    super("liderboard-sales");
    this.version(1).stores({
      // The compound index is UNIQUE (`&`) because a client cannot have the same (year, month) twice:
      // reloading a month REPLACES it, and with an `id` derived from that triple the replacement is
      // done by `put` by construction instead of depending on someone remembering to delete first.
      months: "id, clientId, &[clientId+year+monthIndex], [clientId+year]",
    });
  }
}

const db = new SalesDb();

/**
 * Every month of ONE client. The only way of reading the table: there is no query without a
 * `clientId`, which is what stops another company's year slipping into a read.
 */
export function monthsForClient(clientId: string | null): Promise<SalesMonth[]> {
  if (!clientId) {
    return Promise.resolve([]);
  }
  return db.months.where("clientId").equals(clientId).toArray();
}

/**
 * Writes a month into the OPEN client, STAMPING its owner there: which client a file belongs to is
 * decided by which client is open, never by the file — the same rule PyG turns a `ParsedDataset` into
 * a `PygDataset` with.
 *
 * An already loaded month is replaced IN FULL. It is not merged with what was there: the report is
 * the whole picture of the month, so keeping lines from a previous upload would leave invoices the
 * accounting system no longer declares.
 */
export async function saveMonths(
  clientId: string,
  parsed: readonly ParsedSalesMonth[],
): Promise<void> {
  const rows: SalesMonth[] = parsed.map((month) => ({
    ...month,
    id: salesMonthId(clientId, month.year, month.monthIndex),
    clientId,
  }));
  await db.months.bulkPut(rows);
}

/** Deletes a month of the open client. */
export async function deleteMonth(
  clientId: string,
  year: number,
  monthIndex: number,
): Promise<void> {
  await db.months.delete(salesMonthId(clientId, year, monthIndex));
}

/**
 * The CASCADE when a PyG client is deleted. It lives here —and is called by whoever deletes the
 * client— rather than PyG's database knowing this one: the dependency goes from the new module to the
 * one that already existed, and never the other way round. Without this, deleting a client would leave
 * its billing in a partition no screen lists and no deletion reaches.
 */
export async function deleteSalesForClient(clientId: string): Promise<void> {
  await db.months.where("clientId").equals(clientId).delete();
}
