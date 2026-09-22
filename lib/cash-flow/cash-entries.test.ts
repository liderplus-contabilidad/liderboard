import { describe, expect, it } from "vitest";
import { CASH_AMOUNT_KEY, deriveCashMatrix, isValidLoan, loanColumnId } from "./cash-entries";
import type { CashEntry, CashFlowCenter, Payable } from "./types";

const CENTERS: CashFlowCenter[] = [
  { id: "ha", clientId: "c", name: "HA" },
  { id: "hc", clientId: "c", name: "HC" },
  { id: "hk", clientId: "c", name: "HK" },
];

function entry(over: Partial<CashEntry>): CashEntry {
  return {
    id: over.id ?? "e",
    clientId: "c",
    section: "misc",
    date: "2026-08-11",
    detail: "",
    amounts: {},
    loan: null,
    observation: "",
    ...over,
  };
}

function payable(over: Partial<Payable>): Payable {
  return {
    id: over.id ?? "p",
    clientId: "c",
    source: "contifico",
    supplier: "A",
    supplierTaxId: null,
    docType: "FAC",
    docNumber: "1",
    description: "",
    issuedOn: null,
    dueOn: "2026-10-08",
    amount: 100,
    withholdings: 0,
    payments: 0,
    balance: 100,
    centerName: null,
    priority: null,
    cash: true,
    payOn: null,
    payFromAccountId: null,
    observation: "",
    approved: null,
    finalReview: false,
    notified: false,
    status: "open",
    settledOn: null,
    cutDate: "2026-07-03",
    ...over,
  };
}

describe("deriveCashMatrix · the CARGAS CASH sheet of Comisersa", () => {
  const entries = [
    entry({
      id: "m1",
      section: "initial",
      detail: "PRESTAMO HK A HC",
      amounts: { hk: 1000 },
      observation: "PAGO SR OBIOL-SONIA-CHINO",
    }),
    entry({ id: "v1", detail: "SR OBIOL BONO HC", amounts: { hc: 850 } }),
    entry({ id: "v2", detail: "SUELDO 07-2026 SONIA SALINAS", amounts: { hc: 601.33 } }),
    entry({ id: "v3", detail: "SUELDO 07-2026 DON JOSE", amounts: { hc: 154.74 } }),
  ];

  it("reproduces the two hand-written matrices with one column per center", () => {
    const { sections } = deriveCashMatrix(entries, CENTERS, []);
    expect(sections.map((section) => section.id)).toEqual(["initial", "misc", "suppliers"]);
    const [initial, misc] = sections;
    expect(initial.columns.map((column) => column.label)).toEqual(["HA", "HC", "HK"]);
    expect(initial.totals).toEqual({ ha: 0, hc: 0, hk: 1000 });
    expect(initial.rows[0].cells).toEqual({ hk: 1000 });
    expect(misc.rows).toHaveLength(3);
    expect(misc.totals).toEqual({ ha: 0, hc: 1606.07, hk: 0 });
  });

  it("adds a loan column only to the section whose rows use that pair", () => {
    const withLoan = [
      ...entries,
      entry({
        id: "v4",
        detail: "PRESTAMO",
        loan: { fromCenterId: "ha", toCenterId: "hc", amount: 200 },
      }),
    ];
    const { sections } = deriveCashMatrix(withLoan, CENTERS, []);
    const [initial, misc] = sections;
    expect(initial.columns.map((column) => column.label)).toEqual(["HA", "HC", "HK"]);
    expect(misc.columns.map((column) => column.label)).toEqual(["HA", "HC", "HK", "HA-HC"]);
    expect(misc.totals[loanColumnId({ fromCenterId: "ha", toCenterId: "hc" })]).toBe(200);
  });

  it("orders loan columns by the centers' order and keeps both directions apart", () => {
    const rows = [
      entry({ id: "a", loan: { fromCenterId: "hc", toCenterId: "ha", amount: 10 } }),
      entry({ id: "b", loan: { fromCenterId: "ha", toCenterId: "hk", amount: 20 } }),
      entry({ id: "c", loan: { fromCenterId: "ha", toCenterId: "hc", amount: 30 } }),
    ];
    const misc = deriveCashMatrix(rows, CENTERS, []).sections[1];
    expect(misc.columns.filter((column) => column.kind === "loan").map((c) => c.label)).toEqual([
      "HA-HC",
      "HA-HK",
      "HC-HA",
    ]);
  });

  it("ignores an amount or a loan whose center no longer exists", () => {
    const rows = [
      entry({
        id: "a",
        amounts: { hc: 50, gone: 999 },
        loan: { fromCenterId: "ha", toCenterId: "gone", amount: 70 },
      }),
    ];
    const misc = deriveCashMatrix(rows, CENTERS, []).sections[1];
    expect(misc.rows[0].cells).toEqual({ hc: 50 });
    expect(misc.columns.some((column) => column.kind === "loan")).toBe(false);
    expect(isValidLoan({ fromCenterId: "ha", toCenterId: "ha", amount: 1 }, CENTERS)).toBe(false);
  });

  it("offers one «Monto» column and no loan without centers", () => {
    const rows = [
      entry({
        id: "a",
        amounts: { [CASH_AMOUNT_KEY]: 120 },
        loan: { fromCenterId: "ha", toCenterId: "hc", amount: 70 },
      }),
    ];
    const misc = deriveCashMatrix(rows, [], []).sections[1];
    expect(misc.columns).toEqual([{ id: CASH_AMOUNT_KEY, kind: "amount", label: "Monto" }]);
    expect(misc.totals).toEqual({ [CASH_AMOUNT_KEY]: 120 });
  });
});

