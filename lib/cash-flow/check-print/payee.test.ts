import { describe, expect, it } from "vitest";
import type { Check } from "../types";
import { knownPayeeDetails } from "./payee";

const check = (patch: Partial<Check>): Check => ({
  id: "x",
  clientId: "c",
  voucher: "1",
  bank: "PICHINCHA",
  accountId: null,
  payee: "PINTO MORENO PAUL ANDRES",
  number: "1",
  amount: 1,
  issuedOn: "2026-01-01",
  step: "made",
  voided: false,
  cashedOn: null,
  place: "",
  note: "",
  ...patch,
});

describe("knownPayeeDetails", () => {
  it("brings the most recent id and address typed on another check to the same beneficiary", () => {
    const checks = [
      check({ id: "a", issuedOn: "2026-01-01", payeeTaxId: "111", payeeAddress: "VIEJA" }),
      check({ id: "b", issuedOn: "2026-03-01", payeeAddress: "Nueva 12" }),
      check({ id: "c", payee: "OTRO", payeeTaxId: "999" }),
    ];
    expect(knownPayeeDetails("Pinto Moreno Paúl Andrés ", checks, [])).toEqual({
      taxId: "111",
      address: "Nueva 12",
    });
  });

  it("never reads the check being edited, and takes the id from the cartera when no check has it", () => {
    const checks = [check({ id: "self", payeeTaxId: "111" })];
    const payables = [{ supplier: "PINTO MORENO PAUL ANDRES", supplierTaxId: "1790000000001" }];
    expect(knownPayeeDetails("PINTO MORENO PAUL ANDRES", checks, payables, "self")).toEqual({
      taxId: "1790000000001",
    });
    expect(knownPayeeDetails("", checks, payables)).toEqual({});
  });
});
