import { describe, expect, it } from "vitest";
import { deriveFlow } from "./flow";
import { buildFlowReport } from "./report";
import { buildPdfFlowReport, pdfFlowPages } from "./pdf-report";
import type { BankAccount, Payable } from "./types";

const accounts: BankAccount[] = [
  { id: "a", clientId: "c", bank: "Banco A", number: "", overdraft: 100, centerId: null },
  { id: "b", clientId: "c", bank: "Banco B", number: "", overdraft: 0, centerId: null },
];
const manual: Payable = {
  id: "manual",
  clientId: "c",
  source: "manual",
  supplier: "IESS",
  supplierTaxId: null,
  docType: "—",
  docNumber: "",
  description: "Aporte",
  issuedOn: "2026-10-01",
  dueOn: "2026-10-15",
  amount: 12,
  withholdings: 0,
  payments: 0,
  balance: 12,
  centerName: null,
  kind: "iess",
  priority: "urgent",
  cash: false,
  payOn: null,
  payFromAccountId: null,
  observation: "",
  approved: null,
  finalReview: false,
  notified: false,
  status: "open",
  settledOn: null,
  cutDate: "2026-10-01",
};
function input(bankAccounts = accounts) {
  const derived = deriveFlow({
    date: "2026-10-06",
    accounts: bankAccounts,
    centers: [],
    checks: [],
    flow: { id: "f", clientId: "c", date: "2026-10-06", balances: { a: 50 }, incomes: [] },
    payables: [
      manual,
      {
        ...manual,
        id: "invoice",
        source: "contifico",
        supplier: "Proveedor",
        kind: undefined,
        docType: "FAC",
        docNumber: "1",
        balance: 20,
        amount: 20,
        payFromAccountId: "a",
      },
    ],
  });
  return {
    clientName: "Empresa",
    derived,
    incomes: [],
    accounts: bankAccounts,
    centers: [],
    generatedAt: new Date(2026, 9, 6),
  };
}
describe("flow PDF layout", () => {
  it("orders the main readings and transposes bank figures without altering Excel data", () => {
    const data = input();
    const source = buildFlowReport(data);
    const pdf = buildPdfFlowReport(data);
    expect(pdf.sections.map((s) => s.id)).toEqual(["accounts", "payments", "remaining", "matrix"]);
    const bank = pdf.sections[0];
    expect(bank.table.columns).toEqual(["Banco A", "Banco B", "Total"]);
    expect(bank.table.rows.find((r) => r.label === "Saldo")?.values).toEqual([
      "$50.00",
      "$0.00",
      "$50.00",
    ]);
    expect(bank.table.rows.find((r) => r.label === "Urgente")?.values).toEqual([
      "$20.00",
      "$0.00",
      "$32.00",
    ]);
    expect(bank.figureRowTones?.[bank.table.rows.find((r) => r.label === "Urgente")!.id]).toBe(
      "urgent",
    );
    for (const label of ["Total bancos"]) {
      const row = bank.table.rows.find((r) => r.label === label)!;
      expect(bank.rowTones?.[row.id]).toBe("total");
    }
    const final = bank.table.rows.find((r) => r.label === "Saldo final")!;
    expect(bank.rowTones?.[final.id]).toBe("group");
    expect(buildFlowReport(data)).toEqual(source);
    expect(source.sections[0].table.columns[0]).toBe("Saldo");
  });
  it("shows each manual obligation once and keeps supplier subtotals and unassigned amounts", () => {
    const table = buildPdfFlowReport(input()).sections[1].table;
    expect(table.columns).toEqual(["Banco A", "Banco B", "Sin cuenta", "Total"]);
    expect(table.rows.filter((r) => r.label.startsWith("IESS"))).toHaveLength(1);
    expect(table.rows.find((r) => r.id === "manual")?.values).toEqual([
      "$0.00",
      "$0.00",
      "$12.00",
      "$12.00",
    ]);
    expect(table.rows.find((r) => r.id === "g-proveedor")?.values).toEqual([
      "$20.00",
      "$0.00",
      "$0.00",
      "$20.00",
    ]);
    expect(table.rows.at(-1)?.values).toEqual(["$20.00", "$0.00", "$12.00", "$32.00"]);
    expect(table.rows.find((r) => r.id === "manual")?.sublabel).toContain("Vence: 15/10/2026");
  });
  it("uses the engine's single-account assignment", () => {
    const payments = buildPdfFlowReport(input([accounts[0]])).sections[1].table;
    expect(payments.columns).toEqual(["Banco A", "Total"]);
    expect(payments.rows.at(-1)?.values).toEqual(["$32.00", "$32.00"]);
  });
  it("splits wide account tables and repeats full totals on landscape panels", () => {
    const many = Array.from({ length: 20 }, (_, i) => ({
      ...accounts[0],
      id: `a${i}`,
      bank: `Banco ${i}`,
    }));
    const pdf = buildPdfFlowReport(input(many));
    const pages = pdfFlowPages(pdf.sections).filter((page) => page.section.id === "accounts");
    expect(pages.length).toBeGreaterThan(1);
    expect(pages.flatMap((page) => page.section.table.columns.slice(0, -1))).toEqual(
      many.map((a) => a.bank),
    );
    for (const page of pages) {
      expect(page.fit.orientation).toBe("landscape");
      expect(page.fit.fits).toBe(true);
      expect(page.section.table.columns.at(-1)).toBe("Total");
      expect(page.section.table.rows.find((r) => r.label === "Urgente")?.values.at(-1)).toBe(
        "$32.00",
      );
    }
  });
});
