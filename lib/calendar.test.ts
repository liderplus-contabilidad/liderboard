import { describe, expect, it } from "vitest";
import { monthGrid, monthOf, monthTitle, shiftMonth } from "./calendar";

describe("monthOf", () => {
  it("reads the year and month index of an ISO day", () => {
    expect(monthOf("2026-09-16")).toEqual({ year: 2026, monthIndex: 8 });
  });
});

describe("shiftMonth", () => {
  it("crosses year boundaries in both directions", () => {
    expect(shiftMonth({ year: 2026, monthIndex: 11 }, 1)).toEqual({ year: 2027, monthIndex: 0 });
    expect(shiftMonth({ year: 2026, monthIndex: 0 }, -1)).toEqual({ year: 2025, monthIndex: 11 });
    expect(shiftMonth({ year: 2026, monthIndex: 3 }, 14)).toEqual({ year: 2027, monthIndex: 5 });
  });
});

describe("monthTitle", () => {
  it("names the month in Spanish with its year", () => {
    expect(monthTitle({ year: 2026, monthIndex: 8 })).toBe("Septiembre 2026");
  });
});

describe("monthGrid", () => {
  it("lays September 2026 out Monday-first, six rows, padded with the neighbours", () => {
    const grid = monthGrid({ year: 2026, monthIndex: 8 });
    expect(grid).toHaveLength(6);
    expect(grid.every((week) => week.length === 7)).toBe(true);
    // 1 September 2026 is a Tuesday: one day of August fills the first cell.
    expect(grid[0].map((d) => d.iso)).toEqual([
      "2026-08-31",
      "2026-09-01",
      "2026-09-02",
      "2026-09-03",
      "2026-09-04",
      "2026-09-05",
      "2026-09-06",
    ]);
    expect(grid[0][0].inMonth).toBe(false);
    expect(grid[0][1].inMonth).toBe(true);
    // 30 September is a Wednesday; the rest of the sixth row is October.
    expect(grid[4][2].iso).toBe("2026-09-30");
    expect(grid[4][3]).toEqual({ iso: "2026-10-01", day: 1, inMonth: false });
    expect(grid[5][6].iso).toBe("2026-10-11");
  });

  it("starts on the first cell when the month opens on a Monday and still fills six rows", () => {
    // 1 June 2026 is a Monday.
    const grid = monthGrid({ year: 2026, monthIndex: 5 });
    expect(grid[0][0]).toEqual({ iso: "2026-06-01", day: 1, inMonth: true });
    expect(grid[5][6].iso).toBe("2026-07-12");
  });

  it("handles February of a leap year", () => {
    const grid = monthGrid({ year: 2028, monthIndex: 1 });
    const inMonth = grid.flat().filter((d) => d.inMonth);
    expect(inMonth).toHaveLength(29);
    expect(inMonth.at(-1)?.iso).toBe("2028-02-29");
  });
});
