import { describe, expect, it } from "vitest";
import { accountLabel, copyFlowFrom, deriveFlow, previousFlow } from "./flow";
import type { BankAccount, CashFlowCenter, Check, Payable, PaymentFlow } from "./types";

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

function check(over: Partial<Check>): Check {
  return {
    id: over.id ?? "k",
    clientId: "c",
    voucher: "1",
    bank: "PRODUBANCO",
    accountId: "prod",
    payee: "X",
    number: "1",
    amount: 100,
    issuedOn: "2026-07-01",
    step: "delivered",
    voided: false,
    cashedOn: null,
    place: "",
    note: "",
    ...over,
  };
}

describe("deriveFlow · Nomik (one account, no centers)", () => {
  const accounts: BankAccount[] = [
    { id: "prod", clientId: "c", bank: "PRODUBANCO", number: "", overdraft: 5000, centerId: null },
  ];
  const flow: PaymentFlow = {
    id: "f",
    clientId: "c",
    date: "2026-08-05",
    balances: { prod: 6677.34 },
    incomes: [],
  };

  it("reproduces the FJ 05-08-2026 sheet", () => {
    const derived = deriveFlow({
      date: "2026-08-05",
      flow,
      accounts,
      centers: [],
      checks: [],
      payables: [
        payable({ id: "u", balance: 7694.05, priority: "urgent", payFromAccountId: "prod" }),
        payable({ id: "p", balance: 4691.4, priority: "pending", payFromAccountId: "prod" }),
        payable({ id: "n", balance: 999 }),
        payable({ id: "s", balance: 999, priority: "urgent", status: "settled" }),
      ],
    });
    const [row] = derived.accounts;
    expect(row.available).toBeCloseTo(11677.34);
    expect(row.urgent).toBeCloseTo(7694.05);
    expect(row.pending).toBeCloseTo(4691.4);
    expect(row.bankTotal).toBeCloseTo(11677.34);
    expect(row.remaining).toBeCloseTo(-708.11);
    expect(row.shortfall).toBeCloseTo(708.11);
    expect(derived.totals.remaining).toBeCloseTo(-708.11);
    // The sheet's other two «SALDO FALTANTE» figures.
    expect(derived.totals.remainingUrgentOnly).toBeCloseTo(3983.29);
    expect(derived.totals.remainingPendingOnly).toBeCloseTo(6985.94);
    expect(derived.lines.map((line) => line.payable.id)).toEqual(["u", "p"]);
    expect(derived.loans).toEqual([]);
  });

  it("reads zero balances without a flow, and with ONE account an unassigned mark belongs to it", () => {
    const derived = deriveFlow({
      date: "2026-08-05",
      flow: null,
      accounts,
      centers: [],
      checks: [],
      payables: [payable({ id: "u", balance: 300, priority: "urgent" })],
    });
    expect(derived.accounts[0].balance).toBe(0);
    expect(derived.accounts[0].urgent).toBe(300);
    expect(derived.unassignedMarked.urgent).toBe(0);
    expect(derived.totals.urgent).toBe(300);
    expect(derived.totals.remaining).toBeCloseTo(4700);
  });

  it("keeps an unassigned mark in the company row when there are several accounts", () => {
    const derived = deriveFlow({
      date: "2026-08-05",
      flow: null,
      accounts: [
        ...accounts,
        { id: "pich", clientId: "c", bank: "PICHINCHA", number: "", overdraft: 0, centerId: null },
      ],
      centers: [],
      checks: [],
      payables: [payable({ id: "u", balance: 300, priority: "urgent" })],
    });
    expect(derived.accounts.every((row) => row.urgent === 0)).toBe(true);
    expect(derived.unassignedMarked.urgent).toBe(300);
    expect(derived.totals.urgent).toBe(300);
  });

  it("pays an urgent mark by its approved amount and leaves the rest pending", () => {
    const derived = deriveFlow({
      date: "2026-08-05",
      flow,
      accounts,
      centers: [],
      checks: [],
      payables: [
        payable({
          id: "u",
          balance: 891.4,
          approved: 200,
          priority: "urgent",
          payFromAccountId: "prod",
        }),
      ],
    });
    expect(derived.accounts[0].urgent).toBe(200);
    expect(derived.accounts[0].pending).toBeCloseTo(691.4);
    expect(derived.lines[0]).toMatchObject({ amount: 891.4, urgent: 200, pending: 691.4 });
  });

  it("lists what was settled since the previous flow, outside the sums", () => {
    const derived = deriveFlow({
      date: "2026-08-14",
      flow,
      accounts,
      centers: [],
      checks: [],
      since: "2026-08-07",
      payables: [
        payable({ id: "paid", balance: 4407.86, status: "settled", settledOn: "2026-08-07" }),
        payable({ id: "paid-later", balance: 200, status: "settled", settledOn: "2026-08-10" }),
        payable({ id: "paid-today", balance: 50, status: "settled", settledOn: "2026-08-14" }),
        payable({ id: "future", balance: 9, status: "settled", settledOn: "2026-08-20" }),
        payable({ id: "open", balance: 100, priority: "urgent", payFromAccountId: "prod" }),
      ],
    });
    expect(derived.settled.map((line) => line.payable.id)).toEqual(["paid-today", "paid-later"]);
    expect(derived.settledTotal).toBe(250);
    expect(derived.totals.urgent).toBe(100);
    const alone = deriveFlow({
      date: "2026-08-14",
      flow,
      accounts,
      centers: [],
      checks: [],
      payables: [
        payable({ id: "x", status: "settled", settledOn: "2026-08-10" }),
        payable({ id: "y", status: "settled", settledOn: "2026-08-14" }),
      ],
    });
    expect(alone.settled.map((line) => line.payable.id)).toEqual(["y"]);
  });
});

