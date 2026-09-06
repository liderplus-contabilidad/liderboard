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
import { legacyMonthHasData, type PersonnelLegacyAmounts } from "./legacy";
import { familyMonthId, type PersonnelFamilyMonth, type PersonnelLegacyMonth } from "./types";

class PersonnelCostDb extends Dexie {
  family!: Table<PersonnelFamilyMonth, string>;
  legacy!: Table<PersonnelLegacyMonth, string>;

  constructor() {
    super("liderboard-personnel-cost");
    this.version(1).stores({
      // The compound index is UNIQUE (`&`) because a client cannot have the same (year, month) twice:
      // rewriting a month REPLACES it, and with an `id` derived from that triple the replacement is
      // done by `put` by construction instead of depending on someone remembering to delete first.
      family: "id, clientId, &[clientId+year+monthIndex], [clientId+year]",
    });
    // The typed exercises. A SECOND table and not four more fields on the first: the family capture
    // carves a figure out of an account PyG already has, and this one stands where PyG has nothing —
    // two different claims, and a row of one is never a row of the other.
    this.version(2).stores({
      legacy: "id, clientId, &[clientId+year+monthIndex], [clientId+year]",
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
 * A whole BLOCK of family months in one transaction — what a row pasted out of Excel is.
 *
 * One transaction and not a loop of writes: a paste is one gesture, and half of it landing would leave
 * the year in a state the user never typed. It shares `saveFamilyMonth`'s rule to the letter — `null`
 * DELETES rather than storing an absence — because the two have to agree on what an empty cell means.
 */
export async function saveFamilyMonths(
  clientId: string,
  year: number,
  months: readonly { monthIndex: number; amount: number | null }[],
): Promise<void> {
  const written: PersonnelFamilyMonth[] = [];
  const cleared: string[] = [];
  for (const { monthIndex, amount } of months) {
    const id = familyMonthId(clientId, year, monthIndex);
    if (amount === null) {
      cleared.push(id);
    } else {
      written.push({ id, clientId, year, monthIndex, amount });
    }
  }
  await db.transaction("rw", db.family, async () => {
    if (cleared.length > 0) {
      await db.family.bulkDelete(cleared);
    }
    if (written.length > 0) {
      await db.family.bulkPut(written);
    }
  });
}

/**
 * Every typed month of ONE client — the same bounded read as the family's, and for the same reason.
 */
export function legacyForClient(clientId: string | null): Promise<PersonnelLegacyMonth[]> {
  if (!clientId) {
    return Promise.resolve([]);
  }
  return db.legacy.where("clientId").equals(clientId).toArray();
}

/**
 * Writes ONE typed month into the OPEN client, stamping its owner at the door.
 *
 * The month travels WHOLE —its four lines— because that is what the table stores: sending one line
 * would blank the three beside it. And a month whose four lines are empty DELETES its row: an empty
 * cell and no row have to mean the same thing, and storing the absence would leave a row behind for
 * every month the user merely tabbed through.
 */
export async function saveLegacyMonth(
  clientId: string,
  year: number,
  monthIndex: number,
  amounts: PersonnelLegacyAmounts,
): Promise<void> {
  const id = familyMonthId(clientId, year, monthIndex);
  if (!legacyMonthHasData(amounts)) {
    await db.legacy.delete(id);
    return;
  }
  await db.legacy.put({ id, clientId, year, monthIndex, amounts: { ...amounts } });
}

/**
 * A whole BLOCK of typed months in one transaction — what a paste out of Excel is.
 *
 * One transaction and not a loop of writes: a paste is one gesture, and half of it landing would leave
 * the year in a state the user never typed. `bulkPut`/`bulkDelete` inside it is also what keeps twelve
 * months one round trip instead of twelve.
 */
export async function saveLegacyMonths(
  clientId: string,
  year: number,
  months: readonly { monthIndex: number; amounts: PersonnelLegacyAmounts }[],
): Promise<void> {
  const written: PersonnelLegacyMonth[] = [];
  const cleared: string[] = [];
  for (const { monthIndex, amounts } of months) {
    const id = familyMonthId(clientId, year, monthIndex);
    if (legacyMonthHasData(amounts)) {
      written.push({ id, clientId, year, monthIndex, amounts: { ...amounts } });
    } else {
      cleared.push(id);
    }
  }
  await db.transaction("rw", db.legacy, async () => {
    if (cleared.length > 0) {
      await db.legacy.bulkDelete(cleared);
    }
    if (written.length > 0) {
      await db.legacy.bulkPut(written);
    }
  });
}

/** Drops a typed exercise WHOLE — the only way one leaves the universe of years. */
export async function deleteLegacyYear(clientId: string, year: number): Promise<void> {
  await db.legacy.where("[clientId+year]").equals([clientId, year]).delete();
}

/**
 * The CASCADE when a PyG client is deleted. It lives here —and is called by whoever deletes the
 * client— rather than PyG's database knowing this one: the dependency goes from the new module to the
 * one that already existed, and never the other way round. Without this, the captured figures would be
 * left in a partition no screen lists and no deletion reaches.
 */
export async function deletePersonnelCostForClient(clientId: string): Promise<void> {
  await db.family.where("clientId").equals(clientId).delete();
  await db.legacy.where("clientId").equals(clientId).delete();
}
