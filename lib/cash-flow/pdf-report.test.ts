import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { buildFlowWorkbook } from "./export/flow-workbook";
import { balanceNoteKey, overdraftNoteKey, payableNoteKey } from "./cell-notes";
import { deriveFlow } from "./flow";
import { buildFlowReport } from "./report";
import { buildPdfFlowReport, pdfFlowPages } from "./pdf-report";
import type { BankAccount, FlowIncome, Payable } from "./types";

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
function input(bankAccounts = accounts, incomes: FlowIncome[] = []) {
  const derived = deriveFlow({
    date: "2026-10-06",
    accounts: bankAccounts,
    centers: [],
    checks: [],
    flow: { id: "f", clientId: "c", date: "2026-10-06", balances: { a: 50 }, incomes },
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
    incomes,
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
    expect(bank.rowTones?.[final.id]).toBe("total");
    expect(buildFlowReport(data)).toEqual(source);
    expect(source.sections[0].table.columns[0]).toBe("Saldo");
  });
  it("preserves payment document columns and manual obligations without duplicate subtotal", () => {
    const data = input();
    const table = buildPdfFlowReport(data).sections[1].table;
    expect(table).toEqual(
      buildFlowReport(data).sections.find((section) => section.id === "payments")!.table,
    );
    expect(table.columns).toEqual([
      "Emisión",
      "Vence",
      "Cuenta",
      "Programado",
      "Saldo",
      "Urgente",
      "Pendiente",
    ]);
    expect(table.rows.filter((row) => row.label.startsWith("IESS"))).toHaveLength(1);
    expect(table.rows.find((row) => row.id === "manual")?.values).toEqual([
      "01/10/2026",
      "15/10/2026",
      "Sin cuenta",
      "",
      "$12.00",
      "$12.00",
      "",
    ]);
    expect(table.rows.at(-1)?.values).toEqual(["", "", "", "", "$32.00", "$32.00", "$0.00"]);
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

describe("Excel with PDF table layout", () => {
  it("serializes the same section order, account columns, figures and detail without arrows", async () => {
    const data = input(accounts, [
      { id: "income", concept: "Reservas", amount: 15, accountId: "a" },
    ]);
    const report = buildPdfFlowReport({
      ...data,
      notes: {
        [balanceNoteKey("a")]: "Saldo revisado",
        [overdraftNoteKey("a")]: "Cupo revisado",
        [payableNoteKey("manual", "priority")]: "Prioridad revisada",
        [payableNoteKey("manual", "urgent")]: "Urgente revisado",
        [payableNoteKey("manual", "pending")]: "Pendiente revisado",
      },
    });
    expect(report.sections.slice(0, 4).map((section) => section.id)).toEqual([
      "accounts",
      "payments",
      "incomes",
      "remaining",
    ]);
    const workbook = buildFlowWorkbook(report);
    const loaded = new ExcelJS.Workbook();
    await loaded.xlsx.load(await workbook.xlsx.writeBuffer());
    const sheet = loaded.getWorksheet("FLUJO")!;
    const sections: string[] = [];
    const allValues: string[] = [];
    const notes: string[] = [];
    let bankHeader: unknown[] = [];
    let saldoNote: unknown;
    let amountNote: unknown;
    let balance: unknown;
    let urgentLabelFill: unknown;
    const rowFills: Record<string, string[]> = {};
    sheet.eachRow((row) => {
      const label = String(row.getCell(1).value ?? "");
      if (report.sections.some((section) => section.title === label)) sections.push(label);
      if (label === "Flujo de bancos")
        bankHeader = sheet.getRow(row.number + 1).values as unknown[];
      if (label === "Saldo" && row.getCell(2).note) saldoNote = row.getCell(2).note;
      if (label.startsWith("IESS —")) {
        expect(row.getCell(3).value).toBe("15/10/2026");
        expect(row.getCell(4).value).toBe("Sin cuenta");
        amountNote = row.getCell(7).note;
        expect(row.getCell(7).value).toBe("$12.00");
        expect(row.getCell(7).font.bold).not.toBe(true);
      }
      if (label === "Saldo final" && balance === undefined) balance = row.getCell(3).value;
      if (label === "Urgente") urgentLabelFill = row.getCell(1).fill;
      if (
        ["Urgente", "Pendiente", "Total bancos", "Saldo final"].includes(label) &&
        !rowFills[label]
      ) {
        rowFills[label] = [];
        row.eachCell((cell) => {
          const fill = cell.fill as ExcelJS.FillPattern;
          rowFills[label].push(fill.fgColor?.argb ?? "");
          if (label === "Total bancos" || label === "Saldo final")
            expect(cell.font.color?.argb).toBe("FFFFFFFF");
        });
      }
      row.eachCell((cell) => {
        allValues.push(String(cell.value ?? ""));
        if (cell.note) notes.push(String(cell.note));
      });
    });
    expect(sections).toEqual(report.sections.map((section) => section.title));
    expect(bankHeader).toEqual([undefined, "Concepto", "Banco A", "Banco B", "Total"]);
    expect(allValues.join(" ")).not.toMatch(/[▲▼]/);
    expect(saldoNote).toBe("Saldo revisado");
    expect(amountNote).toBe("Urgente revisado");
    expect(notes).toContain("Pendiente revisado");
    expect(notes).toContain("Prioridad revisada");
    expect(notes).toContain("Cupo revisado");
    expect(balance).toBe("$0.00");
    expect(urgentLabelFill).toMatchObject({ fgColor: { argb: "FFFBD5D5" } });
    expect(new Set(rowFills.Urgente)).toEqual(new Set(["FFFBD5D5"]));
    expect(new Set(rowFills.Pendiente)).toEqual(new Set(["FFEAF0F6"]));
    expect(new Set(rowFills["Total bancos"])).toEqual(new Set(["FF1E3A5F"]));
    expect(new Set(rowFills["Saldo final"])).toEqual(new Set(["FF1E3A5F"]));
    expect(sheet.pageSetup.orientation).toBe("landscape");
  });
});
