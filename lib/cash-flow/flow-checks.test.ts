import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import {
  addAccount,
  addCheck,
  createClient,
  db,
  importChecks,
  listChecks,
  listManualObligations,
  listPayables,
  setFlowCheckLinks,
  settleFlowCheck,
  updateFlowCheck,
} from "./db";
import { availableFlowChecks } from "./checks";
import { deriveFlow } from "./flow";
import { derivePaymentMatrix } from "./matrix";
import { buildFlowReport } from "./report";
import { buildPdfFlowReport } from "./pdf-report";
import { buildFlowWorkbook } from "./export/flow-workbook";
import type { BankAccount, Check } from "./types";
import type { CheckInput } from "./db";

let clientId = "";
let account: BankAccount;
let check: Check;
const input: CheckInput = {
  voucher: "1",
  bank: "PRODUBANCO",
  accountId: null,
  payee: "Proveedor Uno",
  number: "1001",
  amount: 100,
  issuedOn: "2026-09-01",
  step: "delivered",
  voided: false,
  cashedOn: null,
  expectedCashOn: "2026-10-07",
  place: "",
  note: "Servicio septiembre",
};

beforeEach(async () => {
  await Promise.all(db.tables.map((table) => table.clear()));
  clientId = (await createClient("Empresa Uno")).id;
  account = await addAccount(clientId, {
    bank: "PRODUBANCO",
    number: "1",
    overdraft: 0,
    centerId: null,
  });
  check = await addCheck(clientId, { ...input, accountId: account.id });
});

async function derived(date = "2026-10-06") {
  return deriveFlow({
    date,
    flow: null,
    accounts: [account],
    centers: [],
    checks: await listChecks(clientId),
    payables: [],
  });
}

describe("checks as supplier obligations in Flujo", () => {
  it("moves the full amount from outstanding to the supplier's urgent obligation once", async () => {
    const before = await derived();
    expect(before.totals).toMatchObject({ outstanding: 100, urgent: 0, remaining: -100 });
    await setFlowCheckLinks(clientId, [check.id], "2026-10-06");
    const after = await derived();
    expect(after.totals).toMatchObject({
      outstanding: 0,
      urgent: 100,
      pending: 0,
      remaining: -100,
    });
    expect(after.groups).toHaveLength(1);
    expect(after.groups[0].label).toBe("Proveedor Uno");
    expect(after.lines[0].payable).toMatchObject({
      source: "check",
      checkId: check.id,
      payFromAccountId: account.id,
    });
    expect(derivePaymentMatrix(after, [], true).beneficiaries[0]).toMatchObject({
      label: "Proveedor Uno",
      total: 100,
    });
    expect(await listPayables(clientId)).toEqual([]);
    expect(await listManualObligations(clientId)).toEqual([]);
    expect((await derived("2026-10-05")).totals).toMatchObject({ outstanding: 100, urgent: 0 });
    expect((await derived("2026-10-07")).totals).toMatchObject({ outstanding: 0, urgent: 100 });
    await setFlowCheckLinks(clientId, [check.id], null);
    expect((await derived()).totals).toEqual(before.totals);
    expect(await listChecks(clientId)).toHaveLength(1);
  });

  it("writes urgent/pending, account and date back to the check and preserves them on reload", async () => {
    await setFlowCheckLinks(clientId, [check.id], "2026-10-06");
    await updateFlowCheck(clientId, check.id, { approved: 60, payOn: "2026-10-08" });
    expect((await derived()).totals).toMatchObject({
      outstanding: 0,
      urgent: 60,
      pending: 40,
      remaining: -100,
    });
    await updateFlowCheck(clientId, check.id, { priority: "pending", payFromAccountId: null });
    const { accountId: _a, id: _i, clientId: _c, note: _n, ...parsed } = check;
    await importChecks(clientId, [parsed]);
    expect((await listChecks(clientId))[0]).toMatchObject({
      flowLinkedOn: "2026-10-06",
      flowPriority: "pending",
      flowApproved: 60,
      flowPayOn: "2026-10-08",
      flowPayFromAccountId: null,
    });
    expect((await derived()).totals).toMatchObject({
      outstanding: 0,
      urgent: 0,
      pending: 60,
      remaining: -60,
    });
  });

  it("settles the actual check, retains earlier readings and can reopen it", async () => {
    await setFlowCheckLinks(clientId, [check.id], "2026-10-06");
    await settleFlowCheck(clientId, check.id, "2026-10-07");
    expect((await derived("2026-10-06")).totals.urgent).toBe(100);
    const paid = await derived("2026-10-07");
    expect(paid.lines).toEqual([]);
    expect(paid.totals.remaining).toBe(0);
    expect(paid.settled[0].payable.source).toBe("check");
    await settleFlowCheck(clientId, check.id, null);
    expect((await derived("2026-10-08")).totals.urgent).toBe(100);
  });

  it("bounds every working write and link to the empresa", async () => {
    const other = (await createClient("Otra")).id;
    await setFlowCheckLinks(other, [check.id], "2026-10-06");
    await updateFlowCheck(other, check.id, { priority: "pending", approved: 5 });
    await settleFlowCheck(other, check.id, "2026-10-06");
    expect((await listChecks(clientId))[0]).toEqual(check);
  });

  it("offers only eligible, not already linked checks within the chosen accounts", async () => {
    const all = [
      check,
      { ...check, id: "linked", flowLinkedOn: "2026-10-06" },
      { ...check, id: "voided", voided: true },
      { ...check, id: "cashed", cashedOn: "2026-10-06" },
      { ...check, id: "later", issuedOn: "2026-10-07" },
      { ...check, id: "unassigned", accountId: null },
      { ...check, id: "another-account", accountId: "other" },
    ];
    expect(availableFlowChecks(all, "2026-10-06").map((row) => row.id)).toEqual([
      check.id,
      "unassigned",
      "another-account",
    ]);
    expect(availableFlowChecks(all, "2026-10-06", [account.id]).map((row) => row.id)).toEqual([
      check.id,
    ]);
  });

  it("prints and exports the supplier obligation with the same amounts as the bank flow", async () => {
    await setFlowCheckLinks(clientId, [check.id], "2026-10-06");
    const value = await derived();
    const reportInput = {
      clientName: "Empresa Uno",
      derived: value,
      accounts: [account],
      centers: [],
      incomes: [],
      hasChecks: true,
      generatedAt: new Date(2026, 9, 6),
    };
    const report = buildFlowReport(reportInput);
    const payments = report.sections.find((section) => section.id === "payments")!;
    expect(payments.table.rows.some((row) => row.label.includes("CHQ 1001"))).toBe(true);
    expect(payments.table.rows.find((row) => row.id === "total")?.values.slice(-2)).toEqual([
      "$100.00",
      "$0.00",
    ]);
    expect(
      buildPdfFlowReport(reportInput)
        .sections.find((section) => section.id === "payments")!
        .table.rows.some((row) => row.label.includes("Cheque") || row.label.includes("CHQ")),
    ).toBe(true);
    const workbook = buildFlowWorkbook(report);
    const sheet = workbook.getWorksheet("FLUJO")!;
    expect(
      sheet
        .getColumn(1)
        .values.some((value) => typeof value === "string" && value.includes("CHQ 1001")),
    ).toBe(true);
  });
});
