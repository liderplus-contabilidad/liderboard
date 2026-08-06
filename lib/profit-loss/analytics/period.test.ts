import { describe, expect, it } from "vitest";
import {
  comparePeriodRefs,
  periodLabel,
  periodRangeLabel,
  periodsAlign,
  periodsForYear,
} from "./period";
import { seriesKeyId, type PeriodRef } from "./types";

const ENE_2026: PeriodRef = { year: 2026, frequency: "mensual", index: 0 };

describe("periodLabel", () => {
  it("labels a month of a single-year query without the year suffix", () => {
    expect(periodLabel(ENE_2026)).toBe("Ene");
    expect(periodLabel({ year: 2026, frequency: "mensual", index: 11 })).toBe("Dic");
  });

  it("adds the two-digit year when the query spans several years", () => {
    expect(periodLabel(ENE_2026, { multiYear: true })).toBe("Ene 26");
    expect(periodLabel({ year: 2025, frequency: "mensual", index: 0 }, { multiYear: true })).toBe(
      "Ene 25",
    );
  });

  it("labels the coarser frequencies", () => {
    expect(periodLabel({ year: 2026, frequency: "trimestral", index: 1 })).toBe("T2");
    expect(periodLabel({ year: 2026, frequency: "semestral", index: 1 })).toBe("S2");
    expect(periodLabel({ year: 2026, frequency: "anual", index: 0 })).toBe("Total");
    expect(
      periodLabel({ year: 2026, frequency: "trimestral", index: 3 }, { multiYear: true }),
    ).toBe("T4 26");
  });
});

describe("periodRangeLabel", () => {
  const meses = periodsForYear(2026, "mensual");

  it("collapses a contiguous set into a range", () => {
    // El archivo llega hasta julio: el rango es el de la cobertura, no el del año.
    expect(periodRangeLabel(meses.slice(0, 7))).toBe("Ene–Jul");
    expect(periodRangeLabel(periodsForYear(2026, "trimestral").slice(0, 3))).toBe("T1–T3");
  });

  it("enumerates a set with holes instead of claiming what is between", () => {
    // «Ene–Mar» afirmaría que febrero está sumado, y no lo está.
    expect(periodRangeLabel([meses[0], meses[2]])).toBe("Ene, Mar");
    expect(periodRangeLabel([meses[0], meses[2], meses[4]])).toBe("Ene, Mar, May");
  });

  it("names a single period by itself, and an empty set with nothing", () => {
    expect(periodRangeLabel([meses[6]])).toBe("Jul");
    expect(periodRangeLabel([])).toBe("");
  });

  it("carries the year suffix through when the query spans several", () => {
    expect(periodRangeLabel(meses.slice(0, 2), { multiYear: true })).toBe("Ene 26–Feb 26");
  });
});

describe("periodsForYear", () => {
  it("produces one ref per period of the frequency", () => {
    expect(periodsForYear(2026, "mensual")).toHaveLength(12);
    expect(periodsForYear(2026, "trimestral")).toEqual([
      { year: 2026, frequency: "trimestral", index: 0 },
      { year: 2026, frequency: "trimestral", index: 1 },
      { year: 2026, frequency: "trimestral", index: 2 },
      { year: 2026, frequency: "trimestral", index: 3 },
    ]);
    expect(periodsForYear(2026, "semestral")).toHaveLength(2);
    expect(periodsForYear(2026, "anual")).toEqual([{ year: 2026, frequency: "anual", index: 0 }]);
  });
});

describe("comparePeriodRefs", () => {
  it("orders by year and then by index", () => {
    const refs: PeriodRef[] = [
      { year: 2026, frequency: "trimestral", index: 0 },
      { year: 2025, frequency: "trimestral", index: 3 },
      { year: 2025, frequency: "trimestral", index: 1 },
    ];
    expect([...refs].sort(comparePeriodRefs).map((r) => `${r.year}-T${r.index + 1}`)).toEqual([
      "2025-T2",
      "2025-T4",
      "2026-T1",
    ]);
  });
});

describe("periodsAlign", () => {
  it("aligns the same period of different years", () => {
    expect(
      periodsAlign(
        { year: 2025, frequency: "trimestral", index: 1 },
        { year: 2026, frequency: "trimestral", index: 1 },
      ),
    ).toBe(true);
  });

  it("does not align different indexes nor different frequencies", () => {
    expect(
      periodsAlign(
        { year: 2025, frequency: "trimestral", index: 1 },
        { year: 2026, frequency: "trimestral", index: 2 },
      ),
    ).toBe(false);
    // T2 must not align with April just because both are index 1.
    expect(
      periodsAlign(
        { year: 2025, frequency: "mensual", index: 1 },
        { year: 2026, frequency: "trimestral", index: 1 },
      ),
    ).toBe(false);
  });
});

describe("seriesKeyId", () => {
  it("is stable across calls with identical content", () => {
    const key = { code: "4.1.1.1", centerId: "cultura-manor", year: 2026 };
    expect(seriesKeyId(key)).toBe(seriesKeyId({ ...key }));
  });

  it("distinguishes center and year", () => {
    const base = { code: "4.1.1.1", centerId: "cultura-manor", year: 2026 };
    expect(seriesKeyId(base)).not.toBe(seriesKeyId({ ...base, centerId: "centro-principal" }));
    expect(seriesKeyId(base)).not.toBe(seriesKeyId({ ...base, year: 2025 }));
  });
});
