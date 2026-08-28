import { describe, expect, it } from "vitest";
import { CULTURA_MANOR_SOURCE, makeSource } from "../analytics/fixtures";
import type { AnalyticsSource } from "../analytics/types";
import type { VerticalRow } from "./vertical";
import { buildVerticalAnalysis } from "./vertical";

const ARRENDAMIENTO = "5.1.5.12";

/** The same chart of accounts without a single income account: the base comes out 0 every month. */
const SOLO_GASTOS = makeSource({
  centerId: "solo-gastos",
  centerName: "Solo Gastos",
  omit: ["4.1.1.1.1.1", "4.1.1.2", "4.1.1.3", "4.1.1.5", "4.1.1.6", "4.1.4", "4.1.8.4"],
});

function rowOf(rows: VerticalRow[], code: string): VerticalRow {
  const row = rows.find((candidate) => candidate.code === code);
  if (!row) {
    throw new Error(`La tabla no trae la fila ${code}.`);
  }
  return row;
}

/**
 * A source of two accounts and two months, written by hand: the «Total año» case needs bases of very
 * different sizes (100 and 900) that the shared chart of accounts does not produce.
 */
function makeTinySource(values: Record<string, number[]>): AnalyticsSource {
  const codes = Object.keys(values);
  return {
    centerId: "tiny",
    centerName: "Tiny",
    year: 2026,
    baseFrequency: "mensual",
    valuesByCode: new Map(codes.map((code) => [code, padYear(values[code])])),
    namesByCode: new Map(codes.map((code) => [code, `Cuenta ${code}`])),
    parentByCode: new Map(),
    coverage: new Set(values[codes[0]].map((_, index) => index)),
  };
}

function padYear(values: number[]): number[] {
  return Array.from({ length: 12 }, (_, index) => values[index] ?? 0);
}

describe("buildVerticalAnalysis", () => {
  const base = { baseCode: "4", frequency: "mensual" } as const;

  it("names the base account it divides by", () => {
    const table = buildVerticalAnalysis(CULTURA_MANOR_SOURCE, base);
    expect(table.base).toEqual({ code: "4", label: "Ingresos" });
  });

  it("expresses each account as a share of the base in each period", () => {
    const table = buildVerticalAnalysis(CULTURA_MANOR_SOURCE, base);
    // 8,000 over revenue of 25,229.
    expect(rowOf(table.rows, ARRENDAMIENTO).values[0] ?? 0).toBeCloseTo(31.71, 2);
  });

  it("puts the base row at 100% in every covered period", () => {
    const table = buildVerticalAnalysis(CULTURA_MANOR_SOURCE, base);
    const row = rowOf(table.rows, "4");
    expect(row.values.slice(0, 7).map((value) => Math.round(value ?? 0))).toEqual([
      100, 100, 100, 100, 100, 100, 100,
    ]);
  });

  it("keeps an account that does not hang from the base", () => {
    const table = buildVerticalAnalysis(CULTURA_MANOR_SOURCE, base);
    expect(ARRENDAMIENTO.startsWith("4")).toBe(false);
    expect(rowOf(table.rows, ARRENDAMIENTO).values[0]).not.toBeNull();
  });

  it("carries the tree depth and whether the account has children", () => {
    const { rows } = buildVerticalAnalysis(CULTURA_MANOR_SOURCE, base);
    expect(rowOf(rows, "4")).toMatchObject({ level: 1, hasChildren: true });
    expect(rowOf(rows, "4.1.1")).toMatchObject({ level: 3, hasChildren: true });
    expect(rowOf(rows, "4.1.1.1.1.1")).toMatchObject({ level: 6, hasChildren: false });
  });

  it("lists the accounts in file order", () => {
    const { rows } = buildVerticalAnalysis(CULTURA_MANOR_SOURCE, base);
    expect(rows.slice(0, 4).map((row) => row.code)).toEqual(["4", "4.1", "4.1.1", "4.1.1.1"]);
  });

  it("draws the whole chart of accounts, not the eight the palette allows", () => {
    const { rows } = buildVerticalAnalysis(CULTURA_MANOR_SOURCE, base);
    expect(rows).toHaveLength(CULTURA_MANOR_SOURCE.valuesByCode.size);
    expect(rows.length).toBeGreaterThan(8);
  });

  it("returns an empty table for a source that is not there", () => {
    const table = buildVerticalAnalysis(undefined, base);
    expect(table.rows).toEqual([]);
    expect(table.periods).toEqual([]);
  });
});

