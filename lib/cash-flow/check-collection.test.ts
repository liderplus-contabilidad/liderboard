import { describe, expect, it } from "vitest";
import { collectionView, pendingCollections } from "./check-collection";
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

describe("collection quick filters and ordering", () => {
  const rows: Check[] = [
    { ...check, id: "undated" },
    { ...check, id: "later", expectedCashOn: "2026-10-01" },
    { ...check, id: "soon", expectedCashOn: "2026-09-30" },
    { ...check, id: "today", expectedCashOn: "2026-09-23" },
    { ...check, id: "late", expectedCashOn: "2026-09-22" },
    { ...check, id: "cashed", step: "cashed", expectedCashOn: "2026-09-23" },
    { ...check, id: "void", voided: true, expectedCashOn: "2026-09-23" },
  ];
  it.each([
    ["attention", ["late", "today", "soon", "undated"]],
    ["today", ["today"]],
    ["soon", ["soon"]],
    ["late", ["late"]],
    ["undated", ["undated"]],
  ] as const)("filters %s using the row warning", (filter, ids) => {
    expect(
      collectionView(rows, "2026-09-23", filter, "collection").rows.map((row) => row.id),
    ).toEqual(ids);
  });
  it("keeps counts independent of the selected warning and leaves source order intact", () => {
    const ids = rows.map((row) => row.id);
    const result = collectionView(rows, "2026-09-23", "today", "collection");
    expect(result.counts).toEqual({ all: 7, attention: 4, today: 1, soon: 1, late: 1, undated: 1 });
    expect(rows.map((row) => row.id)).toEqual(ids);
    expect(
      collectionView(rows, "2026-09-23", "all", "collection").rows.map((row) => row.id),
    ).toEqual(["late", "today", "soon", "later", "undated", "cashed", "void"]);
  });
  it("updates at a new day and sorts by issue date when requested", () => {
    expect(collectionView(rows, "2026-09-24", "today", "collection").rows).toEqual([]);
    expect(
      collectionView(
        [
          { ...check, id: "old", issuedOn: "2026-01-01" },
          { ...check, id: "new", issuedOn: "2026-09-01" },
        ],
        "2026-09-23",
        "all",
        "issued",
      ).rows.map((row) => row.id),
    ).toEqual(["new", "old"]);
  });
});
