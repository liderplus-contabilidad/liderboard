import { describe, expect, it } from "vitest";
import { buildFlowWorkbook } from "./export/flow-workbook";
import { deriveFlow } from "./flow";
import { buildFlowReport } from "./report";
import type { BankAccount, Payable } from "./types";

const ACCOUNTS: BankAccount[] = [
  { id: "prod", clientId: "c", bank: "PRODUBANCO", number: "", overdraft: 5000, centerId: null },
];

function payable(over: Partial<Payable>): Payable {
  return {
    id: over.id ?? "p",
    clientId: "c",
    source: "contifico",
    supplier: "PALLASCO PALOMO",
    supplierTaxId: null,
    docType: "FAC",
    docNumber: "1",
    description: "",
    issuedOn: null,
    dueOn: null,
    amount: 720,
    withholdings: 0,
    payments: 0,
    balance: 720,
    centerName: null,
    priority: "urgent",
    cash: false,
    payOn: null,
    payFromAccountId: "prod",
    observation: "",
    approved: null,
    finalReview: false,
    notified: false,
    status: "open",
    settledOn: null,
    cutDate: "2026-08-05",
    ...over,
  };
}

describe("buildFlowReport", () => {
  const derived = deriveFlow({
    date: "2026-08-05",
    flow: { id: "f", clientId: "c", date: "2026-08-05", balances: { prod: 6677.34 }, incomes: [] },
    accounts: ACCOUNTS,
    centers: [],
    payables: [
      payable({}),
      payable({ id: "q", supplier: "NUNA", balance: 975.93, priority: "pending" }),
    ],
    checks: [],
  });
  const report = buildFlowReport({
    clientName: "Nomik",
    derived,
    incomes: [],
    accounts: ACCOUNTS,
    centers: [],
    generatedAt: new Date(2026, 7, 5, 10, 0),
  });

  it("carries the accounts and the payments, and skips the empty sections", () => {
    expect(report.sections.map((section) => section.id)).toEqual([
      "accounts",
      "remaining",
      "payments",
    ]);
    expect(report.header.dateLabel).toBe("05/08/2026");
    const accounts = report.sections[0].table;
    expect(accounts.rows[0].values).toEqual([
      "$6,677.34",
      "$5,000.00",
      "$11,677.34",
      "$0.00",
      "$0.00",
      "$720.00",
      "$975.93",
      "$9,981.41",
    ]);
    expect(accounts.rows[1]).toMatchObject({ id: "total", emphasis: true });
    const payments = report.sections[2].table;
    expect(payments.rows.map((row) => row.label)).toEqual([
      "NUNA",
      "FAC 1",
      "PALLASCO PALOMO",
      "FAC 1",
      "Total",
    ]);
    expect(payments.rows[4].values).toEqual(["", "", "", "", "$1,695.93", "$720.00", "$975.93"]);
  });

  it("writes the same sections to one sheet", () => {
    const ws = buildFlowWorkbook(report).getWorksheet("FLUJO")!;
    const labels = [] as unknown[];
    ws.eachRow((row) => labels.push(row.getCell(1).value));
    expect(labels).toContain("Flujo de bancos");
    expect(labels).toContain("Pagos marcados por proveedor");
    expect(labels).toContain("Total");
  });
});
