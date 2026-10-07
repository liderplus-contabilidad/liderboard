import { describe, expect, it } from "vitest";
import { sortChecks } from "./check-sort";
import type { Check } from "./types";

const base: Check = {
  id: "a",
  clientId: "c",
  voucher: "2",
  bank: "Banco",
  accountId: "a",
  payee: "Álvaro",
  number: "2",
  amount: 100,
  issuedOn: "2026-10-01",
  step: "made",
  voided: false,
  cashedOn: null,
  place: "",
  note: "",
};
const rows: Check[] = [
  base,
  {
    ...base,
    id: "b",
    voucher: "10",
    number: "10",
    payee: "Zeta",
    amount: 200,
    issuedOn: "2026-10-02",
    accountId: "b",
    step: "delivered",
  },
];
const accounts = new Map([
  ["a", "Banco A"],
  ["b", "Banco B"],
]);
const ids = (checks: Check[]) => checks.map(({ id }) => id);

describe("check table ordering", () => {
  it.each(["voucher", "number", "payee", "amount", "issued", "account", "step"] as const)(
    "toggles %s across the full result without modifying records",
    (key) => {
      expect(ids(sortChecks(rows, { key, direction: "asc" }, accounts, "2026-10-06"))).toEqual([
        "a",
        "b",
      ]);
      expect(ids(sortChecks(rows, { key, direction: "desc" }, accounts, "2026-10-06"))).toEqual([
        "b",
        "a",
      ]);
      expect(ids(rows)).toEqual(["a", "b"]);
      expect(rows[0]).toBe(base);
    },
  );
  it("keeps undated and completed collections after dated pending checks in both directions", () => {
    const checks: Check[] = [
      { ...base, id: "later", expectedCashOn: "2026-10-08" },
      { ...base, id: "undated" },
      { ...base, id: "done", step: "cashed", expectedCashOn: "2026-10-01" },
      { ...base, id: "earlier", expectedCashOn: "2026-10-05" },
    ];
    expect(
      ids(sortChecks(checks, { key: "collection", direction: "asc" }, accounts, "2026-10-06")),
    ).toEqual(["earlier", "later", "undated", "done"]);
    expect(
      ids(sortChecks(checks, { key: "collection", direction: "desc" }, accounts, "2026-10-06")),
    ).toEqual(["later", "earlier", "undated", "done"]);
  });
  it("leaves missing issue dates last and voided checks after the payment steps", () => {
    const checks = [{ ...base, id: "missing", issuedOn: null, voided: true }, base];
    expect(
      ids(sortChecks(checks, { key: "issued", direction: "desc" }, accounts, "2026-10-06")),
    ).toEqual(["a", "missing"]);
    expect(
      ids(sortChecks(checks, { key: "step", direction: "asc" }, accounts, "2026-10-06")),
    ).toEqual(["a", "missing"]);
  });
});