describe("deriveFlow · Comisersa (four accounts, three centers)", () => {
  const centers: CashFlowCenter[] = [
    { id: "ha", clientId: "c", name: "HA" },
    { id: "hc", clientId: "c", name: "HC" },
    { id: "hk", clientId: "c", name: "HK" },
  ];
  const accounts: BankAccount[] = [
    {
      id: "prod-ha",
      clientId: "c",
      bank: "PRODUBANCO",
      number: "80010385",
      overdraft: 15000,
      centerId: "ha",
    },
    {
      id: "pich-ha",
      clientId: "c",
      bank: "PICHINCHA",
      number: "3469364104",
      overdraft: 15000,
      centerId: "ha",
    },
    {
      id: "prod-hc",
      clientId: "c",
      bank: "PRODUBANCO",
      number: "02080009057",
      overdraft: 5000,
      centerId: "hc",
    },
    {
      id: "prod-hk",
      clientId: "c",
      bank: "PRODUBANCO",
      number: "02080000293",
      overdraft: 0,
      centerId: "hk",
    },
  ];
  const flow: PaymentFlow = {
    id: "f",
    clientId: "c",
    date: "2026-08-11",
    balances: { "prod-ha": -7465.16, "pich-ha": -9867.87, "prod-hc": -1362.22, "prod-hk": 0 },
    incomes: [{ id: "i", concept: "Proyección de ventas", amount: 0, accountId: "prod-ha" }],
  };

  it("reproduces the PRODUBANCO HA row of FLUJO MATRIZ and sums the company", () => {
    const derived = deriveFlow({
      date: "2026-08-11",
      flow,
      accounts,
      centers,
      checks: [
        check({ id: "k1", amount: 2000, accountId: "prod-ha" }),
        check({ id: "k2", amount: 491.55, accountId: "prod-ha" }),
        check({ id: "k3", amount: 781.71, accountId: "pich-ha", bank: "PICHINCHA" }),
        check({
          id: "k4",
          amount: 50,
          accountId: "prod-ha",
          step: "cashed",
          cashedOn: "2026-08-01",
        }),
      ],
      payables: [
        payable({
          id: "sri",
          source: "manual",
          kind: "sri",
          supplier: "SRI",
          balance: 3536.23,
          priority: "urgent",
          payFromAccountId: "prod-ha",
          centerName: "HA",
        }),
        payable({
          id: "iess",
          source: "manual",
          kind: "iess",
          supplier: "IESS",
          balance: 1884.06,
          priority: "urgent",
          payFromAccountId: "prod-hc",
          centerName: "HC",
        }),
      ],
    });
    const ha = derived.accounts[0];
    expect(ha.available).toBeCloseTo(7534.84);
    expect(ha.outstanding).toBeCloseTo(2491.55);
    expect(ha.urgent).toBeCloseTo(3536.23);
    expect(ha.remaining).toBeCloseTo(1507.06);
    expect(derived.accounts[1].remaining).toBeCloseTo(5132.13 - 781.71);
    expect(derived.totals.available).toBeCloseTo(16304.75);
    expect(derived.totals.outstanding).toBeCloseTo(3273.26);
    expect(derived.totals.urgent).toBeCloseTo(5420.29);
    expect(derived.totals.remaining).toBeCloseTo(16304.75 - 3273.26 - 5420.29);
    expect(derived.loans).toEqual([]);
  });

  it("reads a payment from HA's account for HC's document as a loan HA → HC", () => {
    const derived = deriveFlow({
      date: "2026-08-11",
      flow,
      accounts,
      centers,
      checks: [],
      payables: [
        payable({
          id: "bono",
          source: "manual",
          kind: "otros",
          supplier: "SR OBIOL BONO HC",
          balance: 850,
          priority: "urgent",
          payFromAccountId: "prod-ha",
          centerName: "hc",
        }),
        payable({
          id: "sonia",
          source: "manual",
          kind: "sueldos",
          supplier: "SUELDO SONIA",
          balance: 601.33,
          priority: "pending",
          payFromAccountId: "prod-ha",
          centerName: "HC",
        }),
        payable({
          id: "own",
          balance: 100,
          priority: "urgent",
          payFromAccountId: "prod-ha",
          centerName: "HA",
        }),
        payable({
          id: "nocenter",
          balance: 100,
          priority: "urgent",
          payFromAccountId: "prod-ha",
          centerName: "CULTURA MANOR",
        }),
      ],
    });
    expect(derived.loans).toEqual([{ fromCenterId: "ha", toCenterId: "hc", amount: 1451.33 }]);
    expect(derived.accounts[0].urgent).toBeCloseTo(1050);
    expect(derived.accounts[0].pending).toBeCloseTo(601.33);
  });
});

