import { describe, expect, it } from "vitest";
import {
  agingDistribution,
  customKinds,
  kindLabel,
  normalizeKind,
  documentLabel,
  approvedFromTyped,
  markedSplit,
  payableDetail,
  groupBySupplier,
  markedAmount,
  payableTotals,
} from "./derive";
import type { Payable } from "./types";

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

describe("markedAmount", () => {
  it("is the approved amount, else the balance", () => {
    expect(markedAmount(payable({ balance: 891.4 }))).toBe(891.4);
    expect(markedAmount(payable({ balance: 891.4, approved: 200 }))).toBe(200);
  });
});

describe("approvedFromTyped", () => {
  it("keeps a partial, turns the whole into null, clamps above the saldo, allows zero", () => {
    expect(approvedFromTyped(1066.67, 2133.33)).toBe(1066.67);
    expect(approvedFromTyped(2133.33, 2133.33)).toBeNull();
    expect(approvedFromTyped(5000, 720)).toBeNull();
    expect(approvedFromTyped(0, 720)).toBe(0);
    expect(approvedFromTyped(-5, 720)).toBe(0);
    expect(approvedFromTyped(null, 720)).toBeNull();
    expect(approvedFromTyped(Number.NaN, 720)).toBeNull();
    expect(approvedFromTyped(100.005, 720)).toBe(100.01);
  });
});

describe("markedSplit", () => {
  it("splits an urgent mark with a partial approval into urgent and the rest pending", () => {
    expect(markedSplit(payable({ balance: 261, priority: "urgent", approved: 189 }))).toEqual({
      urgent: 189,
      pending: 72,
    });
    expect(markedSplit(payable({ balance: 261, priority: "urgent" }))).toEqual({
      urgent: 261,
      pending: 0,
    });
    expect(markedSplit(payable({ balance: 261, priority: "pending", approved: 100 }))).toEqual({
      urgent: 0,
      pending: 100,
    });
    expect(markedSplit(payable({ balance: 261 }))).toEqual({ urgent: 0, pending: 0 });
    expect(markedSplit(payable({ balance: 261, priority: "urgent", status: "settled" }))).toEqual({
      urgent: 0,
      pending: 0,
    });
  });
});

describe("payableTotals", () => {
  it("sums open rows by side and by priority", () => {
    const totals = payableTotals(
      [
        payable({ id: "a", balance: 100 }),
        payable({ id: "b", balance: 50, dueOn: "2026-09-01", priority: "urgent" }),
        payable({ id: "c", balance: 30, priority: "pending", approved: 20 }),
        payable({ id: "d", balance: 999, status: "settled" }),
      ],
      "2026-09-15",
    );
    expect(totals).toEqual({
      total: 180,
      due: 130,
      overdue: 50,
      urgent: 50,
      pending: 20,
      count: 3,
    });
  });
});

describe("groupBySupplier", () => {
  it("groups by supplier ignoring case, biggest first, documents oldest due first", () => {
    const groups = groupBySupplier([
      payable({ id: "1", supplier: "Zeta", balance: 10, dueOn: "2026-10-01" }),
      payable({ id: "2", supplier: "alfa", balance: 50, dueOn: "2026-10-05" }),
      payable({ id: "3", supplier: "ALFA", balance: 40, dueOn: "2026-09-01", supplierTaxId: "1" }),
      payable({ id: "4", supplier: "Zeta", balance: 5, status: "settled" }),
    ]);
    expect(groups.map((g) => [g.label, g.balance, g.taxId])).toEqual([
      ["alfa", 90, "1"],
      ["Zeta", 10, null],
    ]);
    expect(groups[0].payables.map((p) => p.id)).toEqual(["3", "2"]);
    expect(groups[1].payables).toHaveLength(2);
  });
});

describe("agingDistribution", () => {
  it("fills every cell and puts each open balance in one", () => {
    const cells = agingDistribution(
      [
        payable({ id: "a", balance: 175.56, dueOn: "2026-10-08" }),
        payable({ id: "b", balance: 4668.09, dueOn: "2026-08-24" }),
        payable({ id: "c", balance: 1, dueOn: "2026-01-01", status: "settled" }),
      ],
      "2026-09-15",
    );
    expect(cells.due[30]).toBeCloseTo(175.56);
    expect(cells.overdue[30]).toBeCloseTo(4668.09);
    expect(cells.overdue["120+"]).toBe(0);
    expect(Object.keys(cells.due)).toHaveLength(5);
  });
});

describe("documentLabel", () => {
  it("joins type and number, and hides the manual dash", () => {
    expect(documentLabel({ docType: "FAC", docNumber: "001-002-000000020" })).toBe(
      "FAC 001-002-000000020",
    );
    expect(documentLabel({ docType: "—", docNumber: "" })).toBe("");
  });
});

describe("payableDetail", () => {
  it("drops the supplier and the number Contífico repeats, keeps the text, adds class and center", () => {
    expect(
      payableDetail(
        payable({
          supplier: "INMOBILIARIA KITLASZ CIA. LTDA.",
          docType: "FAC",
          docNumber: "001-002-000000020",
          description:
            "INMOBILIARIA KITLASZ CIA. LTDA. FAC 001-002-000000020 ARRIENDO DE MES DE MAYO",
          centerName: "CULTURA MANOR",
        }),
      ),
    ).toBe("ARRIENDO DE MES DE MAYO · CULTURA MANOR");
    expect(
      payableDetail(
        payable({
          source: "manual",
          kind: "arriendo",
          docType: "—",
          docNumber: "",
          description: "FC 00017 Laszlo",
          supplier: "Arriendo marzo",
        }),
      ),
    ).toBe("FC 00017 Laszlo · Arriendo");
    expect(payableDetail(payable({ description: "", centerName: null }))).toBe("");
  });
});

describe("kinds", () => {
  it("prints a built-in by its label and a typed class as it was typed", () => {
    expect(kindLabel("prestamo")).toBe("Préstamo");
    expect(kindLabel("Servicios básicos")).toBe("Servicios básicos");
  });

  it("folds a built-in id or label, in any case, to the id and keeps anything else", () => {
    expect(normalizeKind("arriendo")).toBe("arriendo");
    expect(normalizeKind("ARRIENDO")).toBe("arriendo");
    expect(normalizeKind(" Préstamo ")).toBe("prestamo");
    expect(normalizeKind("  Servicios básicos ")).toBe("Servicios básicos");
    expect(normalizeKind("   ")).toBeNull();
  });

  it("lists the typed classes once, first seen first, and never a built-in", () => {
    expect(
      customKinds([
        { kind: "sri" },
        { kind: "Servicios básicos" },
        { kind: undefined },
        { kind: "Seguros" },
        { kind: "Servicios básicos" },
      ]),
    ).toEqual(["Servicios básicos", "Seguros"]);
  });
});
