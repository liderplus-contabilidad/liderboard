import { describe, expect, it } from "vitest";
import {
  applyCheckFilters,
  checkYears,
  emptyCheckFilters,
  resolveVisibleYears,
  sanitizeCheckFilters,
  UNASSIGNED,
  withAccountToggled,
  withAllYears,
  withStepToggled,
  withYearToggled,
} from "./check-filters";
import type { Check } from "./types";

function check(over: Partial<Check>): Check {
  return {
    id: over.id ?? "c",
    clientId: "cl",
    voucher: "1",
    bank: "PRODUBANCO",
    accountId: "prod",
    payee: "ENI ECUADOR S.A.",
    number: "54723",
    amount: 100,
    issuedOn: "2024-07-16",
    step: "cashed",
    voided: false,
    cashedOn: "2024-07-19",
    place: "",
    note: "",
    ...over,
  };
}

const CHECKS = [
  check({ id: "a" }),
  check({ id: "b", issuedOn: "2023-02-01", step: "delivered", cashedOn: null }),
  check({ id: "c", issuedOn: null, accountId: null, bank: "CAJA", step: "made" }),
  check({ id: "d", voided: true, issuedOn: "2024-01-01" }),
];

describe("years", () => {
  it("lists the years descending and resolves no mark to the cut date's year, else the latest", () => {
    expect(checkYears(CHECKS)).toEqual([2024, 2023]);
    expect(resolveVisibleYears([], [2024, 2023], 2023)).toEqual([2023]);
    expect(resolveVisibleYears([], [2024, 2023], 2026)).toEqual([2024]);
    expect(resolveVisibleYears([2023], [2024, 2023], 2026)).toEqual([2023]);
    expect(resolveVisibleYears([], [], 2026)).toEqual([]);
  });

  it("marks all with «Todos los años»", () => {
    expect(withAllYears(emptyCheckFilters(), [2024, 2023]).years).toEqual([2024, 2023]);
  });
});

describe("applyCheckFilters", () => {
  it("opens on the latest year, and lists undated checks only with every year marked", () => {
    expect(
      applyCheckFilters(CHECKS, emptyCheckFilters(), [2024, 2023], 2026).map((c) => c.id),
    ).toEqual(["a", "d"]);
    const all = withAllYears(emptyCheckFilters(), [2024, 2023]);
    expect(applyCheckFilters(CHECKS, all, [2024, 2023], 2026)).toHaveLength(4);
    // The cut date's year, when the register holds it.
    expect(
      applyCheckFilters(CHECKS, emptyCheckFilters(), [2024, 2023], 2023).map((c) => c.id),
    ).toEqual(["b"]);
  });

  it("narrows by account (including the unassigned sentinel) and by step", () => {
    const all = withAllYears(emptyCheckFilters(), [2024, 2023]);
    const unassigned = withAccountToggled(all, UNASSIGNED, ["prod", UNASSIGNED]);
    expect(applyCheckFilters(CHECKS, unassigned, [2024, 2023], 2026).map((c) => c.id)).toEqual([
      "c",
    ]);
    const voided = withStepToggled(all, "voided");
    expect(applyCheckFilters(CHECKS, voided, [2024, 2023], 2026).map((c) => c.id)).toEqual(["d"]);
    const delivered = withStepToggled(all, "delivered");
    expect(applyCheckFilters(CHECKS, delivered, [2024, 2023], 2026).map((c) => c.id)).toEqual([
      "b",
    ]);
  });

  it("searches payee, number and voucher", () => {
    const f = { ...withAllYears(emptyCheckFilters(), [2024, 2023]), search: "eni ecuador" };
    expect(applyCheckFilters(CHECKS, f, [2024, 2023], 2026)).toHaveLength(4);
    const byBank = { ...withAllYears(emptyCheckFilters(), [2024, 2023]), search: "caja" };
    expect(applyCheckFilters(CHECKS, byBank, [2024, 2023], 2026).map((c) => c.id)).toEqual(["c"]);
  });

  it("prunes unknown accounts and years on read", () => {
    let f = withYearToggled(emptyCheckFilters(), 2019, [2024, 2023, 2019]);
    f = withAccountToggled(f, "gone", ["prod", "gone"]);
    const clean = sanitizeCheckFilters(f, ["prod"], [2024, 2023]);
    expect(clean).toEqual({ search: "", accountIds: [], steps: [], years: [] });
    expect(sanitizeCheckFilters(clean, ["prod"], [2024, 2023])).toBe(clean);
  });
});
