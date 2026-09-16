import { describe, expect, it } from "vitest";
import { CHART_NEUTRAL } from "@/lib/charts/palette";
import { deriveFlow } from "./flow";
import { agingCard, balanceByAccountCard, supplierCard } from "./summary";
import type { BankAccount, Payable } from "./types";

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

const ACCOUNTS: BankAccount[] = [
  { id: "a", clientId: "c", bank: "PRODUBANCO", number: "1", overdraft: 5000, centerId: null },
];

describe("balanceByAccountCard", () => {
  it("draws disponible and saldo final per account, and nothing without accounts", () => {
    const derived = deriveFlow({
      date: "2026-09-15",
      flow: { id: "f", clientId: "c", date: "2026-09-15", balances: { a: 100 }, incomes: [] },
      accounts: ACCOUNTS,
      centers: [],
      payables: [payable({ balance: 600, priority: "urgent", payFromAccountId: "a" })],
      checks: [],
    });
    const card = balanceByAccountCard(derived, []);
    expect(card.option?.series.map((s) => s.data)).toEqual([[5100], [4500]]);
    expect(card.table.rows[1].values).toEqual(["$4,500.00"]);
    expect(card.option?.tooltip?.confine).toBe(true);
    const empty = balanceByAccountCard(
      deriveFlow({
        date: "2026-09-15",
        flow: null,
        accounts: [],
        centers: [],
        payables: [],
        checks: [],
      }),
      [],
    );
    expect(empty.option).toBeNull();
  });
});

describe("agingCard", () => {
  it("places each open balance on its side and bucket at the cut date", () => {
    const card = agingCard(
      [
        payable({ id: "a", balance: 175.56 }),
        payable({ id: "b", balance: 4668.09, dueOn: "2026-08-24" }),
        payable({ id: "s", balance: 9, status: "settled" }),
      ],
      "2026-09-15",
    );
    expect(card.table.columns).toEqual(["30 días", "60 días", "90 días", "120 días", ">120 días"]);
    expect(card.option?.series[0].data).toEqual([4668.09, 0, 0, 0, 0]);
    expect(card.option?.series[1].data).toEqual([175.56, 0, 0, 0, 0]);
    expect(agingCard([], "2026-09-15").option).toBeNull();
  });
});

describe("supplierCard", () => {
  it("keeps the six largest and folds the rest into a neutral «Otros»", () => {
    const rows = Array.from({ length: 8 }, (_, index) =>
      payable({ id: `p${index}`, supplier: `S${index}`, balance: 100 - index }),
    );
    const card = supplierCard(rows);
    expect(card.table.rows).toHaveLength(7);
    expect(card.table.rows[0].label).toBe("S0");
    expect(card.table.rows[6]).toMatchObject({
      id: "others",
      label: "Otros (2)",
      color: CHART_NEUTRAL,
      values: ["$187.00", expect.stringContaining("%")],
    });
    expect(card.option?.yAxis?.inverse).toBe(true);
  });
});
