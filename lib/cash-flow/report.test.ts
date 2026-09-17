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
      "matrix",
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

  it("totals the accounts column by column, incomes included", () => {
    const withIncome = deriveFlow({
      date: "2026-08-05",
      flow: {
        id: "f",
        clientId: "c",
        date: "2026-08-05",
        balances: { prod: 6677.34 },
        incomes: [{ id: "i", concept: "Reservas", amount: 1200, accountId: "prod" }],
      },
      accounts: ACCOUNTS,
      centers: [],
      payables: [payable({})],
      checks: [],
    });
    const single = buildFlowReport({
      clientName: "Nomik",
      derived: withIncome,
      incomes: withIncome.flow?.incomes ?? [],
      accounts: ACCOUNTS,
      centers: [],
      generatedAt: new Date(2026, 7, 5, 10, 0),
    });
    const accounts = single.sections.find((section) => section.id === "accounts")!.table;
    expect(accounts.columns).toEqual([
      "Saldo",
      "Sobregiro",
      "Disponible",
      "Ingresos",
      "Cheques no cobrados",
      "Urgente",
      "Pendiente",
      "Saldo final",
    ]);
    // One account: its row IS the total, figure by figure.
    expect(accounts.rows[0].values).toEqual([
      "$6,677.34",
      "$5,000.00",
      "$11,677.34",
      "$1,200.00",
      "$0.00",
      "$720.00",
      "$0.00",
      "$12,157.34",
    ]);
    expect(accounts.rows[1].values).toEqual(accounts.rows[0].values);
  });

  it("prints the matrix after the payments whenever something is marked, and not otherwise", () => {
    const matrix = report.sections.find((section) => section.id === "matrix")!;
    expect(matrix.title).toBe("Matriz de pagos");
    expect(matrix.table.columns).toEqual([
      "Saldo",
      "Sobregiro",
      "Ingresos",
      "Total bancos",
      "NUNA",
      "PALLASCO PALOMO",
      "Total marcado",
      "Saldo final",
    ]);
    expect(matrix.table.rows.map((row) => row.label)).toEqual(["PRODUBANCO", "Total"]);
    expect(matrix.table.rows[0].values).toEqual([
      "$6,677.34",
      "$5,000.00",
      "$0.00",
      "$11,677.34",
      "$975.93",
      "$720.00",
      "$1,695.93",
      "$9,981.41",
    ]);

    const nothingMarked = buildFlowReport({
      clientName: "Nomik",
      derived: deriveFlow({
        date: "2026-08-05",
        flow: null,
        accounts: ACCOUNTS,
        centers: [],
        payables: [payable({ priority: null })],
        checks: [],
      }),
      incomes: [],
      accounts: ACCOUNTS,
      centers: [],
      generatedAt: new Date(2026, 7, 5, 10, 0),
    });
    expect(nothingMarked.sections.map((section) => section.id)).not.toContain("matrix");
  });

  it("writes the same sections to one sheet", () => {
    const ws = buildFlowWorkbook(report).getWorksheet("FLUJO")!;
    const labels = [] as unknown[];
    ws.eachRow((row) => labels.push(row.getCell(1).value));
    expect(labels).toContain("Flujo de bancos");
    expect(labels).toContain("Pagos marcados por proveedor");
    expect(labels).toContain("Matriz de pagos");
    expect(labels).toContain("Total");
  });
});
