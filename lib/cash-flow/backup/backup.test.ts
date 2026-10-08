import { describe, expect, it } from "vitest";
import { cashFlowBackupAdapter, validateCashFlowBackupTables } from "./index";
import { cashFlowBackupFixture } from "./fixtures";

describe("cash-flow backup validation", () => {
  it("accepts complete data without rewriting historical orphan references", () => {
    const tables = cashFlowBackupFixture();
    expect(validateCashFlowBackupTables(tables)).toBe(tables);
    expect(tables.checks[0].payments?.[1].payableId).toBe("deleted-invoice");
    expect(tables.cashEntries[0].loan?.toCenterId).toBe("deleted-center");
  });
  it("derives preview clients and every table count only from validated data", () => {
    expect(cashFlowBackupAdapter.summarize(cashFlowBackupFixture())).toEqual({
      clients: [
        { id: "company-a", name: "Empresa á" },
        { id: "company-b", name: "Empresa B" },
      ],
      counts: {
        clients: 2,
        centers: 2,
        accounts: 2,
        payables: 2,
        manualObligations: 2,
        checks: 2,
        flows: 3,
        cashEntries: 2,
        meta: 2,
        active: 1,
      },
    });
    const tables = cashFlowBackupFixture();
    for (const name of Object.keys(tables) as (keyof typeof tables)[]) tables[name] = [];
    expect(validateCashFlowBackupTables(tables)).toBe(tables);
    expect(cashFlowBackupAdapter.summarize(tables)).toEqual({
      clients: [],
      counts: {
        clients: 0,
        centers: 0,
        accounts: 0,
        payables: 0,
        manualObligations: 0,
        checks: 0,
        flows: 0,
        cashEntries: 0,
        meta: 0,
        active: 0,
      },
    });
  });
  it.each([
    [
      "missing table",
      (t: Record<string, any>) => {
        delete t.checks;
      },
    ],
    [
      "unknown table",
      (t: Record<string, any>) => {
        t.derived = [];
      },
    ],
    [
      "non-array",
      (t: Record<string, any>) => {
        t.accounts = {};
      },
    ],
    [
      "missing field",
      (t: Record<string, any>) => {
        delete t.payables[0].balance;
      },
    ],
    [
      "future field",
      (t: Record<string, any>) => {
        t.checks[0].newField = 10;
      },
    ],
    [
      "wrong type",
      (t: Record<string, any>) => {
        t.payables[0].cash = "true";
      },
    ],
    [
      "optional null",
      (t: Record<string, any>) => {
        t.accounts[0].label = null;
      },
    ],
    [
      "infinite number",
      (t: Record<string, any>) => {
        t.flows[0].balances.old = NaN;
      },
    ],
    [
      "invalid date",
      (t: Record<string, any>) => {
        t.checks[0].expectedCashOn = "2026-02-30";
      },
    ],
    [
      "invalid timestamp",
      (t: Record<string, any>) => {
        t.meta[0].loadedAt = "yesterday";
      },
    ],
    [
      "inconsistent metadata key",
      (t: Record<string, any>) => {
        t.meta[0].key = "company-b::contifico";
      },
    ],
    [
      "invalid enum",
      (t: Record<string, any>) => {
        t.checks[0].step = "new";
      },
    ],
    [
      "manual in cartera",
      (t: Record<string, any>) => {
        t.payables[0].source = "manual";
      },
    ],
    [
      "nonmanual obligation",
      (t: Record<string, any>) => {
        t.manualObligations[0].source = "contifico";
      },
    ],
    [
      "duplicate key",
      (t: Record<string, any>) => {
        t.accounts.push(t.accounts[0]);
      },
    ],
    [
      "duplicate flow date",
      (t: Record<string, any>) => {
        t.flows.push({ ...t.flows[0], id: "new-id" });
      },
    ],
    [
      "missing company",
      (t: Record<string, any>) => {
        t.centers[0].clientId = "absent";
      },
    ],
    [
      "cross-company account center",
      (t: Record<string, any>) => {
        t.accounts[0].centerId = "center-b";
      },
    ],
    [
      "missing operational center",
      (t: Record<string, any>) => {
        t.accounts[0].centerId = "deleted-center";
      },
    ],
    [
      "cross-company payment account",
      (t: Record<string, any>) => {
        t.payables[0].payFromAccountId = "account-b";
      },
    ],
    [
      "missing operational account",
      (t: Record<string, any>) => {
        t.checks[0].accountId = "deleted-account";
      },
    ],
    [
      "cross-company check-flow account",
      (t: Record<string, any>) => {
        t.checks[0].flowPayFromAccountId = "account-b";
      },
    ],
    [
      "cross-company balance history",
      (t: Record<string, any>) => {
        t.flows[0].balances["account-b"] = 0;
      },
    ],
    [
      "cross-company income history",
      (t: Record<string, any>) => {
        t.flows[0].incomes[0].accountId = "account-b";
      },
    ],
    [
      "cross-company cash history",
      (t: Record<string, any>) => {
        t.cashEntries[0].amounts["center-b"] = 0;
      },
    ],
    [
      "cross-company loan history",
      (t: Record<string, any>) => {
        t.cashEntries[0].loan.toCenterId = "center-b";
      },
    ],
    [
      "cross-company payable history",
      (t: Record<string, any>) => {
        t.checks[0].payments[0].payableId = "invoice-b";
      },
    ],
    [
      "unknown active company",
      (t: Record<string, any>) => {
        t.active[0].clientId = "absent";
      },
    ],
    [
      "unsupported active key",
      (t: Record<string, any>) => {
        t.active[0].key = "other";
      },
    ],
    [
      "external logo",
      (t: Record<string, any>) => {
        t.clients[0].logo.dataUrl = "https://example.com/logo.png";
      },
    ],
    [
      "invalid logo base64",
      (t: Record<string, any>) => {
        t.clients[0].logo.dataUrl = "data:image/png;base64,broken!";
      },
    ],
    [
      "fake logo bytes",
      (t: Record<string, any>) => {
        t.clients[0].logo.dataUrl = "data:image/png;base64,aGVsbG8=";
      },
    ],
    [
      "corrupt PNG chunk",
      (t: Record<string, any>) => {
        const logo = t.clients[0].logo;
        const bytes = Uint8Array.from(atob(logo.dataUrl.split(",")[1]), (char) =>
          char.charCodeAt(0),
        );
        bytes[29] ^= 1;
        logo.dataUrl = "data:image/png;base64," + btoa(String.fromCharCode(...bytes));
      },
    ],
    [
      "JPEG without scan",
      (t: Record<string, any>) => {
        t.clients[0].logo = {
          mime: "image/jpeg",
          width: 1,
          height: 1,
          dataUrl:
            "data:image/jpeg;base64," +
            btoa(String.fromCharCode(255, 216, 255, 192, 0, 8, 8, 0, 1, 0, 1, 0, 255, 217)),
        };
      },
    ],
    [
      "mismatched logo mime",
      (t: Record<string, any>) => {
        t.clients[0].logo.mime = "image/jpeg";
      },
    ],
    [
      "invalid logo dimensions",
      (t: Record<string, any>) => {
        t.clients[0].logo.width = 0;
      },
    ],
    [
      "unknown layout field",
      (t: Record<string, any>) => {
        t.accounts[0].checkLayout.color = "red";
      },
    ],
    [
      "invalid position",
      (t: Record<string, any>) => {
        t.accounts[0].checkLayout.amount.x = "12";
      },
    ],
    [
      "missing position dimension",
      (t: Record<string, any>) => {
        delete t.accounts[0].checkLayout.amount.width;
      },
    ],
  ])("rejects %s without modifying the payload", (_name, corrupt) => {
    const tables = cashFlowBackupFixture();
    corrupt(tables);
    const before = structuredClone(tables);
    expect(() => validateCashFlowBackupTables(tables)).toThrow();
    expect(tables).toEqual(before);
  });
  it("allows missing and null active selection and all absent optional fields", () => {
    const tables = cashFlowBackupFixture();
    tables.active = [];
    tables.clients[0].logo = undefined;
    tables.accounts[0].checkLayout = {};
    expect(validateCashFlowBackupTables(tables)).toBe(tables);
    tables.active = [{ key: "active", clientId: null }];
    expect(validateCashFlowBackupTables(tables)).toBe(tables);
  });
  it("rejects colliding document ids before they can hide another company's check payment", () => {
    const tables = cashFlowBackupFixture();
    tables.manualObligations[0].id = "invoice-b";
    tables.checks[0].payments![0].payableId = "invoice-b";
    expect(() => validateCashFlowBackupTables(tables)).toThrow();
  });
});
