import { describe, expect, it } from "vitest";
import { deriveFlow } from "./flow";
import { derivePaymentMatrix, matrixTable } from "./matrix";
import type { BankAccount, Check, Payable } from "./types";

const HA_PROD: BankAccount = {
  id: "ha-prod",
  clientId: "c",
  bank: "PRODUBANCO",
  number: "80010385",
  label: "Produbanco HA",
  overdraft: 15000,
  centerId: "ha",
};
const HA_PICH: BankAccount = {
  id: "ha-pich",
  clientId: "c",
  bank: "PICHINCHA",
  number: "3469364104",
  label: "Pichincha HA",
  overdraft: 15000,
  centerId: "ha",
};
const HC_PROD: BankAccount = {
  id: "hc-prod",
  clientId: "c",
  bank: "PRODUBANCO",
  number: "02080009057",
  label: "Produbanco HC",
  overdraft: 5000,
  centerId: "hc",
};
const ACCOUNTS = [HA_PROD, HA_PICH, HC_PROD];
const CENTERS = [
  { id: "ha", clientId: "c", name: "HA" },
  { id: "hc", clientId: "c", name: "HC" },
];

function payable(over: Partial<Payable>): Payable {
  return {
    id: over.id ?? "p",
    clientId: "c",
    source: "manual",
    supplier: "SRI",
    supplierTaxId: null,
    docType: "—",
    docNumber: "",
    description: "",
    issuedOn: null,
    dueOn: null,
    amount: 100,
    withholdings: 0,
    payments: 0,
    balance: 100,
    centerName: null,
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
    cutDate: "2026-08-07",
    ...over,
  };
}

// COMISERSA's `FLUJO MATRIZ` of 7-08-2026, reduced to what the matrix decides: SRI paid from two
// accounts, the rent from one, a supplier from the Pichincha account.
const PAYABLES: Payable[] = [
  payable({ id: "sri-ha", supplier: "SRI", balance: 3536.23, payFromAccountId: "ha-prod" }),
  payable({ id: "sri-hc", supplier: "SRI", balance: 1884.06, payFromAccountId: "hc-prod" }),
  payable({
    id: "rent",
    supplier: "ARRIENDO",
    balance: 9200,
    priority: "pending",
    payFromAccountId: "ha-prod",
  }),
  payable({
    id: "tapia",
    supplier: "TAPIA LLIVIPUMA",
    balance: 2133.33,
    approved: 1066.67,
    payFromAccountId: "ha-pich",
  }),
];

function flowOf(over: { payables?: Payable[]; accounts?: BankAccount[]; checks?: Check[] } = {}) {
  const accounts = over.accounts ?? ACCOUNTS;
  return deriveFlow({
    date: "2026-08-07",
    flow: {
      id: "f",
      clientId: "c",
      date: "2026-08-07",
      balances: { "ha-prod": -7465.16, "ha-pich": -9867.87, "hc-prod": -1362.22 },
      incomes: [{ id: "i", concept: "Reservas", amount: 500, accountId: "ha-pich" }],
    },
    accounts,
    centers: CENTERS,
    payables: over.payables ?? PAYABLES,
    checks: over.checks ?? [],
  });
}

