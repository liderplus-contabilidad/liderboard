import { describe, expect, it } from "vitest";
import { overdraftDatesError, overdraftNotice } from "./overdraft";

describe("overdraft reminders", () => {
  const account = {
    overdraft: 500,
    overdraftStartsOn: "2026-09-01",
    overdraftEndsOn: "2026-09-23",
  };
  it.each([
    ["2026-08-31", "Inicia en 1 día", "outline"],
    ["2026-09-15", "Vence en 8 días", "outline"],
    ["2026-09-16", "Vence en 7 días", "warning"],
    ["2026-09-22", "Vence en 1 día", "warning"],
    ["2026-09-23", "Vence hoy", "warning"],
    ["2026-09-24", "Vencido hace 1 día", "negative"],
    ["2026-09-25", "Vencido hace 2 días", "negative"],
  ])("at %s", (today, label, variant) => {
    expect(overdraftNotice(account, today)).toEqual({ label, variant });
  });
  it("supports old undated accounts and ignores zero amounts", () => {
    expect(overdraftNotice({ overdraft: 500 }, "2026-09-23")).toBeNull();
    expect(overdraftNotice({ ...account, overdraft: 0 }, "2026-09-23")).toBeNull();
    expect(overdraftNotice({ ...account, overdraftStartsOn: null }, "2026-09-23")?.label).toBe(
      "Vence hoy",
    );
  });
  it("validates real calendar dates and the range, allowing same-day periods and cleared dates", () => {
    expect(overdraftDatesError({ overdraftStartsOn: "2026-02-30" })).toBeTruthy();
    expect(overdraftDatesError({ ...account, overdraftEndsOn: "2026-08-30" })).toBeTruthy();
    expect(
      overdraftDatesError({ ...account, overdraftEndsOn: account.overdraftStartsOn }),
    ).toBeUndefined();
    expect(overdraftDatesError({ overdraftStartsOn: null, overdraftEndsOn: null })).toBeUndefined();
    expect(
      overdraftNotice({ overdraft: 500, overdraftEndsOn: "2028-03-01" }, "2028-02-28")?.label,
    ).toBe("Vence en 2 días");
  });
});
