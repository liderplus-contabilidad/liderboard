import { describe, expect, it } from "vitest";
import {
  allowedFrequencies,
  bucketLabel,
  bucketMonths,
  monthsInPeriod,
  periodFullLabel,
  periodLabels,
  periodOfMonth,
  periodsPerYear,
  sumByPeriod,
} from "./period";

describe("allowedFrequencies", () => {
  it("only ever aggregates up from the base", () => {
    expect(allowedFrequencies("mensual")).toEqual(["mensual", "trimestral", "semestral", "anual"]);
    expect(allowedFrequencies("semestral")).toEqual(["semestral", "anual"]);
    expect(allowedFrequencies("anual")).toEqual(["anual"]);
  });
});

describe("periodLabels", () => {
  it("spells the periods the same everywhere", () => {
    expect(periodLabels("mensual")).toHaveLength(12);
    expect(periodLabels("trimestral")).toEqual(["T1", "T2", "T3", "T4"]);
    expect(periodLabels("semestral")).toEqual(["S1", "S2"]);
    expect(periodLabels("anual")).toEqual(["Total"]);
  });
});

describe("periodsPerYear", () => {
  it("counts the columns a year holds", () => {
    expect(periodsPerYear("mensual")).toBe(12);
    expect(periodsPerYear("trimestral")).toBe(4);
    expect(periodsPerYear("semestral")).toBe(2);
    expect(periodsPerYear("anual")).toBe(1);
  });
});

describe("monthsInPeriod / periodOfMonth", () => {
  it("names the months a period spans", () => {
    expect(monthsInPeriod("trimestral", 0)).toEqual([0, 1, 2]);
    expect(monthsInPeriod("trimestral", 3)).toEqual([9, 10, 11]);
    expect(monthsInPeriod("semestral", 1)).toEqual([6, 7, 8, 9, 10, 11]);
    expect(monthsInPeriod("mensual", 4)).toEqual([4]);
  });

  it("places a month in its period", () => {
    expect(periodOfMonth("trimestral", 4)).toBe(1); // mayo is T2
    expect(periodOfMonth("semestral", 6)).toBe(1); // julio is S2
    expect(periodOfMonth("anual", 11)).toBe(0);
  });

  it("round-trips: every month lands in the period that claims it", () => {
    for (const frequency of ["mensual", "trimestral", "semestral", "anual"] as const) {
      for (let month = 0; month < 12; month++) {
        expect(monthsInPeriod(frequency, periodOfMonth(frequency, month))).toContain(month);
      }
    }
  });
});

describe("sumByPeriod", () => {
  const months = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

  it("adds the months of each period", () => {
    expect(sumByPeriod(months, "trimestral")).toEqual([6, 15, 24, 33]);
    expect(sumByPeriod(months, "semestral")).toEqual([21, 57]);
    expect(sumByPeriod(months, "anual")).toEqual([78]);
  });

  it("leaves a monthly fold alone", () => {
    expect(sumByPeriod(months, "mensual")).toEqual(months);
  });
});

describe("periodFullLabel", () => {
  it("spells out what a code like «T1» stands for", () => {
    expect(periodFullLabel("trimestral", 0)).toBe("Trimestre 1 · ene–mar");
    expect(periodFullLabel("trimestral", 3)).toBe("Trimestre 4 · oct–dic");
    expect(periodFullLabel("semestral", 1)).toBe("Semestre 2 · jul–dic");
  });

  it("does not write a range for a period of one month", () => {
    expect(periodFullLabel("mensual", 4)).toBe("Mes 5 · may");
  });
});

describe("bucketMonths", () => {
  it("groups marked months into their periods, in calendar order", () => {
    expect(bucketMonths("trimestral", [11, 0, 1, 2])).toEqual([
      { index: 0, months: [0, 1, 2], complete: true },
      { index: 3, months: [11], complete: false },
    ]);
  });

  it("keeps a partial period rather than dropping it, but flags it", () => {
    const [bucket] = bucketMonths("trimestral", [0, 1]);
    expect(bucket).toEqual({ index: 0, months: [0, 1], complete: false });
  });

  it("de-duplicates and never depends on click order", () => {
    expect(bucketMonths("semestral", [5, 0, 5])).toEqual([
      { index: 0, months: [0, 5], complete: false },
    ]);
  });

  it("folds the whole year into one bucket at the annual step", () => {
    const months = Array.from({ length: 12 }, (_, m) => m);
    expect(bucketMonths("anual", months)).toEqual([{ index: 0, months, complete: true }]);
  });
});

describe("bucketLabel", () => {
  it("names a complete period by its period name", () => {
    expect(bucketLabel("trimestral", { index: 1, months: [3, 4, 5], complete: true })).toBe("T2");
    expect(bucketLabel("semestral", { index: 0, months: [0, 1, 2, 3, 4, 5], complete: true })).toBe(
      "S1",
    );
  });

  it("refuses to call two months «T1» — it names what the column actually holds", () => {
    expect(bucketLabel("trimestral", { index: 0, months: [0, 1], complete: false })).toBe(
      "Ene · Feb",
    );
  });
});
