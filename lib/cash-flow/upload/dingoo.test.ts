import { describe, expect, it } from "vitest";
import { matchesDingoo, parseDingoo } from "./dingoo";
import { CONTIFICO_GRID, DINGOO_GRID } from "./fixtures";

describe("parseDingoo", () => {
  it("recognises the report by its title lines and header, and not Contífico's", () => {
    expect(matchesDingoo(DINGOO_GRID)).toBe(true);
    expect(matchesDingoo(CONTIFICO_GRID)).toBe(false);
  });

  it("reads one payable per «Factura» with the supplier's name and RUC", () => {
    const cartera = parseDingoo(DINGOO_GRID);
    expect(cartera.source).toBe("dingoo");
    expect(cartera.companyName).toBe("DELICMAR S.A.S");
    expect(cartera.cutDate).toBeNull();
    expect(cartera.payables.map((p) => p.docNumber)).toEqual([
      "001-019-000000363",
      "007-003-000016722",
      "007-003-000016800",
      "001-001-013082026",
    ]);
    expect(cartera.payables[3]).toMatchObject({
      docType: "DNA",
      balance: 102.91,
      dueOn: "2026-08-13",
    });
    expect(cartera.payables[0]).toEqual({
      supplier: "COOPERATIVA DE TRANSPORTE EN CAMIONETAS SAN ISIDRO",
      supplierTaxId: "1890114284001",
      docType: "FAC",
      docNumber: "001-019-000000363",
      description: "Factura 001-019-000000363",
      issuedOn: "2026-05-18",
      dueOn: "2026-05-18",
      amount: 100,
      withholdings: 0,
      payments: 0,
      balance: 100,
      centerName: null,
    });
  });

  it("reads local-format figures and takes the earliest unpaid instalment as the due date", () => {
    const [, second, third] = parseDingoo(DINGOO_GRID).payables;
    expect(second.amount).toBe(1113.85);
    expect(second.balance).toBe(1113.85);
    expect(second.dueOn).toBe("2026-09-20");
    // No instalment row: the invoice date.
    expect(third.dueOn).toBe("2026-09-01");
    expect(third.supplierTaxId).toBe("1791731964001");
  });
});
