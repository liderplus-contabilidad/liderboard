import { describe, expect, it } from "vitest";
import type { Check } from "../types";
import { buildChecksWorkbook, checkRow, CHECKS_COLUMNS } from "./checks-workbook";

function check(over: Partial<Check>): Check {
  return {
    id: "k",
    clientId: "c",
    voucher: "4419",
    bank: "PRODUBANCO",
    accountId: "a",
    payee: "BARRETO REYES OSCAR POLIVIO",
    number: "2231",
    amount: 149.82,
    issuedOn: "2017-11-28",
    step: "cashed",
    voided: false,
    cashedOn: "2018-03-29",
    place: "ARCHIVO",
    note: "",
    ...over,
  };
}

describe("control de cheques", () => {
  it("has the book's fourteen columns", () => {
    expect(CHECKS_COLUMNS).toHaveLength(14);
    expect(CHECKS_COLUMNS[0]).toBe("N° EGRESO");
    expect(CHECKS_COLUMNS[13]).toBe("CORREO");
  });

  it("marks the X up to the step reached and DEPOSITADO on a cashed check", () => {
    expect(checkRow(check({}))).toEqual([
      "4419",
      "PRODUBANCO",
      "BARRETO REYES OSCAR POLIVIO",
      "2231",
      149.82,
      "28/11/2017",
      "X",
      "X",
      "X",
      "ARCHIVO",
      "X",
      "COBRADO",
      "29/03/2018",
      "",
    ]);
    expect(checkRow(check({ step: "signed", cashedOn: null })).slice(6, 13)).toEqual([
      "X",
      "X",
      "",
      "ARCHIVO",
      "",
      "FIRMADO",
      "",
    ]);
    expect(checkRow(check({ voided: true })).slice(6, 12)).toEqual([
      "",
      "",
      "",
      "ARCHIVO",
      "",
      "ANULADO",
    ]);
  });

  it("builds the sheet with the header frozen", () => {
    const ws = buildChecksWorkbook(
      [check({}), check({ voucher: "100" })],
      "HOTEL AMBATO",
    ).getWorksheet("PAGO A PROVEEDORES")!;
    const frozen = (ws.views[0] as { ySplit?: number }).ySplit ?? 0;
    const header = ws.getRow(frozen).values as unknown[];
    expect(header.slice(1)).toEqual(CHECKS_COLUMNS);
    expect(ws.getRow(frozen + 1).getCell(1).value).toBe("100");
  });
});
