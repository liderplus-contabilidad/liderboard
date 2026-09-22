import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import {
  addAccount,
  addCashEntry,
  addCenter,
  addManualPayable,
  applyCut,
  assignBankToAccount,
  createAccountsForBanks,
  createCentersForLabels,
  createClient,
  db,
  deleteAccount,
  deleteCashEntry,
  deleteClient,
  describeClientContents,
  getActiveClientId,
  getFlow,
  importChecks,
  listAccounts,
  listCashEntries,
  listChecks,
  listClientSummaries,
  listCuts,
  listFlows,
  listPayables,
  saveFlow,
  settlePayables,
  updateCashEntry,
  updatePayables,
} from "./db";
import { parseChecksLog } from "./upload/checks-log";
import { parseContifico } from "./upload/contifico";
import { CHECKS_GRID, CONTIFICO_GRID } from "./upload/fixtures";

let clientId = "";

beforeEach(async () => {
  await Promise.all(db.tables.map((table) => table.clear()));
  clientId = (await createClient("Nomik")).id;
});

describe("empresas", () => {
  it("opens the new empresa and counts what it holds", async () => {
    expect(await getActiveClientId()).toBe(clientId);
    await addAccount(clientId, { bank: "PRODUBANCO", number: "", overdraft: 5000, centerId: null });
    await applyCut(clientId, parseContifico(CONTIFICO_GRID), "2026-09-15");
    const [summary] = await listClientSummaries();
    expect(summary).toMatchObject({
      name: "Nomik",
      accountCount: 1,
      openPayableCount: 4,
      checkCount: 0,
    });
  });

  it("deletes everything of one empresa and nothing of another", async () => {
    const other = (await createClient("Comisersa")).id;
    await addCenter(other, "HA");
    await addAccount(other, { bank: "PICHINCHA", number: "1", overdraft: 0, centerId: null });
    await applyCut(other, parseContifico(CONTIFICO_GRID), "2026-09-15");
    await saveFlow(other, "2026-09-15", { balances: {} });
    await addAccount(clientId, { bank: "PRODUBANCO", number: "", overdraft: 0, centerId: null });
    await applyCut(clientId, parseContifico(CONTIFICO_GRID), "2026-09-15");

    expect(await describeClientContents(other)).toEqual({
      accountCount: 1,
      payableCount: 4,
      checkCount: 0,
      flowCount: 1,
    });
    await deleteClient(other);
    expect(await db.centers.count()).toBe(0);
    expect(await db.flows.count()).toBe(0);
    expect(await db.meta.count()).toBe(1);
    expect(await listPayables(clientId)).toHaveLength(4);
    expect(await getActiveClientId()).toBe(clientId);
  });
});

describe("applyCut", () => {
  it("writes the documents with a stable identity and records the cut", async () => {
    const first = await applyCut(clientId, parseContifico(CONTIFICO_GRID), "2026-09-15");
    expect(first).toEqual({ written: 4, settled: 0 });
    const rows = await listPayables(clientId);
    expect(rows.every((row) => row.clientId === clientId && row.status === "open")).toBe(true);
    expect((await listCuts(clientId))[0]).toMatchObject({
      source: "contifico",
      cutDate: "2026-09-15",
      companyName: "NOMIK HOTELS S.A.S.",
    });
  });

  it("keeps the marks on a reload and settles what stopped coming", async () => {
    await applyCut(clientId, parseContifico(CONTIFICO_GRID), "2026-09-15");
    const kitlasz = (await listPayables(clientId)).find(
      (row) => row.docNumber === "001-002-000000024",
    )!;
    await updatePayables([kitlasz.id], { priority: "urgent", observation: "ok" });

    const cartera = parseContifico(CONTIFICO_GRID);
    cartera.payables = cartera.payables.filter((doc) => doc.docNumber !== "001-002-000000020");
    const second = await applyCut(clientId, cartera, "2026-09-22");
    expect(second).toEqual({ written: 3, settled: 1 });

    const rows = await listPayables(clientId);
    expect(rows.find((row) => row.id === kitlasz.id)).toMatchObject({
      priority: "urgent",
      observation: "ok",
      cutDate: "2026-09-22",
    });
    expect(rows.find((row) => row.docNumber === "001-002-000000020")).toMatchObject({
      status: "settled",
      settledOn: "2026-09-22",
    });
  });

  it("does not settle a manual obligation, and «pagado» archives with the mark cleared", async () => {
    const manual = await addManualPayable(clientId, {
      supplier: "Arriendo marzo",
      kind: "arriendo",
      amount: 2000,
      dueOn: null,
      centerName: null,
      description: "",
    });
    await updatePayables([manual.id], { priority: "pending" });
    await applyCut(clientId, parseContifico(CONTIFICO_GRID), "2026-09-15");
    expect((await listPayables(clientId)).find((row) => row.id === manual.id)?.status).toBe("open");
    await settlePayables([manual.id], "2026-09-16");
    expect((await listPayables(clientId)).find((row) => row.id === manual.id)).toMatchObject({
      status: "settled",
      settledOn: "2026-09-16",
      priority: null,
      cash: false,
    });
  });
});

