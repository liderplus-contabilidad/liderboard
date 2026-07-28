import { describe, expect, it } from "vitest";
import { ANNUAL_AOA, aoaToXlsxBuffer, MONTHLY_AOA, SUCURSAL_AOA } from "../parse.fixtures";
import { buildCandidate } from "./registry";
import { singleStatementStrategy } from "./single-statement";
import type { StagedUpload } from "./types";

function candidate(aoa: Parameters<typeof aoaToXlsxBuffer>[0], fileName = "reporte.xlsx") {
  return buildCandidate(fileName, aoaToXlsxBuffer(aoa));
}

describe("singleStatementStrategy.detect", () => {
  it("matches a monthly (12-column) statement", () => {
    expect(singleStatementStrategy.detect(candidate(MONTHLY_AOA))).toBe(true);
  });

  it("matches an annual (Total-only) statement", () => {
    expect(singleStatementStrategy.detect(candidate(ANNUAL_AOA))).toBe(true);
  });

  it("does NOT match a sucursal statement — that format is retired", () => {
    expect(singleStatementStrategy.detect(candidate(SUCURSAL_AOA))).toBe(false);
  });
});

describe("singleStatementStrategy.parse", () => {
  it("wraps parsePygWorkbook's result unchanged", () => {
    const staged = singleStatementStrategy.parse(candidate(MONTHLY_AOA, "reporte.xlsx"));
    expect(staged.kind).toBe("single-statement");
    const { result } = staged as Extract<StagedUpload, { kind: "single-statement" }>;
    expect(result.dataset.companyName).toBe("HOTELERA ANDES S.A.");
    expect(result.dataset.baseFrequency).toBe("mensual");
    expect(result.dataset.role).toBe("single");
    expect(result.dataset.accounts).toHaveLength(11);
  });
});
