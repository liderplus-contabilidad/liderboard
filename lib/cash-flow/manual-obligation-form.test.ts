import { describe, expect, it } from "vitest";
import { validateManualObligationForm } from "./manual-obligation-form";

const valid = { supplier: "Arriendo", kind: "arriendo", amount: 125, dueOn: "" };

describe("validateManualObligationForm", () => {
  it("assigns an invalid amount only to amount", () => {
    for (const amount of [null, 0, -1, NaN, Infinity]) {
      expect(validateManualObligationForm({ ...valid, amount })).toEqual({
        amount: "Escribe un monto mayor que cero.",
      });
    }
  });

  it("reports all invalid fields together", () => {
    expect(
      validateManualObligationForm({ supplier: " ", kind: " ", amount: null, dueOn: "31/02/2026" }),
    ).toEqual({
      supplier: "Escribe el concepto o el beneficiario.",
      kind: "Escribe el nombre de la clase nueva.",
      amount: "Escribe un monto mayor que cero.",
      dueOn: "Escribe una fecha válida en formato dd/mm/aaaa.",
    });
  });

  it("allows an optional date, a past due date and a custom class", () => {
    expect(validateManualObligationForm(valid)).toEqual({});
    expect(
      validateManualObligationForm({ ...valid, kind: "Servicios básicos", dueOn: "01/01/2025" }),
    ).toEqual({});
  });
});
