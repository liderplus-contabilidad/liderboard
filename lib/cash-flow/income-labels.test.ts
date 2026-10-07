import { describe, expect, it } from "vitest";
import type { PaymentFlow } from "./types";
import { incomeLabels } from "./income-labels";

const flow = (date: string, concepts: string[]): PaymentFlow => ({
  id: date,
  clientId: "company",
  date,
  balances: {},
  incomes: concepts.map((concept, index) => ({
    id: `${date}-${index}`,
    concept,
    amount: 0,
    accountId: null,
  })),
});

describe("incomeLabels", () => {
  it("offers labels from every supplied cut, including zero-amount captures", () => {
    expect(
      incomeLabels([flow("2026-01-01", ["Reservas"]), flow("2026-10-06", ["Anticipos"])]),
    ).toEqual(["Anticipos", "Reservas"]);
  });

  it("ignores blank labels and folds case and accents while keeping the original spelling", () => {
    expect(
      incomeLabels([
        flow("2026-01-01", ["  Café  ", "", "  ", "Reservas"]),
        flow("2026-10-06", ["CAFE", "reservas"]),
      ]),
    ).toEqual(["Café", "Reservas"]);
  });

  it("returns no suggestions for an empty company's flow history", () => {
    expect(incomeLabels([])).toEqual([]);
  });
});
