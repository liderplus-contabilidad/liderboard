import { describe, expect, it } from "vitest";
import { pendingCollections } from "./check-collection";
import type { Check } from "./types";

const check: Check = {
  id: "1",
  clientId: "c",
  voucher: "1",
  bank: "Banco",
  accountId: null,
  payee: "Proveedor",
  number: "100",
  amount: 500,
  issuedOn: "2026-10-01",
  step: "delivered",
  voided: false,
  cashedOn: null,
  place: "",
  note: "",
};

describe("planned check collections", () => {
  it.each([
    ["2026-09-22", -1, "Pendiente hace 1 día", "negative"],
    ["2026-09-23", 0, "Cobro previsto hoy", "warning"],
    ["2026-09-24", 1, "Cobro en 1 día", "warning"],
    ["2026-09-30", 7, "Cobro en 7 días", "warning"],
    ["2026-10-01", 8, "Cobro en 8 días", "outline"],
  ])(
    "computes %s independently of issue date and account assignment",
    (expectedCashOn, days, label, variant) => {
      expect(pendingCollections([{ ...check, expectedCashOn }], "2026-09-23")[0]).toMatchObject({
        days,
        label,
        variant,
      });
    },
  );
  it("excludes voided and collected checks, and keeps undated checks last", () => {
    const rows = pendingCollections(
      [
        check,
        { ...check, id: "void", voided: true },
        { ...check, id: "cashed", step: "cashed" },
        { ...check, id: "date", cashedOn: "2026-09-22" },
        { ...check, id: "scheduled", expectedCashOn: "2026-09-24" },
      ],
      "2026-09-23",
    );
    expect(rows.map(({ check }) => check.id)).toEqual(["scheduled", "1"]);
    expect(rows[1]).toMatchObject({ days: null, label: "Falta programar el cobro" });
  });
});
