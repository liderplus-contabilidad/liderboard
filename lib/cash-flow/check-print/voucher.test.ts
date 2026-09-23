import { describe, expect, it } from "vitest";
import type { BankAccount, Check } from "../types";
import { checkFilename, checkTestFilename, voucherFilename } from "./download";
import type { MeasureText } from "./types";
import { buildVoucherDocument, proposePayment, voucherAmount, voucherNumber } from "./voucher";
import { VOUCHER_PAGE_HEIGHT, VOUCHER_PAGE_WIDTH, layoutVoucher } from "./voucher-layout";

const measure: MeasureText = (text, size) => text.length * size * 0.5;

const ACCOUNT: BankAccount = {
  id: "acc",
  clientId: "c",
  bank: "BANCO PICHINCHA",
  number: "2100350469",
  overdraft: 0,
  centerId: null,
};

/** Dingoo's sample: egreso 562, check 7 for 1,487.31 paying invoice 000000076 whole. */
const CHECK: Check = {
  id: "k",
  clientId: "c",
  voucher: "562",
  bank: "BANCO PICHINCHA",
  accountId: "acc",
  payee: "Melendres Lopez Ronald Alberto",
  number: "7",
  amount: 1487.31,
  issuedOn: "2026-09-18",
  step: "made",
  voided: false,
  cashedOn: null,
  place: "",
  note: "",
  payeeTaxId: "1804586061001",
  payeeAddress: "TUNGURAHUA / SAN PEDRO DE PELILEO / PELILEO / ROCAFUERTE SN Y RICAURTE",
  payments: [
    {
      payableId: "p",
      docNumber: "000000076",
      issuedOn: "2026-09-01",
      balance: 1487.31,
      amount: 1487.31,
    },
  ],
};

const CLIENT = {
  name: "Delicmar",
  letterhead: {
    name: "DELICMAR S.A.S",
    lines: [
      "DELICMAR S.A.S.",
      "TUNGURAHUA / AMBATO / AMBATO / LUIS ANIBAL GRANJA Y CALLE LIBARDO PARRA",
      "0991045439 - 0958780660",
    ],
  },
};

const build = (check: Check = CHECK) =>
  buildVoucherDocument({
    check,
    client: CLIENT,
    account: ACCOUNT,
    date: check.issuedOn ?? "2026-09-22",
    generatedAt: new Date(2026, 8, 22, 21, 32, 36),
  });

describe("buildVoucherDocument", () => {
  it("reproduces Dingoo's comprobante as text", () => {
    const document = build();
    expect(document.title).toBe("COMPROBANTE DE EGRESO No. 000000562");
    expect(document.company).toBe("DELICMAR S.A.S");
    expect(document.companyLines).toEqual([
      "DELICMAR S.A.S.",
      "TUNGURAHUA / AMBATO / AMBATO / LUIS ANIBAL GRANJA Y CALLE LIBARDO PARRA",
      "0991045439 - 0958780660",
    ]);
    expect(document.party.map((field) => field.value)).toEqual([
      "MELENDRES LOPEZ RONALD ALBERTO",
      "1804586061001",
      "TUNGURAHUA / SAN PEDRO DE PELILEO / PELILEO / ROCAFUERTE SN Y RICAURTE",
    ]);
    expect(document.entry).toEqual([
      { code: "2.01.01.01.01", name: "PROVEEDORES", debit: "1,487.31", credit: "" },
      {
        code: "1.01.01.03.02",
        name: "CUENTA BANCARIA BANCO PICHINCHA 2100350469",
        debit: "",
        credit: "1,487.31",
      },
    ]);
    expect(document.documents).toEqual([
      {
        issuedOn: "01/09/2026",
        number: "000000076",
        previous: "1,487.31",
        amount: "1,487.31",
        current: "0.00",
      },
    ]);
    expect(document.payment).toEqual({
      method: "Cheque",
      date: "18/09/2026",
      account: "BANCO PICHINCHA/2100350469",
      number: "7",
      value: "1,487.31",
    });
    expect(document.generated).toBe("Generado el 22/09/2026 21:32:36");
  });

  it("keeps the three party fields for the window, and the standard ledger codes", () => {
    const document = buildVoucherDocument({
      check: { ...CHECK, payeeTaxId: undefined, payeeAddress: "", payments: undefined },
      client: { name: "Nomik" },
      account: ACCOUNT,
      date: "2026-09-18",
      generatedAt: new Date(),
    });
    expect(document.company).toBe("Nomik");
    expect(document.companyLines).toEqual([]);
    expect(document.party.map((field) => field.value)).toEqual([
      "MELENDRES LOPEZ RONALD ALBERTO",
      "",
      "",
    ]);
    expect(document.entry.map((line) => line.code)).toEqual(["2.01.01.01.01", "1.01.01.03.02"]);
    expect(document.documents).toEqual([]);
  });
});