describe("derivePaymentMatrix", () => {
  it("puts one column per beneficiario, biggest payment first, and a cell per paying account", () => {
    const matrix = derivePaymentMatrix(flowOf(), CENTERS, false);
    expect(matrix.beneficiaries.map((column) => column.label)).toEqual([
      "ARRIENDO",
      "SRI",
      "TAPIA LLIVIPUMA",
    ]);
    const sri = matrix.beneficiaries[1];
    expect(matrix.rows.map((row) => row.label)).toEqual([
      "Produbanco HA · HA",
      "Pichincha HA · HA",
      "Produbanco HC · HC",
      "Total",
    ]);
    expect(matrix.rows.map((row) => row.cells[sri.key] ?? 0)).toEqual([
      3536.23, 0, 1884.06, 5420.29,
    ]);
    // TAPIA: urgent 1,066.67 + pending 1,066.66 — the matrix answers «how much of whom from where».
    const tapia = matrix.beneficiaries[2];
    expect(matrix.rows[1].cells[tapia.key]).toBe(2133.33);
  });

  it("agrees with the bank table, figure by figure", () => {
    const derived = flowOf();
    const matrix = derivePaymentMatrix(derived, CENTERS, false);
    derived.accounts.forEach((account, index) => {
      const row = matrix.rows[index];
      expect(row.bank).toEqual({
        balance: account.balance,
        overdraft: account.account.overdraft,
        incomes: account.incomes,
        incomeCells: { reservas: account.account.id === "ha-pich" ? 500 : 0 },
        bankTotal: account.bankTotal,
        outstanding: account.outstanding,
      });
      expect(row.marked).toBe(account.urgent + account.pending);
      expect(row.remaining).toBe(account.remaining);
    });
    const total = matrix.rows[matrix.rows.length - 1];
    expect(total.bank.bankTotal).toBe(derived.totals.bankTotal);
    expect(total.marked).toBe(16753.62);
    expect(total.remaining).toBe(derived.totals.remaining);
  });

  it("adds a «Sin cuenta» row only with several accounts and something unassigned", () => {
    const unassigned = payable({ id: "loose", supplier: "IESS", balance: 700 });
    const several = derivePaymentMatrix(
      flowOf({ payables: [...PAYABLES, unassigned] }),
      CENTERS,
      false,
    );
    expect(several.rows.map((row) => row.label)).toContain("Sin cuenta");
    const loose = several.rows.find((row) => row.label === "Sin cuenta")!;
    expect(loose.cells["iess"]).toBe(700);
    expect(several.rows.at(-1)!.marked).toBe(17453.62);

    const single = derivePaymentMatrix(
      flowOf({ payables: [unassigned], accounts: [HA_PROD] }),
      CENTERS,
      false,
    );
    expect(single.rows.map((row) => row.label)).toEqual(["Produbanco HA · HA", "Total"]);
    expect(single.rows[0].cells["iess"]).toBe(700);
  });

  it("carries the checks column only when the empresa has checks", () => {
    expect(derivePaymentMatrix(flowOf(), CENTERS, false).hasChecks).toBe(false);
    const check: Check = {
      id: "ch",
      clientId: "c",
      voucher: "1",
      bank: "PRODUBANCO",
      accountId: "ha-prod",
      payee: "X",
      number: "1",
      amount: 250,
      issuedOn: "2026-08-01",
      step: "delivered",
      voided: false,
      cashedOn: null,
      place: "",
      note: "",
    };
    const withChecks = derivePaymentMatrix(flowOf({ checks: [check] }), CENTERS, true);
    expect(withChecks.hasChecks).toBe(true);
    expect(withChecks.rows[0].bank.outstanding).toBe(250);
    expect(matrixTable(withChecks).columns).toContain("Cheques no cobrados");
  });

  it("has no beneficiario column without a marked document", () => {
    const empty = derivePaymentMatrix(flowOf({ payables: [] }), CENTERS, false);
    expect(empty.beneficiaries).toEqual([]);
    expect(empty.rows.map((row) => row.marked)).toEqual([0, 0, 0, 0]);
  });
});

describe("matrixTable", () => {
  it("writes the sheet's columns in the sheet's order, money formatted", () => {
    const table = matrixTable(derivePaymentMatrix(flowOf(), CENTERS, false));
    expect(table.columns).toEqual([
      "Saldo",
      "Sobregiro",
      "Total bancos",
      "Reservas",
      "Total ingresos",
      "ARRIENDO",
      "SRI",
      "TAPIA LLIVIPUMA",
      "Total marcado",
      "Saldo final",
    ]);
    expect(table.rows[0].label).toBe("Produbanco HA · HA");
    expect(table.rows[0].values).toEqual([
      "-$7,465.16",
      "$15,000.00",
      "$7,534.84",
      "$0.00",
      "$0.00",
      "$9,200.00",
      "$3,536.23",
      "$0.00",
      "$12,736.23",
      "-$5,201.39",
    ]);
    expect(table.rows.at(-1)).toMatchObject({ id: "total", label: "Total", emphasis: true });
  });
});
