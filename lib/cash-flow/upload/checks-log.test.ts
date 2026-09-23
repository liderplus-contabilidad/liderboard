import { describe, expect, it } from "vitest";
import { matchesChecksLog, parseChecksLog } from "./checks-log";
import { CHECKS_GRID, CONTIFICO_GRID } from "./fixtures";

describe("parseChecksLog", () => {
  it("recognises the register's header", () => {
    expect(matchesChecksLog(CHECKS_GRID)).toBe(true);
    expect(matchesChecksLog(CONTIFICO_GRID)).toBe(false);
  });

  it("reads the rows and skips the pre-numbered empty vouchers", () => {
    const log = parseChecksLog(CHECKS_GRID);
    expect(log.skipped).toBe(3);
    expect(log.checks).toHaveLength(7);
    expect(log.checks[0]).toEqual({
      voucher: "4419",
      bank: "PRODUBANCO",
      payee: "BARRETO REYES OSCAR POLIVIO",
      number: "2231",
      amount: 149.82,
      issuedOn: "2017-11-28",
      step: "cashed",
      voided: false,
      cashedOn: "2018-03-29",
      place: "ARCHIVO",
    });
  });

  it("maps the book's states and X marks to a step and a voided flag", () => {
    const byVoucher = new Map(parseChecksLog(CHECKS_GRID).checks.map((c) => [c.voucher, c]));
    expect(byVoucher.get("4759")).toMatchObject({ voided: true, bank: "CRUCE", amount: 12.5 });
    expect(byVoucher.has("4760")).toBe(false);
    expect(byVoucher.get("4950")).toMatchObject({
      step: "delivered",
      voided: false,
      cashedOn: null,
    });
    expect(byVoucher.get("15560")).toMatchObject({ step: "cashed", cashedOn: "2024-07-19" });
    expect(byVoucher.get("15561")).toMatchObject({ step: "made", bank: "CAJA" });
    expect(byVoucher.get("15562")).toMatchObject({ step: "signed", voided: true });
    // Cashed with no FECHA DE COBRO: the issue date stands in.
    expect(byVoucher.get("15563")).toMatchObject({ step: "cashed", cashedOn: "2024-07-18" });
  });
});

it("uses the collection date as planned while a check remains pending", () => {
  const header = [
    "N° EGRESO",
    "BANCO",
    "NOMBRE",
    "CHEQUE",
    "VALOR",
    "FECHA DE EMISION",
    "ESTADO",
    "FECHA DE COBRO",
  ];
  const pending = ["1", "Banco", "Proveedor", "100", 500, "20/09/2026", "ENTREGADO", "30/09/2026"];
  expect(parseChecksLog([header, pending]).checks[0]).toMatchObject({
    cashedOn: null,
    expectedCashOn: "2026-09-30",
  });
  expect(
    parseChecksLog([header, [...pending.slice(0, 6), "COBRADO", "30/09/2026"]]).checks[0],
  ).toMatchObject({ cashedOn: "2026-09-30", step: "cashed" });
});