describe("proposePayment", () => {
  it("fills the check in order and never proposes a negative abono", () => {
    const first = proposePayment(
      { id: "a", docNumber: "1", issuedOn: null, balance: 600 },
      1000,
      [],
    );
    const second = proposePayment({ id: "b", docNumber: "2", issuedOn: null, balance: 700 }, 1000, [
      first,
    ]);
    const third = proposePayment({ id: "c", docNumber: "3", issuedOn: null, balance: 50 }, 1000, [
      first,
      second,
    ]);
    expect([first.amount, second.amount, third.amount]).toEqual([600, 400, 0]);
    expect(second.balance).toBe(700);
  });
});

describe("formats", () => {
  it("pads a numeric voucher to nine digits and keeps any other as typed", () => {
    expect(voucherNumber("562")).toBe("000000562");
    expect(voucherNumber("CE-563")).toBe("CE-563");
  });

  it("never prints a negative zero", () => {
    expect(voucherAmount(0.1 + 0.2 - 0.3)).toBe("0.00");
  });

  it("names the files the way the firm's checks were named", () => {
    expect(checkFilename("5751", "ENI ECUADOR S.A.")).toBe("Cheque-5751-ENI-ECUADOR-S-A.pdf");
    expect(voucherFilename("562", "Melendres López")).toBe(
      "Comprobante-Egreso-562-MELENDRES-LOPEZ.pdf",
    );
    expect(checkTestFilename(ACCOUNT)).toBe("Prueba-Cheque-BANCO-PICHINCHA-2100350469.pdf");
  });
});

describe("layoutVoucher", () => {
  it("keeps every text inside the A4 and draws the documents table only with documents", () => {
    const [page] = layoutVoucher(build(), measure);
    expect(page).toBeDefined();
    for (const text of page?.texts ?? []) {
      expect(text.y).toBeLessThanOrEqual(VOUCHER_PAGE_HEIGHT);
      expect(text.x).toBeLessThanOrEqual(VOUCHER_PAGE_WIDTH);
    }
    const labels = page?.texts.map((text) => text.text) ?? [];
    expect(labels).toContain("No. Comprobante");
    expect(labels).toContain("Página 1 de 1");

    const [bare] = layoutVoucher(build({ ...CHECK, payments: [], payeeTaxId: undefined }), measure);
    const bareTexts = bare?.texts.map((text) => text.text) ?? [];
    expect(bareTexts).not.toContain("No. Comprobante");
    // An empty party field prints neither its label nor its value.
    expect(bareTexts).not.toContain("Identificación:");
  });

  it("flows a long list of documents onto another sheet, repeating the header", () => {
    const payments = Array.from({ length: 60 }, (_, index) => ({
      payableId: `p${index}`,
      docNumber: String(index),
      issuedOn: "2026-09-01",
      balance: 10,
      amount: 10,
    }));
    const pages = layoutVoucher(build({ ...CHECK, payments }), measure);
    expect(pages.length).toBeGreaterThan(1);
    for (const page of pages) {
      expect(page.texts.map((text) => text.text)).toContain(
        `Página ${pages.indexOf(page) + 1} de ${pages.length}`,
      );
      for (const text of page.texts) {
        expect(text.y).toBeLessThanOrEqual(VOUCHER_PAGE_HEIGHT);
      }
    }
    expect(pages[1]?.texts.map((text) => text.text)).toContain("No. Comprobante");
  });
});
