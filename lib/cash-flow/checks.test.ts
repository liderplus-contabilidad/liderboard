import { describe, expect, it } from "vitest";
import {
  checkStatusLabel,
  isOutstandingAt,
  nextVoucher,
  outstandingByAccount,
  outstandingChecks,
  unassignedBanks,
} from "./checks";
import type { Check } from "./types";

function check(over: Partial<Check>): Check {
  return {
    id: "c",
    clientId: "cl",
    voucher: "1",
    bank: "PRODUBANCO",
    accountId: "acc-prod",
    payee: "X",
    number: "100",
    amount: 100,
    issuedOn: "2026-08-01",
    step: "delivered",
    voided: false,
    cashedOn: null,
    place: "",
    note: "",
    ...over,
  };
}

describe("isOutstandingAt", () => {
  it("counts a delivered check without a cashed date", () => {
    expect(isOutstandingAt(check({}), "2026-08-05")).toBe(true);
  });

  it("keeps counting it on dates before it was cashed, and stops from that day", () => {
    const cashed = check({ step: "cashed", cashedOn: "2026-08-09" });
    expect(isOutstandingAt(cashed, "2026-08-05")).toBe(true);
    expect(isOutstandingAt(cashed, "2026-08-09")).toBe(false);
    expect(isOutstandingAt(cashed, "2026-08-10")).toBe(false);
  });

  it("does not count a check issued after the date, nor a voided one", () => {
    expect(isOutstandingAt(check({ issuedOn: "2026-08-10" }), "2026-08-05")).toBe(false);
    expect(isOutstandingAt(check({ voided: true }), "2026-08-05")).toBe(false);
  });

  it("counts a check at any step of its timeline", () => {
    expect(isOutstandingAt(check({ step: "made" }), "2026-08-05")).toBe(true);
    expect(isOutstandingAt(check({ step: "signed" }), "2026-08-05")).toBe(true);
  });
});

describe("outstanding by account", () => {
  const checks = [
    check({ id: "a", amount: 2000 }),
    check({ id: "b", amount: 491.55 }),
    check({ id: "c", amount: 500, step: "cashed", cashedOn: "2026-08-09" }),
    check({ id: "d", amount: 781.71, accountId: "acc-pich", bank: "PICHINCHA" }),
    check({ id: "e", amount: 999, accountId: null, bank: "CAJA" }),
    check({ id: "f", amount: 999, accountId: null, bank: "CAJA" }),
    check({ id: "g", amount: 5, accountId: null, bank: "CRUCE", voided: true }),
  ];

  it("reads one account at a date", () => {
    expect(outstandingChecks(checks, "acc-prod", "2026-08-05").map((c) => c.id)).toEqual([
      "a",
      "b",
      "c",
    ]);
    expect(outstandingChecks(checks, "acc-prod", "2026-08-10").map((c) => c.id)).toEqual([
      "a",
      "b",
    ]);
  });

  it("sums every account, leaving unassigned checks out", () => {
    const at5 = outstandingByAccount(checks, "2026-08-05");
    expect(at5.get("acc-prod")).toBeCloseTo(2991.55);
    expect(at5.get("acc-pich")).toBeCloseTo(781.71);
    expect(at5.size).toBe(2);
    expect(outstandingByAccount(checks, "2026-08-10").get("acc-prod")).toBeCloseTo(2491.55);
  });

  it("lists the bank labels that resolved to no account", () => {
    expect(unassignedBanks(checks)).toEqual([
      { bank: "CAJA", count: 2 },
      { bank: "CRUCE", count: 1 },
    ]);
  });
});

describe("checkStatusLabel", () => {
  it("names the step, or Anulado over it", () => {
    expect(checkStatusLabel(check({ step: "signed" }))).toBe("Firmado");
    expect(checkStatusLabel(check({ step: "cashed", voided: true }))).toBe("Anulado");
  });
});

describe("nextVoucher", () => {
  it("proposes one past the highest numeric voucher, ignoring non-numeric ones", () => {
    expect(nextVoucher([])).toBe("1");
    expect(
      nextVoucher([
        check({ voucher: "4419" }),
        check({ voucher: "17121" }),
        check({ voucher: "A-3" }),
      ]),
    ).toBe("17122");
  });
});
