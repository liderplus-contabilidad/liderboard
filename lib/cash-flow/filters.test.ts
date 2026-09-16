import { describe, expect, it } from "vitest";
import {
  applyFilters,
  emptyPayableFilters,
  resolveCenterId,
  sanitizeFilters,
  withCenterToggled,
  withPriorityToggled,
  withSideToggled,
} from "./filters";
import type { CashFlowCenter, Payable } from "./types";

const CENTERS: CashFlowCenter[] = [
  { id: "ha", clientId: "c", name: "HA" },
  { id: "hc", clientId: "c", name: "HC" },
];

function payable(over: Partial<Payable>): Payable {
  return {
    id: over.id ?? "p",
    clientId: "c",
    source: "contifico",
    supplier: "PALLASCO PALOMO",
    supplierTaxId: null,
    docType: "FAC",
    docNumber: "001-100-000001383",
    description: "",
    issuedOn: "2026-08-24",
    dueOn: "2026-10-08",
    amount: 144,
    withholdings: 0,
    payments: 0,
    balance: 144,
    centerName: "HC",
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

describe("marks", () => {
  it("keep universe order, not click order", () => {
    let f = emptyPayableFilters();
    f = withCenterToggled(f, "hc", ["ha", "hc"]);
    f = withCenterToggled(f, "ha", ["ha", "hc"]);
    expect(f.centerIds).toEqual(["ha", "hc"]);
    expect(withCenterToggled(f, "ha", ["ha", "hc"]).centerIds).toEqual(["hc"]);
  });

  it("prune on read and return the same object when nothing changes", () => {
    const f = withCenterToggled(emptyPayableFilters(), "hk", ["ha", "hc", "hk"]);
    expect(sanitizeFilters(f, CENTERS).centerIds).toEqual([]);
    const clean = withSideToggled(emptyPayableFilters(), "overdue");
    expect(sanitizeFilters(clean, CENTERS)).toBe(clean);
  });
});

describe("resolveCenterId", () => {
  it("matches the file's label ignoring case and spacing", () => {
    expect(resolveCenterId(" hc", CENTERS)).toBe("hc");
    expect(resolveCenterId("CULTURA MANOR", CENTERS)).toBeNull();
    expect(resolveCenterId(null, CENTERS)).toBeNull();
  });
});

describe("applyFilters", () => {
  const rows = [
    payable({ id: "due-hc" }),
    payable({ id: "over-ha", centerName: "HA", dueOn: "2026-09-08", priority: "urgent" }),
    payable({ id: "settled", status: "settled", settledOn: "2026-09-01" }),
    payable({
      id: "manual",
      source: "manual",
      supplier: "Arriendo marzo",
      docType: "—",
      docNumber: "",
      centerName: null,
    }),
  ];

  it("hides settled rows unless asked, and no mark is all", () => {
    expect(
      applyFilters(rows, emptyPayableFilters(), CENTERS, "2026-09-15").map((r) => r.id),
    ).toEqual(["due-hc", "over-ha", "manual"]);
    const all = { ...emptyPayableFilters(), showSettled: true };
    expect(applyFilters(rows, all, CENTERS, "2026-09-15")).toHaveLength(4);
  });

  it("narrows by side at the cut date, by priority and by center", () => {
    const overdue = withSideToggled(emptyPayableFilters(), "overdue");
    expect(applyFilters(rows, overdue, CENTERS, "2026-09-15").map((r) => r.id)).toEqual([
      "over-ha",
    ]);
    // A later cut date makes «due-hc» overdue too.
    expect(applyFilters(rows, overdue, CENTERS, "2026-10-09").map((r) => r.id)).toEqual([
      "due-hc",
      "over-ha",
      "manual",
    ]);
    const unmarked = withPriorityToggled(emptyPayableFilters(), "none");
    expect(applyFilters(rows, unmarked, CENTERS, "2026-09-15").map((r) => r.id)).toEqual([
      "due-hc",
      "manual",
    ]);
    const hc = withCenterToggled(emptyPayableFilters(), "hc", ["ha", "hc"]);
    expect(applyFilters(rows, hc, CENTERS, "2026-09-15").map((r) => r.id)).toEqual(["due-hc"]);
  });

  it("searches supplier, number and description ignoring accents", () => {
    const f = { ...emptyPayableFilters(), search: "pallasco" };
    expect(applyFilters(rows, f, CENTERS, "2026-09-15")).toHaveLength(2);
    const byNumber = { ...emptyPayableFilters(), search: "1383" };
    expect(applyFilters(rows, byNumber, CENTERS, "2026-09-15")).toHaveLength(2);
    const manual = { ...emptyPayableFilters(), search: "ARRIENDO" };
    expect(applyFilters(rows, manual, CENTERS, "2026-09-15").map((r) => r.id)).toEqual(["manual"]);
  });
});
