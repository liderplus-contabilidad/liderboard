import { describe, expect, it } from "vitest";
import { centerLabel, matchesContifico, parseContifico } from "./contifico";
import { CONTIFICO_GRID, DINGOO_GRID, FORMATO_IDEAL_VENCIDA_GRID } from "./fixtures";

describe("parseContifico", () => {
  it("recognises the export and not Dingoo's", () => {
    expect(matchesContifico(CONTIFICO_GRID)).toBe(true);
    expect(matchesContifico(DINGOO_GRID)).toBe(false);
  });

  it("reads the company, the cut and one payable per document row", () => {
    const cartera = parseContifico(CONTIFICO_GRID);
    expect(cartera.source).toBe("contifico");
    expect(cartera.companyName).toBe("NOMIK HOTELS S.A.S.");
    expect(cartera.cutDate).toBe("2026-09-15");
    expect(cartera.skipped).toBe(2);
    expect(cartera.payables).toHaveLength(4);
    expect(cartera.payables[0]).toEqual({
      supplier: "INMOBILIARIA KITLASZ CIA. LTDA.",
      supplierTaxId: null,
      docType: "FAC",
      docNumber: "001-002-000000020",
      description: "INMOBILIARIA KITLASZ CIA. LTDA. FAC 001-002-000000020 ARRIENDO DE MES DE MAYO",
      issuedOn: "2026-05-05",
      dueOn: "2026-05-05",
      amount: 9200,
      withholdings: 0,
      payments: 8300,
      balance: 900,
      centerName: "CULTURA MANOR",
    });
  });

  it("splits the center cell by commas and keeps the distinct labels", () => {
    expect(centerLabel("CULTURA MANOR,CULTURA MANOR")).toBe("CULTURA MANOR");
    expect(centerLabel(Array(40).fill("CENTRO DE COSTO PRINCIPAL").join(","))).toBe(
      "CENTRO DE COSTO PRINCIPAL",
    );
    expect(centerLabel(" HA , ha, HC ")).toBe("HA, HC");
    expect(centerLabel(" , ")).toBeNull();
  });

  it("keeps the supplier's label over the razón social, and an empty center as null", () => {
    const cartera = parseContifico(CONTIFICO_GRID);
    expect(cartera.payables[2].supplier).toBe("RENUEVE MANAGEMEN");
    expect(cartera.payables[3].centerName).toBeNull();
    expect(cartera.payables[3].payments).toBe(0.01);
  });

  it("reads the FORMATO IDEAL's paste with Provincia/Cantón the same way, without a cut", () => {
    expect(matchesContifico(FORMATO_IDEAL_VENCIDA_GRID)).toBe(true);
    const cartera = parseContifico(FORMATO_IDEAL_VENCIDA_GRID);
    expect(cartera.cutDate).toBeNull();
    expect(cartera.payables).toHaveLength(1);
    expect(cartera.payables[0]).toMatchObject({
      docNumber: "001-002-017955074",
      balance: 4668.09,
      amount: 5835.11,
      payments: 1167.02,
      centerName: null,
    });
  });
});
