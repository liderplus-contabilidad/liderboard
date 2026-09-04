import { describe, expect, it } from "vitest";
import { formatAmount, formatCurrency, formatNumber, formatPercent, parseCurrency } from "./format";

describe("formatCurrency", () => {
  it("groups thousands with a comma and separates cents with a dot", () => {
    expect(formatCurrency(57961.95, { cents: true })).toBe("$57,961.95");
    expect(formatCurrency(1234)).toBe("$1,234");
    expect(formatCurrency(-1234, { cents: true })).toBe("-$1,234.00");
  });
});

describe("formatAmount", () => {
  it("always writes two decimals, padded, with no currency symbol", () => {
    expect(formatAmount(47609)).toBe("47,609.00");
    expect(formatAmount(56042.18)).toBe("56,042.18");
    expect(formatAmount(28.9)).toBe("28.90");
    expect(formatAmount(0)).toBe("0.00");
    expect(formatAmount(-20.4)).toBe("-20.40");
  });

  it("never lets a third decimal through", () => {
    expect(formatAmount(21.9354)).toBe("21.94");
  });
});

describe("formatPercent", () => {
  it("separates the decimal with a dot", () => {
    expect(formatPercent(12.4)).toBe("12.4 %");
    expect(formatPercent(1234.5)).toBe("1,234.5 %");
  });
});

describe("parseCurrency", () => {
  it("parses Ecuadorian-formatted amounts (comma = thousands, dot = decimals)", () => {
    expect(parseCurrency("17,338.85")).toBe(17338.85);
    expect(parseCurrency("1,234.56")).toBe(1234.56);
    expect(parseCurrency("1,234")).toBe(1234); // thousands, no decimals
    expect(parseCurrency("80.75")).toBe(80.75);
    expect(parseCurrency("-20.4")).toBe(-20.4);
    expect(parseCurrency("0")).toBe(0);
  });

  it("returns null for blank or unparseable input", () => {
    expect(parseCurrency("")).toBeNull();
    expect(parseCurrency("   ")).toBeNull();
    expect(parseCurrency("abc")).toBeNull();
  });

  it("parses what `formatCurrency` writes, symbol included", () => {
    expect(parseCurrency("$17,338.85")).toBe(17338.85);
    expect(parseCurrency("-$20.40")).toBe(-20.4);
    expect(parseCurrency("$0.00")).toBe(0);
  });

  it("round-trips values rendered by formatCurrency (a currency editor's seed)", () => {
    for (const value of [17338.85, 1234.56, 80.75, -20.4, 0, 1234]) {
      expect(parseCurrency(formatCurrency(value, { cents: true }))).toBeCloseTo(value, 2);
    }
  });

  it("rejects the inverted convention instead of silently inflating the value", () => {
    expect(parseCurrency("17.338,85")).toBeNull();
  });

  it("round-trips values rendered by formatNumber (the editor seed) without inflation", () => {
    for (const value of [17338.85, 1234.56, 80.75, -20.4, 0, 1234, 1005, 1.005]) {
      expect(parseCurrency(formatNumber(value))).toBeCloseTo(value, 3);
    }
  });
});
