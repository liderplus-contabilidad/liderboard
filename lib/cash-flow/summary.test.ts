import { describe, expect, it } from "vitest";
import { CHART_NEUTRAL } from "@/lib/charts/palette";
import { deriveFlow } from "./flow";
import {
  agingTimelineCard,
  balanceByAccountCard,
  bankHistoryCard,
  outstandingChecksCard,
  paymentCalendarCard,
  supplierCard,
  weekBucketOf,
} from "./summary";
import type { BankAccount, Check, Payable, PaymentFlow } from "./types";

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
    cash: false,
    payOn: null,
    payFromAccountId: null,
    observation: "",
    approved: null,
    finalReview: false,
    notified: false,
    status: "open",
    settledOn: null,
    cutDate: "2026-09-15",
    ...over,
  };
}

const ONE: BankAccount[] = [
  { id: "a", clientId: "c", bank: "PRODUBANCO", number: "1", overdraft: 5000, centerId: null },
];
const TWO: BankAccount[] = [
  ...ONE,
  { id: "b", clientId: "c", bank: "PICHINCHA", number: "2", overdraft: 0, centerId: null },
];
const AS_OF = "2026-09-15";

describe("agingTimelineCard", () => {
  it("lays the ten buckets on one axis, overdue first, and says nothing without open balance", () => {
    const card = agingTimelineCard(
      [
        payable({ id: "a", balance: 175.56 }),
        payable({ id: "b", balance: 4668.09, dueOn: "2026-08-24" }),
        payable({ id: "s", balance: 9, status: "settled" }),
      ],
      AS_OF,
    )!;
    expect(card.table.columns[0]).toBe("Vencida >120 d");
    expect(card.table.columns[4]).toBe("Vencida 30 d");
    expect(card.table.columns[5]).toBe("Vence en 30 d");
    expect(card.option?.series[0].data[4]).toBe(4668.09);
    expect(card.option?.series[1].data[5]).toBe(175.56);
    expect(card.option?.series.every((s) => s.stack === "aging")).toBe(true);
    expect(card.option?.tooltip?.confine).toBe(true);
    expect(agingTimelineCard([], AS_OF)).toBeNull();
  });
});

describe("paymentCalendarCard", () => {
  it("buckets marked documents by week from the cut date, split by priority", () => {
    expect(weekBucketOf({ payOn: "2026-09-10", dueOn: null }, AS_OF)).toBe(0);
    expect(weekBucketOf({ payOn: null, dueOn: "2026-09-21" }, AS_OF)).toBe(1);
    expect(weekBucketOf({ payOn: "2026-09-22", dueOn: null }, AS_OF)).toBe(2);
    expect(weekBucketOf({ payOn: "2026-10-13", dueOn: null }, AS_OF)).toBe(5);
    expect(weekBucketOf({ payOn: null, dueOn: null }, AS_OF)).toBe(6);
    const card = paymentCalendarCard(
      [
        payable({ id: "u", balance: 261, approved: 189, priority: "urgent", payOn: "2026-09-17" }),
        payable({ id: "p", balance: 2000, priority: "pending", payOn: "2026-09-30" }),
        payable({ id: "n", balance: 50 }),
      ],
      AS_OF,
    )!;
    expect(card.option?.series[0].data[1]).toBe(189);
    expect(card.option?.series[1].data[1]).toBe(72);
    expect(card.option?.series[1].data[3]).toBe(2000);
    expect(paymentCalendarCard([payable({ id: "n" })], AS_OF)).toBeNull();
  });
});

describe("supplierCard", () => {
  it("ranks the eight largest in one hue and folds the rest into a neutral «Otros»", () => {
    const rows = Array.from({ length: 10 }, (_, i) =>
      payable({ id: `p${i}`, supplier: `S${i}`, balance: 100 - i }),
    );
    const card = supplierCard(rows)!;
    expect(card.table.rows).toHaveLength(9);
    expect(card.table.rows[8]).toMatchObject({
      id: "others",
      label: "Otros (2)",
      color: CHART_NEUTRAL,
    });
    expect(new Set(card.table.rows.slice(0, 8).map((r) => r.color)).size).toBe(1);
    expect(card.option?.yAxis?.inverse).toBe(true);
    expect(supplierCard([])).toBeNull();
  });
});

describe("bankHistoryCard", () => {
  const flows: PaymentFlow[] = [
    { id: "1", clientId: "c", date: "2026-08-05", balances: { a: 6677.34 }, incomes: [] },
    {
      id: "2",
      clientId: "c",
      date: "2026-08-07",
      balances: { a: 4319.27 },
      incomes: [{ id: "i", concept: "x", amount: 100, accountId: "a" }],
    },
    { id: "3", clientId: "c", date: "2026-09-20", balances: { a: 1 }, incomes: [] },
  ];
  it("draws the captured total bancos (saldo + sobregiro, incomes apart) per flow date up to the cut, from two flows on", () => {
    const card = bankHistoryCard(flows, ONE, AS_OF)!;
    expect(card.table.columns).toEqual(["05/08/2026", "07/08/2026"]);
    expect(card.option?.series[0].data).toEqual([11677.34, 9319.27]);
    expect(bankHistoryCard(flows.slice(0, 1), ONE, AS_OF)).toBeNull();
  });
});

describe("per-account cards", () => {
  const check = (accountId: string, amount: number): Check => ({
    id: `k-${accountId}-${amount}`,
    clientId: "c",
    voucher: "1",
    bank: "",
    accountId,
    payee: "",
    number: "",
    amount,
    issuedOn: "2026-08-01",
    step: "delivered",
    voided: false,
    cashedOn: null,
    place: "",
    note: "",
  });
  it("draw nothing with one account, and with two the balance and the outstanding checks", () => {
    const one = deriveFlow({
      date: AS_OF,
      flow: null,
      accounts: ONE,
      centers: [],
      payables: [],
      checks: [],
    });
    expect(balanceByAccountCard(one, [])).toBeNull();
    const two = deriveFlow({
      date: AS_OF,
      flow: null,
      accounts: TWO,
      centers: [],
      payables: [],
      checks: [check("a", 300)],
    });
    expect(balanceByAccountCard(two, [])?.option?.series[0].data).toEqual([5000, 0]);
    expect(outstandingChecksCard(two, [], true)?.table.rows.map((r) => r.values[0])).toEqual([
      "$300.00",
    ]);
    expect(outstandingChecksCard(two, [], false)).toBeNull();
  });
});