describe("copying", () => {
  const flows: PaymentFlow[] = [
    { id: "a", clientId: "c", date: "2026-08-05", balances: { x: 1 }, incomes: [] },
    {
      id: "b",
      clientId: "c",
      date: "2026-08-07",
      balances: { x: 2 },
      incomes: [{ id: "i", concept: "Reservas", amount: 10, accountId: null }],
    },
    { id: "c", clientId: "c", date: "2026-08-12", balances: { x: 3 }, incomes: [] },
  ];

  it("finds the latest flow strictly before the date", () => {
    expect(previousFlow(flows, "2026-08-12")?.id).toBe("b");
    expect(previousFlow(flows, "2026-08-07")?.id).toBe("a");
    expect(previousFlow(flows, "2026-08-05")).toBeNull();
  });

  it("copies balances and incomes with fresh ids at the new date", () => {
    const copy = copyFlowFrom(flows[1], "2026-08-14");
    expect(copy.date).toBe("2026-08-14");
    expect(copy.balances).toEqual({ x: 2 });
    expect(copy.incomes[0]).toMatchObject({ concept: "Reservas", amount: 10 });
    expect(copy.incomes[0].id).not.toBe("i");
  });
});

describe("accountLabel", () => {
  const centers: CashFlowCenter[] = [{ id: "ha", clientId: "c", name: "HA" }];
  it("writes bank and number, or the user's label, with the center after", () => {
    const account: BankAccount = {
      id: "a",
      clientId: "c",
      bank: "PRODUBANCO",
      number: "80010385",
      overdraft: 0,
      centerId: "ha",
    };
    expect(accountLabel(account, centers)).toBe("PRODUBANCO 80010385 · HA");
    expect(accountLabel({ ...account, label: "Produbanco HA" }, centers)).toBe(
      "Produbanco HA · HA",
    );
    expect(accountLabel({ ...account, label: " ", centerId: null }, centers)).toBe(
      "PRODUBANCO 80010385",
    );
  });
});
