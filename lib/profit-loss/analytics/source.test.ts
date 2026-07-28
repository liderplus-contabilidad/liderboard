import { describe, expect, it } from "vitest";
import type { CellEdit } from "../types";
import { CENTRO_VACIO, CULTURA_MANOR, SIN_CENTRO, makeDataset } from "./fixtures";
import { aggregateCoverage, buildAnalyticsSource, canReexpress } from "./source";

function edit(code: string, monthIndex: number, value: number): CellEdit {
  return { datasetId: "d1", code, monthIndex, value, updatedAt: 0 };
}

describe("buildAnalyticsSource", () => {
  it("materializes every account with its rollups applied", () => {
    const source = buildAnalyticsSource(CULTURA_MANOR);
    // The fixture leaves parents at zero on purpose: these sums can only come from the rollup.
    expect(source.valuesByCode.get("4.1.1")?.[0]).toBe(24465);
    expect(source.valuesByCode.get("4")?.[0]).toBe(25229);
    expect(source.valuesByCode.get("5")?.[0]).toBe(20121);
  });

  it("carries the center, year and base frequency of the dataset", () => {
    const source = buildAnalyticsSource(CULTURA_MANOR);
    expect(source.centerId).toBe("cultura-manor");
    expect(source.centerName).toBe("Cultura Manor");
    expect(source.year).toBe(2026);
    expect(source.baseFrequency).toBe("mensual");
    expect(source.namesByCode.get("4.1.1.1.1.1")).toBe("Ventas Habitaciones");
  });

  it("reflects leaf edits in the parents", () => {
    const march = 2;
    const source = buildAnalyticsSource(CULTURA_MANOR, [edit("5.1.1.1.1", march, 12500)]);
    expect(source.valuesByCode.get("5.1.1")?.[march]).toBe(12500);
    expect(source.valuesByCode.get("5.1")?.[march]).toBe(12500 + 11121);
    // Untouched months keep the file's value.
    expect(source.valuesByCode.get("5.1.1")?.[0]).toBe(9000);
  });

  it("maps each account to its direct parent, honouring the real nesting", () => {
    const source = buildAnalyticsSource(CULTURA_MANOR);
    expect(source.parentByCode.get("4.1.8.4")).toBe("4.1.8");
    expect(source.parentByCode.get("4.1.1.1.1.1")).toBe("4.1.1.1.1");
    expect(source.parentByCode.get("4.1.1.2")).toBe("4.1.1");
  });

  it("leaves root accounts without a parent", () => {
    const source = buildAnalyticsSource(CULTURA_MANOR);
    expect(source.parentByCode.get("4")).toBeUndefined();
    expect(source.parentByCode.get("5")).toBeUndefined();
  });
});

describe("coverage", () => {
  it("covers exactly the months the file reaches", () => {
    const source = buildAnalyticsSource(CULTURA_MANOR);
    expect([...source.coverage].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it("covers a month where the business moved even if an account is at zero", () => {
    const source = buildAnalyticsSource(CULTURA_MANOR);
    // Ventas Eventos books nothing in February; the month is still covered by the rest.
    expect(source.valuesByCode.get("4.1.1.3")?.[1]).toBe(0);
    expect(source.coverage.has(1)).toBe(true);
  });

  it("comes out empty for a file that is entirely zero", () => {
    const source = buildAnalyticsSource(CENTRO_VACIO);
    expect(source.coverage.size).toBe(0);
  });

  it("covers the single period of an annual base", () => {
    const source = buildAnalyticsSource(SIN_CENTRO);
    expect(source.baseFrequency).toBe("anual");
    expect([...source.coverage]).toEqual([0]);
  });

  it("covers nothing for an annual base that is entirely zero", () => {
    const source = buildAnalyticsSource(makeDataset({ baseFrequency: "anual", months: 0 }));
    expect(source.coverage.size).toBe(0);
  });
});

describe("coverage — recibida vs. omitida (por-centros vs. estado único)", () => {
  it("wins outright when passed, even over a source that is entirely zero", () => {
    // months: 0 makes every value 0 — the value-based heuristic would say "uncovered"
    // everywhere; a workspace that DECLARES month 0 loaded must still show it covered.
    const allZero = makeDataset({ months: 0 });
    const source = buildAnalyticsSource(allZero, [], new Set([0]));
    expect([...source.coverage]).toEqual([0]);
  });

  it("leaves a declared-but-not-loaded month uncovered even though other sources have values", () => {
    const withValues = makeDataset({ months: 7 });
    // Declare only month 0 loaded — August (index 7) has real values in the dataset, but the
    // workspace never received it, so it must stay uncovered regardless.
    const source = buildAnalyticsSource(withValues, [], new Set([0]));
    expect(source.coverage.has(7)).toBe(false);
    expect([...source.coverage]).toEqual([0]);
  });

  it("is derived from values, unchanged, when coveredIndices is omitted (single-statement path)", () => {
    const source = buildAnalyticsSource(CULTURA_MANOR);
    expect([...source.coverage].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });
});

describe("aggregateCoverage", () => {
  it("covers a coarse period when any of its base periods is covered", () => {
    const covered = aggregateCoverage(new Set([0, 1, 2, 3, 4, 5, 6]), "mensual", "trimestral");
    // T1 and T2 are full, T3 is covered by July alone, T4 is not covered at all.
    expect([...covered].sort((a, b) => a - b)).toEqual([0, 1, 2]);
  });

  it("aggregates to semesters and to the year", () => {
    expect([...aggregateCoverage(new Set([6]), "mensual", "semestral")]).toEqual([1]);
    expect([...aggregateCoverage(new Set([6]), "mensual", "anual")]).toEqual([0]);
  });

  it("passes coverage through when the frequency does not change", () => {
    const base = new Set([0, 3]);
    const same = aggregateCoverage(base, "mensual", "mensual");
    expect([...same]).toEqual([0, 3]);
    expect(same).not.toBe(base);
  });

  it("refuses to break an annual base down into months", () => {
    expect(() => aggregateCoverage(new Set([0]), "anual", "mensual")).toThrow(/desagregar/);
  });
});

describe("canReexpress", () => {
  it("allows aggregating up from a monthly base and re-reading the same frequency", () => {
    expect(canReexpress("mensual", "trimestral")).toBe(true);
    expect(canReexpress("mensual", "mensual")).toBe(true);
    expect(canReexpress("anual", "anual")).toBe(true);
  });

  it("rejects anything that would require disaggregating", () => {
    expect(canReexpress("anual", "mensual")).toBe(false);
    expect(canReexpress("trimestral", "semestral")).toBe(false);
  });
});
