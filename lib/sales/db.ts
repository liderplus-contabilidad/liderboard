/**
 * The persistence of «Ventas por servicio», and the ONLY door to its tables: every read and write
 * carries its `clientId`, because an unbounded query mixes two companies' billing in silence.
 *
 * Two tables: `months` holds the lines (heavy), `coverage` one small row per month, so «which
 * years and months exist» never touches a line.
 */
import Dexie, { type Table } from "dexie";
import { salesMonthId, type ParsedSalesMonth, type SalesCoverage, type SalesMonth } from "./types";

class SalesDb extends Dexie {
  months!: Table<SalesMonth, string>;
  coverage!: Table<SalesCoverage, string>;

  constructor() {
    super("liderboard-sales");
    // v1 stored the old report's lines (`serviceCode` + `payer`). No migration exists between the
    // two formats, so v2 EMPTIES the table.
    this.version(1).stores({
      months: "id, clientId, &[clientId+year+monthIndex], [clientId+year]",
    });
    this.version(2)
      .stores({
        months: "id, clientId, &[clientId+year+monthIndex], [clientId+year]",
        coverage: "id, clientId, &[clientId+year+monthIndex], [clientId+year]",
      })
      .upgrade((tx) => tx.table("months").clear());
  }
}

/** Exported for the tests only. */
export const db = new SalesDb();

/** One client's coverage: the cheap read, no lines deserialised. */
export function coverageForClient(clientId: string | null): Promise<SalesCoverage[]> {
  if (!clientId) {
    return Promise.resolve([]);
  }
  return db.coverage.where("clientId").equals(clientId).toArray();
}

/**
 * The lines of the given years — never «every month of the client». An empty `years` reads
 * NOTHING: «no years marked» is resolved before it gets here (`resolveYears`).
 */
export async function monthsForClientYears(
  clientId: string | null,
  years: readonly number[],
): Promise<SalesMonth[]> {
  if (!clientId || years.length === 0) {
    return [];
  }
  const batches = await Promise.all(
    years.map((year) => db.months.where("[clientId+year]").equals([clientId, year]).toArray()),
  );
  return batches.flat();
}

/**
 * Writes the parsed months into the OPEN client. Each month the file touches is replaced whole,
 * with its coverage in the same transaction; other months are not touched.
 */
export async function saveMonths(
  clientId: string,
  parsed: readonly ParsedSalesMonth[],
): Promise<void> {
  const months: SalesMonth[] = [];
  const coverage: SalesCoverage[] = [];
  for (const month of parsed) {
    const id = salesMonthId(clientId, month.year, month.monthIndex);
    months.push({
      id,
      clientId,
      year: month.year,
      monthIndex: month.monthIndex,
      lines: month.lines,
    });
    coverage.push({
      id,
      clientId,
      year: month.year,
      monthIndex: month.monthIndex,
      lineCount: month.lineCount,
      firstDay: month.firstDay,
      lastDay: month.lastDay,
      companyCode: month.companyCode,
    });
  }
  await db.transaction("rw", db.months, db.coverage, async () => {
    await db.months.bulkPut(months);
    await db.coverage.bulkPut(coverage);
  });
}

/** Deletes a month of the open client — its lines and its coverage together. */
export async function deleteMonth(
  clientId: string,
  year: number,
  monthIndex: number,
): Promise<void> {
  const id = salesMonthId(clientId, year, monthIndex);
  await db.transaction("rw", db.months, db.coverage, async () => {
    await db.months.delete(id);
    await db.coverage.delete(id);
  });
}

/** The cascade when a PyG client is deleted, called by whoever deletes it. */
export async function deleteSalesForClient(clientId: string): Promise<void> {
  await db.transaction("rw", db.months, db.coverage, async () => {
    await db.months.where("clientId").equals(clientId).delete();
    await db.coverage.where("clientId").equals(clientId).delete();
  });
}