describe("checks", () => {
  it("resolves the bank label at the door, leaves the rest unassigned, and upserts on reload", async () => {
    const prod = await addAccount(clientId, {
      bank: "Produbanco",
      number: "",
      overdraft: 0,
      centerId: null,
    });
    const log = parseChecksLog(CHECKS_GRID);
    const summary = await importChecks(clientId, log.checks);
    expect(summary.written).toBe(7);
    // CAJA and the live PICHINCHA one (no account yet); the voided ones are not counted.
    expect(summary.unassigned).toBe(2);
    const checks = await listChecks(clientId);
    expect(checks.find((c) => c.voucher === "4419")?.accountId).toBe(prod.id);
    expect(checks.find((c) => c.voucher === "15561")?.accountId).toBeNull();

    await importChecks(clientId, log.checks);
    expect(await listChecks(clientId)).toHaveLength(7);
  });

  it("assigns a bank label to an account in bulk and clears it when the account goes", async () => {
    await importChecks(clientId, parseChecksLog(CHECKS_GRID).checks);
    const pich = await addAccount(clientId, {
      bank: "PICHINCHA",
      number: "",
      overdraft: 0,
      centerId: null,
    });
    expect(await assignBankToAccount(clientId, "pichincha", pich.id)).toBe(2);
    expect((await listChecks(clientId)).filter((c) => c.accountId === pich.id)).toHaveLength(2);
    await deleteAccount(pich.id);
    expect(await listAccounts(clientId)).toHaveLength(0);
    expect((await listChecks(clientId)).every((c) => c.accountId === null)).toBe(true);
  });
});

describe("createCentersForLabels", () => {
  it("creates only the labels no center answers to, once each", async () => {
    await addCenter(clientId, "HA");
    const created = await createCentersForLabels(clientId, ["ha", "HC", "hc ", "", "HK"]);
    expect(created.map((center) => center.name)).toEqual(["HC", "HK"]);
    const names = (await db.centers.where("clientId").equals(clientId).toArray()).map(
      (center) => center.name,
    );
    expect(names.sort()).toEqual(["HA", "HC", "HK"]);
  });
});

describe("createAccountsForBanks", () => {
  it("creates the missing accounts and hands them their unassigned checks", async () => {
    await importChecks(clientId, parseChecksLog(CHECKS_GRID).checks);
    const prod = await addAccount(clientId, {
      bank: "PRODUBANCO",
      number: "1",
      overdraft: 0,
      centerId: null,
    });
    const created = await createAccountsForBanks(clientId, ["PICHINCHA", "produbanco"]);
    expect(created.map((account) => account.bank)).toEqual(["PICHINCHA"]);
    const checks = await listChecks(clientId);
    expect(checks.filter((c) => c.accountId === created[0].id)).toHaveLength(2);
    expect(checks.filter((c) => c.accountId === prod.id)).toHaveLength(3);
    expect(
      checks
        .filter((c) => c.accountId === null)
        .map((c) => c.bank)
        .sort(),
    ).toEqual(["CAJA", "CRUCE"]);
  });
});

describe("flows", () => {
  it("is one record per date, created on the first edit and merged after", async () => {
    await saveFlow(clientId, "2026-08-05", { balances: { a: 100 } });
    await saveFlow(clientId, "2026-08-05", { balances: { b: 50 } });
    await saveFlow(clientId, "2026-08-07", {
      incomes: [{ id: "i", concept: "x", amount: 1, accountId: null }],
    });
    expect((await getFlow(clientId, "2026-08-05"))?.balances).toEqual({ a: 100, b: 50 });
    expect((await listFlows(clientId)).map((flow) => flow.date)).toEqual([
      "2026-08-07",
      "2026-08-05",
    ]);
  });

  it("merges cell notes by key, removes a null or blank one, and keeps them to their date", async () => {
    await saveFlow(clientId, "2026-08-05", { notes: { "balance:a": " Cierre del lunes " } });
    await saveFlow(clientId, "2026-08-05", { notes: { "overdraft:a": "Aprobado" } });
    expect((await getFlow(clientId, "2026-08-05"))?.notes).toEqual({
      "balance:a": "Cierre del lunes",
      "overdraft:a": "Aprobado",
    });
    await saveFlow(clientId, "2026-08-05", {
      notes: { "balance:a": null, "overdraft:a": "  " },
    });
    // A balance written after the notes does not touch them, and the other date has none.
    await saveFlow(clientId, "2026-08-05", { balances: { a: 1 } });
    expect((await getFlow(clientId, "2026-08-05"))?.notes).toEqual({});
    await saveFlow(clientId, "2026-08-07", { balances: { a: 1 } });
    expect((await getFlow(clientId, "2026-08-07"))?.notes).toEqual({});
  });
});

describe("cash entries", () => {
  it("adds an empty row dated today, edits it and lists by date", async () => {
    const later = await addCashEntry(clientId, "misc", "2026-08-12");
    const earlier = await addCashEntry(clientId, "initial", "2026-08-11");
    expect(later.detail).toBe("");
    expect(later.amounts).toEqual({});
    await updateCashEntry(later.id, {
      detail: "SUELDO 07-2026 SONIA SALINAS",
      amounts: { hc: 601.33 },
    });
    const rows = await listCashEntries(clientId);
    expect(rows.map((row) => row.id)).toEqual([earlier.id, later.id]);
    expect(rows[1].amounts).toEqual({ hc: 601.33 });
    await deleteCashEntry(later.id);
    expect(await listCashEntries(clientId)).toHaveLength(1);
  });

  it("belongs to its empresa and dies with it", async () => {
    await addCashEntry(clientId, "misc");
    const other = (await createClient("Otra")).id;
    await addCashEntry(other, "misc");
    expect(await listCashEntries(other)).toHaveLength(1);
    await deleteClient(other);
    expect(await listCashEntries(other)).toHaveLength(0);
    expect(await listCashEntries(clientId)).toHaveLength(1);
  });
});
