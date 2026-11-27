import { describe, expect, it } from "vitest";
import {
  deriveSalesIdentity,
  describeSalesIdentityClash,
  incomingSalesIdentity,
  sameSalesIdentity,
} from "./identity";
import type { ParsedSalesMonth, SalesCoverage } from "./types";

function coverage(companyCode: string, year = 2026, monthIndex = 0): SalesCoverage {
  return {
    id: `c:${year}-${monthIndex}`,
    clientId: "c",
    year,
    monthIndex,
    lineCount: 1,
    firstDay: 1,
    lastDay: 31,
    companyCode,
  };
}

function parsed(companyCode: string): ParsedSalesMonth {
  return {
    year: 2026,
    monthIndex: 0,
    lineCount: 1,
    firstDay: 1,
    lastDay: 31,
    companyCode,
    lines: [],
  };
}

describe("deriveSalesIdentity", () => {
  it("a client with nothing loaded has NO identity, which is what lets a first upload adopt it", () => {
    expect(deriveSalesIdentity([])).toBeNull();
  });

  it("reads the code off the coverage, never off the lines", () => {
    expect(deriveSalesIdentity([coverage("01")])).toEqual({ companyCode: "01" });
  });

  it("skips coverage rows that declare no code at all", () => {
    expect(deriveSalesIdentity([coverage("  "), coverage("07")])).toEqual({ companyCode: "07" });
  });
});

describe("incomingSalesIdentity", () => {
  it("is the first code the batch declares", () => {
    expect(incomingSalesIdentity([parsed(""), parsed("03")])).toEqual({ companyCode: "03" });
  });
});

describe("sameSalesIdentity", () => {
  it("leading zeros and whitespace do not make two companies", () => {
    expect(sameSalesIdentity({ companyCode: "01" }, { companyCode: " 1 " })).toBe(true);
  });

  it("two different codes are two companies — this is the whole point of the guard", () => {
    expect(sameSalesIdentity({ companyCode: "01" }, { companyCode: "07" })).toBe(false);
  });

  it("a non-numeric code is compared whole, only trimmed and upper-cased", () => {
    expect(sameSalesIdentity({ companyCode: "hc" }, { companyCode: " HC" })).toBe(true);
    expect(sameSalesIdentity({ companyCode: "HA" }, { companyCode: "HC" })).toBe(false);
  });
});

describe("describeSalesIdentityClash", () => {
  it("names BOTH codes and the client, and does not order anyone around", () => {
    const message = describeSalesIdentityClash(
      { companyCode: "01" },
      { companyCode: "07" },
      "Clínica Durán",
    );
    expect(message).toContain("Clínica Durán");
    expect(message).toContain("01");
    expect(message).toContain("07");
    // It is a notice, not a block: continuing has to be one of the two exits it offers.
    expect(message).toContain("continúa");
  });
});
