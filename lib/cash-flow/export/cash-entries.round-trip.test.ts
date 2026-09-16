import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { deriveCashMatrix } from "../cash-entries";
import {
  addCenter,
  createCentersForLabels,
  createClient,
  db,
  listCashEntries,
  listCenters,
  replaceCashSections,
} from "../db";
import { parseCashSheet, readCashSheet, unknownCenterLabels } from "../upload/cash-entries";
import { CASH_GRID } from "../upload/fixtures";
import { buildCashEntriesWorkbook } from "./cash-entries-workbook";

/** The rows with ids out and center ids replaced by names, in a stable order. */
async function shape(clientId: string) {
  const centers = await listCenters(clientId);
  const name = (id: string) => centers.find((center) => center.id === id)?.name ?? id;
  return (await listCashEntries(clientId))
    .map(({ id: _id, clientId: _c, ...row }) => ({
      ...row,
      amounts: Object.fromEntries(Object.entries(row.amounts).map(([k, v]) => [name(k), v])),
      loan: row.loan
        ? {
            from: name(row.loan.fromCenterId),
            to: name(row.loan.toCenterId),
            amount: row.loan.amount,
          }
        : null,
    }))
    .sort((a, b) => `${a.section}${a.detail}`.localeCompare(`${b.section}${b.detail}`));
}

let clientId = "";

beforeEach(async () => {
  await Promise.all(db.tables.map((table) => table.clear()));
  clientId = (await createClient("Comisersa")).id;
});

describe("Cargas cash · the book comes in, and the export comes back", () => {
  it("loads the contador's sheet, creating the centers it names, and replaces per section", async () => {
    await addCenter(clientId, "HA");
    const sheet = parseCashSheet(CASH_GRID);
    const proposed = unknownCenterLabels(sheet, await listCenters(clientId));
    expect(proposed).toEqual(["HC", "HK"]);
    await createCentersForLabels(clientId, proposed);

    const summary = await replaceCashSections(clientId, sheet);
    expect(summary).toEqual({ written: 4, sections: ["initial", "misc"], unknownColumns: [] });
    const rows = await shape(clientId);
    expect(rows.map((row) => row.detail)).toEqual([
      "PRESTAMO HK A HC",
      "SR OBIOL BONO HC",
      "SUELDO 07-2026 DON JOSE",
      "SUELDO 07-2026 SONIA SALINAS",
    ]);
    expect(rows[0]).toMatchObject({ section: "initial", amounts: { HK: 1000 }, loan: null });
    expect(rows[2].loan).toEqual({ from: "HA", to: "HC", amount: 200 });

    // Loaded again, nothing duplicates; a sheet with ONE block leaves the other alone.
    await replaceCashSections(clientId, sheet);
    expect(await listCashEntries(clientId)).toHaveLength(4);
    await replaceCashSections(clientId, {
      sections: [{ ...sheet.sections[1], rows: [] }],
      skipped: 0,
    });
    const left = await listCashEntries(clientId);
    expect(left.map((row) => row.section)).toEqual(["initial"]);
  });

  it("drops a column no center answers and says so", async () => {
    await addCenter(clientId, "HA");
    const summary = await replaceCashSections(clientId, parseCashSheet(CASH_GRID));
    expect(summary.unknownColumns.sort()).toEqual(["HA-HC", "HC", "HK"]);
    expect((await listCashEntries(clientId)).every((row) => row.loan === null)).toBe(true);
  });

  it("comes back through the upload exactly as it left", async () => {
    await createCentersForLabels(clientId, ["HA", "HC", "HK"]);
    await replaceCashSections(clientId, parseCashSheet(CASH_GRID));
    const before = await shape(clientId);

    const centers = await listCenters(clientId);
    const matrix = deriveCashMatrix(await listCashEntries(clientId), centers, []);
    const buffer = await buildCashEntriesWorkbook(matrix, "Comisersa").xlsx.writeBuffer();
    const arrayBuffer = buffer instanceof ArrayBuffer ? buffer : new Uint8Array(buffer).buffer;
    const read = readCashSheet(arrayBuffer as ArrayBuffer);
    expect(read.ok).toBe(true);
    if (!read.ok) {
      return;
    }
    expect(unknownCenterLabels(read.sheet, centers)).toEqual([]);
    await replaceCashSections(clientId, read.sheet);
    expect(await shape(clientId)).toEqual(before);
  });
});
