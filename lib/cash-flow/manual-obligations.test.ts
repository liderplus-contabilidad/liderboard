import "fake-indexeddb/auto";
import Dexie from "dexie";
import { beforeEach, describe, expect, it } from "vitest";
import {
  addAccount,
  addManualObligation,
  applyCut,
  CashFlowDb,
  createClient,
  db,
  deleteAccount,
  deleteClient,
  deleteManualObligation,
  listManualObligations,
  listPayables,
  reopenManualObligation,
  replaceCartera,
  settleManualObligation,
  updateManualObligation,
} from "./db";
import { deriveFlow } from "./flow";
import { derivePaymentMatrix } from "./matrix";
import { buildCarteraWorkbook } from "./export/cartera-workbook";
import { readCartera } from "./upload/registry";
import { parseContifico } from "./upload/contifico";
import { CONTIFICO_GRID } from "./upload/fixtures";
import type { ManualObligation } from "./types";

let clientId = "";
const input = {
  supplier: "Arriendo",
  kind: "arriendo",
  amount: 2000,
  dueOn: null,
  centerName: null,
  description: "Marzo",
};

beforeEach(async () => {
  await Promise.all(db.tables.map((table) => table.clear()));
  clientId = (await createClient("Nomik")).id;
});

describe("manual obligations owned by Flujo", () => {
  it("is isolated from cartera and contributes to later flows, their totals and matrix", async () => {
    const account = await addAccount(clientId, {
      bank: "PRODUBANCO",
      number: "1",
      overdraft: 0,
      centerId: null,
    });
    const manual = await addManualObligation(clientId, input, "2026-09-15");
    await updateManualObligation(clientId, manual.id, { payFromAccountId: account.id });
    expect(await listPayables(clientId)).toEqual([]);
    const obligations = await listManualObligations(clientId);
    for (const date of ["2026-09-15", "2026-09-22"]) {
      const derived = deriveFlow({
        date,
        flow: null,
        accounts: [account],
        centers: [],
        checks: [],
        payables: [],
        obligations,
      });
      expect(derived.totals).toMatchObject({ urgent: 2000, pending: 0, remaining: -2000 });
      expect(derived.lines[0].payable.id).toBe(manual.id);
      expect(
        derivePaymentMatrix(derived, [], false).rows.find((row) => row.kind === "total")?.marked,
      ).toBe(2000);
    }
    expect(
      deriveFlow({
        date: "2026-09-14",
        flow: null,
        accounts: [],
        centers: [],
        checks: [],
        payables: [],
        obligations,
      }).lines,
    ).toEqual([]);
    await applyCut(clientId, parseContifico(CONTIFICO_GRID), "2026-09-22");
    await replaceCartera(clientId, []);
    expect(await listManualObligations(clientId)).toEqual(obligations);
    expect(await listPayables(clientId)).toEqual([]);
  });

  it("edits, pays, reopens and removes independently of another empresa", async () => {
    const manual = await addManualObligation(clientId, input, "2026-09-15");
    const other = (await createClient("Otra")).id;
    const otherManual = await addManualObligation(other, input, "2026-09-15");
    await expect(updateManualObligation(other, manual.id, { amount: 999 })).rejects.toThrow();
    await deleteManualObligation(other, manual.id);
    await settleManualObligation(other, manual.id, "2026-09-16");
    expect((await listManualObligations(clientId))[0].amount).toBe(2000);
    await updateManualObligation(clientId, manual.id, { approved: 1500 });
    await updateManualObligation(clientId, manual.id, {
      amount: 1000,
      supplier: " IESS ",
      kind: "iess",
      priority: "pending",
    });
    expect((await listManualObligations(clientId))[0]).toMatchObject({
      supplier: "IESS",
      amount: 1000,
      balance: 1000,
      approved: null,
      priority: "pending",
    });
    await settleManualObligation(clientId, manual.id, "2026-09-16");
    let derived = deriveFlow({
      date: "2026-09-16",
      flow: null,
      accounts: [],
      centers: [],
      checks: [],
      payables: [],
      obligations: await listManualObligations(clientId),
    });
    expect(derived.totals.pending).toBe(0);
    expect(derived.settled.map((row) => row.payable.id)).toEqual([manual.id]);
    await reopenManualObligation(clientId, manual.id);
    derived = deriveFlow({
      date: "2026-09-22",
      flow: null,
      accounts: [],
      centers: [],
      checks: [],
      payables: [],
      obligations: await listManualObligations(clientId),
    });
    expect(derived.totals.urgent).toBe(1000);
    await deleteManualObligation(clientId, manual.id);
    expect(await listManualObligations(clientId)).toEqual([]);
    expect(await listManualObligations(other)).toEqual([otherManual]);
    await deleteClient(other);
    expect(await listManualObligations(other)).toEqual([]);
  });

  it("clears the paying account when it is deleted", async () => {
    const account = await addAccount(clientId, {
      bank: "PICHINCHA",
      number: "1",
      overdraft: 0,
      centerId: null,
    });
    const manual = await addManualObligation(clientId, input);
    await updateManualObligation(clientId, manual.id, { payFromAccountId: account.id });
    await deleteAccount(account.id);
    expect((await listManualObligations(clientId))[0].payFromAccountId).toBeNull();
  });

  it("loads manual rows from a legacy workbook into Flujo once, preserving migrated equivalents", async () => {
    const existing = await addManualObligation(clientId, input, "2026-09-15");
    const second: ManualObligation = {
      ...existing,
      id: "old-second",
      supplier: "IESS",
      kind: "iess",
    };
    const buffer = await buildCarteraWorkbook([existing, second], [], "Nomik").xlsx.writeBuffer();
    const read = readCartera(new Uint8Array(buffer as ArrayBuffer).buffer);
    expect(read.ok && read.kind).toBe("liderplus");
    if (!read.ok || read.kind !== "liderplus") throw new Error("No se leyó el libro");
    await replaceCartera(clientId, read.rows);
    await replaceCartera(clientId, read.rows);
    expect(await listPayables(clientId)).toEqual([]);
    const obligations = await listManualObligations(clientId);
    expect(obligations).toHaveLength(2);
    expect(obligations.find((row) => row.id === existing.id)).toEqual(existing);
    expect(obligations.find((row) => row.supplier === "IESS")).toMatchObject({
      amount: 2000,
      priority: "urgent",
    });
  });

  it("migrates a real v4 database atomically with ids, marks and settled records intact", async () => {
    const manual = await addManualObligation(clientId, input, "2026-09-15");
    const unmarked = { ...manual, id: "unmarked", priority: null };
    const settled = {
      ...manual,
      id: "paid",
      status: "settled",
      settledOn: "2026-09-16",
      priority: null,
    };
    await applyCut(clientId, parseContifico(CONTIFICO_GRID), "2026-09-15");
    const documents = await listPayables(clientId);
    const name = `obligation-migration-${crypto.randomUUID()}`;
    const old = new Dexie(name);
    old.version(4).stores({
      clients: "id",
      centers: "id, clientId",
      accounts: "id, clientId",
      payables: "id, clientId, [clientId+status], [clientId+source]",
      checks: "id, clientId, [clientId+accountId]",
      flows: "id, clientId, &[clientId+date]",
      meta: "key, clientId",
      active: "key",
      cashEntries: "id, clientId, [clientId+section]",
    });
    await old.table("payables").bulkPut([...documents, manual, unmarked, settled]);
    old.close();
    const upgraded = new CashFlowDb(name);
    try {
      await upgraded.open();
      expect(await upgraded.payables.toArray()).toEqual(documents);
      const rows = await upgraded.manualObligations.toArray();
      expect(rows).toHaveLength(3);
      expect(rows.find((row) => row.id === manual.id)).toEqual(manual);
      expect(rows.find((row) => row.id === "unmarked")).toEqual({
        ...unmarked,
        priority: "urgent",
      });
      expect(rows.find((row) => row.id === "paid")).toEqual(settled);
    } finally {
      await upgraded.delete();
    }
  });
});