describe("deriveCashMatrix · PROVEEDORES reads the cartera", () => {
  it("writes one row per supplier with markedAmount under the center its label resolves to", () => {
    const docs = [
      payable({
        id: "1",
        supplier: "COMPANIA DE ECONOMIA MIXTA AUSTROGAS",
        balance: 206.43,
        centerName: "HC",
      }),
      payable({
        id: "2",
        supplier: "COMPANIA DE ECONOMIA MIXTA AUSTROGAS",
        balance: 268.03,
        centerName: "hk",
        cutDate: "2026-07-05",
      }),
      payable({ id: "3", supplier: "GAVIDIA", balance: 300, approved: 249.61, centerName: "HC" }),
      payable({ id: "4", supplier: "SIN CASH", balance: 500, centerName: "HC", cash: false }),
      payable({ id: "6", supplier: "GAVIDIA", balance: 50, centerName: "HC", priority: "urgent" }),
      payable({
        id: "5",
        supplier: "LIQUIDADA",
        balance: 500,
        centerName: "HC",
        status: "settled",
      }),
    ];
    const suppliers = deriveCashMatrix([], CENTERS, docs).sections[2];
    expect(suppliers.columns.map((column) => column.label)).toEqual(["HA", "HC", "HK"]);
    expect(suppliers.rows.map((row) => row.detail)).toEqual([
      "COMPANIA DE ECONOMIA MIXTA AUSTROGAS",
      "GAVIDIA",
    ]);
    expect(suppliers.rows[0].cells).toEqual({ hc: 206.43, hk: 268.03 });
    expect(suppliers.rows[0].date).toBe("2026-07-05");
    expect(suppliers.rows[0].payableIds).toEqual(["1", "2"]);
    // Urgent AND cash: the label is what lists it here, the priority is the flow's business.
    expect(suppliers.rows[1].cells).toEqual({ hc: 299.61 });
    expect(suppliers.totals).toEqual({ ha: 0, hc: 506.04, hk: 268.03 });
  });

  it("adds «Sin centro» only when a label resolves to no center", () => {
    const docs = [payable({ id: "1", supplier: "X", balance: 10, centerName: "CULTURA MANOR" })];
    const suppliers = deriveCashMatrix([], CENTERS, docs).sections[2];
    expect(suppliers.columns.map((column) => column.label)).toEqual([
      "HA",
      "HC",
      "HK",
      "Sin centro",
    ]);
    expect(suppliers.rows[0].cells).toEqual({ unassigned: 10 });
    const none = deriveCashMatrix([], CENTERS, []).sections[2];
    expect(none.columns).toHaveLength(3);
    expect(none.rows).toEqual([]);
  });

  it("sums everything under «Monto» without centers", () => {
    const docs = [
      payable({ id: "1", supplier: "X", balance: 10, centerName: "HC" }),
      payable({ id: "2", supplier: "X", balance: 5, centerName: null }),
    ];
    const suppliers = deriveCashMatrix([], [], docs).sections[2];
    expect(suppliers.rows[0].cells).toEqual({ [CASH_AMOUNT_KEY]: 15 });
  });
});
