/**
 * The persistence of «Análisis costo personal» in IndexedDB, and **the ONLY door to its table** — the
 * same rule `lib/profit-loss/db.ts`, `lib/sales/db.ts`, `lib/revenue/db.ts`, `lib/occupancy/db.ts` and
 * `lib/payroll/db.ts` hold up, and here for the same reason: with several clients sharing one table, a
 * query with no `clientId` mixes two companies' figures in silence, and nothing downstream —not the
 * percentages, not the cards, not the grid— can notice. Every read and every write below carries its
 * `clientId`.
 *
 * **Only the nómina de la familia lives here.** Every other figure of the screen is derived from PyG
 * on each render; not one percentage, subtotal or total is ever written down.
 */
import Dexie, { type Table } from "dexie";
import { familyMonthId, type PersonnelFamilyMonth } from "./types";

class PersonnelCostDb extends Dexie {
  family!: Table<PersonnelFamilyMonth, string>;

  constructor() {
    super("liderboard-personnel-cost");
    this.version(1).stores({
      // The compound index is UNIQUE (`&`) because a client cannot have the same (year, month) twice:
      // rewriting a month REPLACES it, and with an `id` derived from that triple the replacement is
      // done by `put` by construction instead of depending on someone remembering to delete first.
      family: "id, clientId, &[clientId+year+monthIndex], [clientId+year]",
    });
  }
}

const db = new PersonnelCostDb();

/**
 * Every captured month of ONE client. The only way of reading the table: there is no query without a
 * `clientId`, which is what stops another company's figures slipping into a read.
 */
export function familyForClient(clientId: string | null): Promise<PersonnelFamilyMonth[]> {
  if (!clientId) {
    return Promise.resolve([]);
  }
  return db.family.where("clientId").equals(clientId).toArray();
}

/**
 * Writes a month's figure into the OPEN client, STAMPING its owner at the door: which client a figure
 * belongs to is decided by which client is open, never by anything the caller carries — PyG's same
 * rule for turning a `ParsedDataset` into a `PygDataset`.
 *
 * `null` DELETES the row rather than storing it. An empty cell and no row have to mean the same thing,
 * because they do: «este mes no se ha registrado». Storing the absence would also break the one
 * distinction the whole module rests on — a stored `0` is «se registró y fue cero», which is a claim,
 * and it has to stay tellable apart from silence.
 */
export async function saveFamilyMonth(
  clientId: string,
  year: number,
  monthIndex: number,
  amount: number | null,
): Promise<void> {
  const id = familyMonthId(clientId, year, monthIndex);
  if (amount === null) {
    await db.family.delete(id);
    return;
  }
  await db.family.put({ id, clientId, year, monthIndex, amount });
}

/**
 * The CASCADE when a PyG client is deleted. It lives here —and is called by whoever deletes the
 * client— rather than PyG's database knowing this one: the dependency goes from the new module to the
 * one that already existed, and never the other way round. Without this, the captured figures would be
 * left in a partition no screen lists and no deletion reaches.
 */
export async function deletePersonnelCostForClient(clientId: string): Promise<void> {
  await db.family.where("clientId").equals(clientId).delete();
}
