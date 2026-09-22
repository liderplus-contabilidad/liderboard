import { describe, expect, it } from "vitest";
import type { BankAccount, ParsedCheck } from "../types";
import { detectBanks } from "./bank-labels";

function check(bank: string, voided = false): ParsedCheck {
  return {
    voucher: "1",
    bank,
    payee: "",
    number: "1",
    amount: 1,
    issuedOn: null,
    step: "made",
    voided,
    cashedOn: null,
    place: "",
  };
}

describe("detectBanks", () => {
  it("merges spelling variants, keeps the most frequent, and suggests only real unknown banks", () => {
    const accounts: BankAccount[] = [
      { id: "a", clientId: "c", bank: "Produbanco", number: "", overdraft: 0, centerId: null },
    ];
    const banks = detectBanks(
      [
        check("PRODUBANCO"),
        check("PRODUBANCO"),
        check("PRODUBANCO "),
        check("PICHINCHA"),
        check("pichincha"),
        check("PICHINCHA "),
        check("PACIFICO"),
        check("CAJA GASTOS"),
        check("CAJA GASTOS"),
        check("CRUCE", true),
        check("RECAUDACION TC"),
        check("CXP HA - HC"),
        check(""),
      ],
      accounts,
    );
    expect(banks).toEqual([
      { bank: "PICHINCHA", count: 3, known: false, suggested: true },
      { bank: "PRODUBANCO", count: 3, known: true, suggested: false },
      { bank: "CAJA GASTOS", count: 2, known: false, suggested: false },
      { bank: "CRUCE", count: 1, known: false, suggested: false },
      { bank: "CXP HA - HC", count: 1, known: false, suggested: false },
      { bank: "PACIFICO", count: 1, known: false, suggested: true },
      { bank: "RECAUDACION TC", count: 1, known: false, suggested: false },
    ]);
  });
});