describe("buildVerticalAnalysis · cobertura", () => {
  const base = { baseCode: "4", frequency: "mensual" } as const;

  it("leaves an unloaded period empty instead of at zero", () => {
    // The file runs to July; August was never loaded.
    const table = buildVerticalAnalysis(CULTURA_MANOR_SOURCE, base);
    for (const row of table.rows) {
      expect(row.values[7]).toBeNull();
    }
  });

  it("leaves the whole column empty when the base has no movement there", () => {
    const table = buildVerticalAnalysis(SOLO_GASTOS, base);
    expect(SOLO_GASTOS.valuesByCode.get("4")?.[0]).toBe(0);
    expect(table.rows.every((row) => row.values[0] === null)).toBe(true);
  });

  it("warns once, naming the period the base is at zero in", () => {
    const table = buildVerticalAnalysis(SOLO_GASTOS, base);
    expect(table.warnings).toHaveLength(1);
    expect(table.warnings[0]).toContain("Ene");
    expect(table.rows.length).toBeGreaterThan(8);
  });

  it("computes a negative base but says the percentages read backwards", () => {
    const table = buildVerticalAnalysis(CULTURA_MANOR_SOURCE, {
      baseCode: "4.1.4",
      frequency: "mensual",
    });
    expect(rowOf(table.rows, ARRENDAMIENTO).values[0]).toBeLessThan(0);
    expect(table.warnings).toHaveLength(1);
    expect(table.warnings[0]).toMatch(/negativa/i);
  });

  it("leaves an account with no value empty while the base has one", () => {
    const table = buildVerticalAnalysis(CULTURA_MANOR_SOURCE, base);
    // Ventas Eventos bills nothing in February, but February IS loaded: it is a real zero.
    expect(rowOf(table.rows, "4.1.1.3").values[1]).toBe(0);
    // August is not loaded: that one is empty.
    expect(rowOf(table.rows, "4.1.1.3").values[7]).toBeNull();
  });

  it("says the base is missing instead of drawing a silent empty table", () => {
    const table = buildVerticalAnalysis(CULTURA_MANOR_SOURCE, {
      baseCode: "9.9.9",
      frequency: "mensual",
    });
    expect(table.base).toBeNull();
    expect(table.warnings).toHaveLength(1);
    expect(table.rows.every((row) => row.values.every((value) => value === null))).toBe(true);
  });
});

describe("buildVerticalAnalysis · Total año", () => {
  it("is a ratio of sums, not an average of the column percentages", () => {
    const source = makeTinySource({
      "4": [100, 900],
      "5": [50, 90],
    });
    const table = buildVerticalAnalysis(source, { baseCode: "4", frequency: "mensual" });
    const row = rowOf(table.rows, "5");

    expect(row.values[0]).toBeCloseTo(50, 6);
    expect(row.values[1]).toBeCloseTo(10, 6);
    // 150 ÷ 1000, not the average of 50 and 10.
    expect(row.total ?? 0).toBeCloseTo(14, 6);
  });

  it("stays on the whole year even when periods are marked", () => {
    const source = makeTinySource({
      "4": [100, 900],
      "5": [50, 90],
    });
    const table = buildVerticalAnalysis(source, {
      baseCode: "4",
      frequency: "mensual",
      periods: [{ year: source.year, frequency: "mensual", index: 0 }],
    });
    expect(table.periods).toHaveLength(1);
    expect(rowOf(table.rows, "5").values).toHaveLength(1);
    expect(rowOf(table.rows, "5").total ?? 0).toBeCloseTo(14, 6);
  });
});

describe("buildVerticalAnalysis · lo que acota la barra de filtros", () => {
  const base = { baseCode: "4", frequency: "mensual" } as const;

  it("narrows the rows to a marked account and its subtree", () => {
    const { rows } = buildVerticalAnalysis(CULTURA_MANOR_SOURCE, {
      ...base,
      markedCodes: ["5.1.5"],
    });
    expect(rows.map((row) => row.code)).toEqual([
      "5.1.5",
      "5.1.5.3",
      "5.1.5.7",
      "5.1.5.9",
      "5.1.5.12",
    ]);
  });

  it("keeps the whole tree when nothing is marked", () => {
    const { rows } = buildVerticalAnalysis(CULTURA_MANOR_SOURCE, { ...base, markedCodes: [] });
    expect(rows).toHaveLength(CULTURA_MANOR_SOURCE.valuesByCode.size);
  });

  it("hides the descendants of a collapsed account but not the account", () => {
    const { rows } = buildVerticalAnalysis(CULTURA_MANOR_SOURCE, {
      ...base,
      collapsed: new Set(["4.1"]),
    });
    const codes = rows.map((row) => row.code);
    expect(codes).toContain("4.1");
    expect(codes).not.toContain("4.1.1");
    expect(codes).not.toContain("4.1.1.1.1.1");
    expect(codes).toContain("5.1.5.12");
  });

  it("narrows the columns to the marked periods", () => {
    const table = buildVerticalAnalysis(CULTURA_MANOR_SOURCE, {
      ...base,
      periods: [
        { year: 2026, frequency: "mensual", index: 0 },
        { year: 2026, frequency: "mensual", index: 2 },
      ],
    });
    expect(table.periods.map((period) => period.index)).toEqual([0, 2]);
    expect(rowOf(table.rows, ARRENDAMIENTO).values).toHaveLength(2);
  });

  it("follows the frequency, quarters included", () => {
    const table = buildVerticalAnalysis(CULTURA_MANOR_SOURCE, {
      baseCode: "4",
      frequency: "trimestral",
    });
    expect(table.periods).toHaveLength(4);
    // The file runs to July: Q1–Q3 have coverage, Q4 does not.
    expect(rowOf(table.rows, "4").values.map((value) => value && Math.round(value))).toEqual([
      100,
      100,
      100,
      null,
    ]);
  });

  it("still draws a table in annual, with a single period column", () => {
    const table = buildVerticalAnalysis(CULTURA_MANOR_SOURCE, {
      baseCode: "4",
      frequency: "anual",
    });
    expect(table.periods).toHaveLength(1);
    expect(rowOf(table.rows, ARRENDAMIENTO).values[0] ?? 0).toBeCloseTo(31.76, 2);
  });
});
