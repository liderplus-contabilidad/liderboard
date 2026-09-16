import { describe, expect, it } from "vitest";
import { addDays, daysBetween, isISODate, toISODate, todayISO } from "./dates";

describe("toISODate", () => {
  it("reads an Excel serial", () => {
    expect(toISODate(43097)).toBe("2017-12-28");
    expect(toISODate(45394)).toBe("2024-04-12");
  });

  it("reads dd/mm/yyyy and dd-mm-yyyy, day first", () => {
    expect(toISODate("05/05/2026")).toBe("2026-05-05");
    expect(toISODate("18-05-2026")).toBe("2026-05-18");
    expect(toISODate("24/08/2026")).toBe("2026-08-24");
  });

  it("reads a two-digit year as 20yy", () => {
    expect(toISODate("6/9/26")).toBe("2026-09-06");
  });

  it("passes an ISO string through and refuses junk", () => {
    expect(toISODate("2026-01-09")).toBe("2026-01-09");
    expect(toISODate("")).toBeNull();
    expect(toISODate(null)).toBeNull();
    expect(toISODate("hoy")).toBeNull();
    expect(toISODate("32/01/2026")).toBeNull();
    expect(toISODate(0)).toBeNull();
  });
});

describe("day arithmetic", () => {
  it("counts whole days, signed", () => {
    expect(daysBetween("2026-09-08", "2026-09-15")).toBe(7);
    expect(daysBetween("2026-09-15", "2026-09-08")).toBe(-7);
    expect(daysBetween("2026-02-28", "2026-03-01")).toBe(1);
  });

  it("adds days across a month end", () => {
    expect(addDays("2026-08-30", 3)).toBe("2026-09-02");
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
  });

  it("knows what an ISO date is", () => {
    expect(isISODate("2026-09-15")).toBe(true);
    expect(isISODate("15/09/2026")).toBe(false);
  });

  it("writes today in the local calendar", () => {
    expect(todayISO(new Date(2026, 8, 15, 23, 30))).toBe("2026-09-15");
  });
});
