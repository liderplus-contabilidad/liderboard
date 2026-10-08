import type { BackupAdapter } from "@/lib/backup";
import {
  arrayValue,
  booleanValue,
  dictionaryValue,
  enumValue,
  finiteNumber,
  idValue,
  invalid,
  isoDate,
  isoTimestamp,
  nullable,
  objectFields,
  positiveNumber,
  stringValue,
  type Validator,
} from "@/lib/backup/validation";
import { validateBackupLogo } from "./logo";
import type { CutMeta } from "../db";
import type {
  BankAccount,
  CashEntry,
  CashFlowCenter,
  CashFlowClient,
  Check,
  ManualObligation,
  Payable,
  PaymentFlow,
} from "../types";

export interface CashFlowBackupTables {
  clients: CashFlowClient[];
  centers: CashFlowCenter[];
  accounts: BankAccount[];
  payables: Payable[];
  manualObligations: ManualObligation[];
  checks: Check[];
  flows: PaymentFlow[];
  cashEntries: CashEntry[];
  meta: CutMeta[];
  active: { key: "active"; clientId: string | null }[];
}
export const CASH_FLOW_BACKUP_TABLE_NAMES = [
  "clients",
  "centers",
  "accounts",
  "payables",
  "manualObligations",
  "checks",
  "flows",
  "cashEntries",
  "meta",
  "active",
] as const;
export type CashFlowBackupTableName = (typeof CASH_FLOW_BACKUP_TABLE_NAMES)[number];
export interface CashFlowBackupSummary {
  clients: { id: string; name: string }[];
  counts: Record<CashFlowBackupTableName, number>;
}

const owned = { id: idValue, clientId: idValue };
const priority = enumValue("urgent", "pending");
const nullableDate = nullable(isoDate);
const nullableId = nullable(idValue);
const position: Validator = (value, path) => {
  objectFields(value, path, { x: finiteNumber, y: finiteNumber, width: positiveNumber });
};
const layout: Validator = (value, path) => {
  objectFields(
    value,
    path,
    {},
    {
      format: enumValue("standard", "pichincha"),
      width: positiveNumber,
      height: positiveNumber,
      fontSize: positiveNumber,
      city: stringValue,
      offsetX: finiteNumber,
      offsetY: finiteNumber,
      amount: position,
      payee: position,
      words: position,
      place: position,
      filler: position,
    },
  );
};
const payableRequired = {
  ...owned,
  source: enumValue("contifico", "dingoo"),
  supplier: stringValue,
  supplierTaxId: nullable(stringValue),
  docType: stringValue,
  docNumber: stringValue,
  description: stringValue,
  issuedOn: nullableDate,
  dueOn: nullableDate,
  amount: finiteNumber,
  withholdings: finiteNumber,
  payments: finiteNumber,
  balance: finiteNumber,
  centerName: nullable(stringValue),
  priority: nullable(priority),
  cash: booleanValue,
  payOn: nullableDate,
  payFromAccountId: nullableId,
  observation: stringValue,
  approved: nullable(finiteNumber),
  finalReview: booleanValue,
  notified: booleanValue,
  status: enumValue("open", "settled"),
  settledOn: nullableDate,
  cutDate: isoDate,
};
const payment: Validator = (value, path) => {
  objectFields(value, path, {
    payableId: idValue,
    docNumber: stringValue,
    issuedOn: nullableDate,
    balance: finiteNumber,
    amount: finiteNumber,
  });
};
const income: Validator = (value, path) => {
  objectFields(value, path, {
    id: idValue,
    concept: stringValue,
    amount: finiteNumber,
    accountId: nullableId,
  });
};
const loan: Validator = (value, path) => {
  objectFields(value, path, { fromCenterId: idValue, toCenterId: idValue, amount: finiteNumber });
};

const rows: Record<CashFlowBackupTableName, Validator> = {
  clients: (value, path) => {
    objectFields(
      value,
      path,
      { id: idValue, name: stringValue },
      {
        logo: validateBackupLogo,
        letterhead: (item, location) => {
          objectFields(item, location, { name: stringValue, lines: arrayValue(stringValue) });
        },
      },
    );
  },
  centers: (value, path) => {
    objectFields(value, path, { ...owned, name: stringValue });
  },
  accounts: (value, path) => {
    objectFields(
      value,
      path,
      {
        ...owned,
        bank: stringValue,
        number: stringValue,
        overdraft: finiteNumber,
        centerId: nullableId,
      },
      {
        label: stringValue,
        overdraftStartsOn: nullableDate,
        overdraftEndsOn: nullableDate,
        checkLayout: layout,
      },
    );
  },
  payables: (value, path) => {
    objectFields(value, path, payableRequired, { kind: stringValue });
  },
  manualObligations: (value, path) => {
    objectFields(
      value,
      path,
      { ...payableRequired, source: enumValue("manual") },
      { kind: stringValue },
    );
  },
  checks: (value, path) => {
    objectFields(
      value,
      path,
      {
        ...owned,
        voucher: stringValue,
        bank: stringValue,
        accountId: nullableId,
        payee: stringValue,
        number: stringValue,
        amount: finiteNumber,
        issuedOn: nullableDate,
        step: enumValue("made", "signed", "delivered", "cashed"),
        voided: booleanValue,
        cashedOn: nullableDate,
        place: stringValue,
        note: stringValue,
      },
      {
        expectedCashOn: nullableDate,
        flowLinkedOn: nullableDate,
        flowPriority: priority,
        flowApproved: nullable(finiteNumber),
        flowPayOn: nullableDate,
        flowPayFromAccountId: nullableId,
        payeeTaxId: stringValue,
        payeeAddress: stringValue,
        payments: arrayValue(payment),
      },
    );
  },
  flows: (value, path) => {
    objectFields(
      value,
      path,
      {
        ...owned,
        date: isoDate,
        balances: dictionaryValue(finiteNumber),
        incomes: arrayValue(income),
      },
      { notes: dictionaryValue(stringValue) },
    );
  },
  cashEntries: (value, path) => {
    objectFields(value, path, {
      ...owned,
      section: enumValue("initial", "misc"),
      date: isoDate,
      detail: stringValue,
      amounts: dictionaryValue(finiteNumber),
      loan: nullable(loan),
      observation: stringValue,
    });
  },
  meta: (value, path) => {
    objectFields(value, path, {
      key: idValue,
      clientId: idValue,
      source: enumValue("contifico", "dingoo"),
      cutDate: isoDate,
      companyName: nullable(stringValue),
      loadedAt: isoTimestamp,
    });
  },
  active: (value, path) => {
    objectFields(value, path, { key: enumValue("active"), clientId: nullableId });
  },
};

/** Validates in place without repairing, trimming or dropping a stored value. */
export function validateCashFlowBackupTables(value: unknown): CashFlowBackupTables {
  const fields = Object.fromEntries(
    CASH_FLOW_BACKUP_TABLE_NAMES.map((name) => [name, arrayValue(rows[name])]),
  );
  objectFields(value, "tables", fields);
  const tables = value as CashFlowBackupTables;
  for (const name of CASH_FLOW_BACKUP_TABLE_NAMES) {
    const keys = new Set<string>();
    for (const row of tables[name]) {
      const key = "id" in row ? row.id : row.key;
      if (keys.has(key)) invalid(`tables.${name}: clave duplicada ${key}`);
      keys.add(key);
    }
  }
  const clients = new Set(tables.clients.map((client) => client.id));
  const centers = new Map(tables.centers.map((center) => [center.id, center]));
  const accounts = new Map(tables.accounts.map((account) => [account.id, account]));
  // A check payment has one document id, with no table discriminator. The v5 migration moves
  // manuals out of cartera; keeping both copies would hide ownership depending on map order.
  const importedIds = new Set(tables.payables.map((payable) => payable.id));
  for (const obligation of tables.manualObligations) {
    if (importedIds.has(obligation.id))
      invalid("tables.manualObligations: clave compartida con cartera");
  }
  const payables = new Map(
    [...tables.payables, ...tables.manualObligations].map((payable) => [payable.id, payable]),
  );
  const reference = (
    id: string | null | undefined,
    owner: string,
    target: Map<string, { clientId: string }>,
    path: string,
    historical = false,
  ) => {
    if (id == null) return;
    const row = target.get(id);
    if ((!row && !historical) || (row && row.clientId !== owner)) invalid(path);
  };
  for (const name of CASH_FLOW_BACKUP_TABLE_NAMES) {
    if (name === "clients" || name === "active") continue;
    for (const row of tables[name]) {
      if (!clients.has(row.clientId)) invalid(`tables.${name}.clientId`);
    }
  }
  for (const row of tables.active)
    if (row.clientId !== null && !clients.has(row.clientId)) invalid("tables.active.clientId");
  for (const row of tables.meta)
    if (row.key !== `${row.clientId}::${row.source}`) invalid("tables.meta.key");
  for (const row of tables.accounts)
    reference(row.centerId, row.clientId, centers, "tables.accounts.centerId");
  for (const row of [...tables.payables, ...tables.manualObligations])
    reference(row.payFromAccountId, row.clientId, accounts, "tables.payables.payFromAccountId");
  for (const row of tables.checks) {
    reference(row.accountId, row.clientId, accounts, "tables.checks.accountId");
    reference(
      row.flowPayFromAccountId,
      row.clientId,
      accounts,
      "tables.checks.flowPayFromAccountId",
    );
    for (const payment of row.payments ?? [])
      reference(
        payment.payableId,
        row.clientId,
        payables,
        "tables.checks.payments.payableId",
        true,
      );
  }
  const periods = new Set<string>();
  for (const row of tables.flows) {
    const period = JSON.stringify([row.clientId, row.date]);
    if (periods.has(period)) invalid("tables.flows: empresa y fecha duplicadas");
    periods.add(period);
    for (const id of Object.keys(row.balances))
      reference(id, row.clientId, accounts, "tables.flows.balances", true);
    for (const item of row.incomes)
      reference(item.accountId, row.clientId, accounts, "tables.flows.incomes.accountId", true);
  }
  for (const row of tables.cashEntries) {
    for (const id of Object.keys(row.amounts))
      reference(id, row.clientId, centers, "tables.cashEntries.amounts", true);
    if (row.loan) {
      reference(
        row.loan.fromCenterId,
        row.clientId,
        centers,
        "tables.cashEntries.loan.fromCenterId",
        true,
      );
      reference(
        row.loan.toCenterId,
        row.clientId,
        centers,
        "tables.cashEntries.loan.toCenterId",
        true,
      );
    }
  }
  return tables;
}
export const cashFlowBackupAdapter: BackupAdapter<CashFlowBackupTables, CashFlowBackupSummary> = {
  module: "cash-flow",
  dataVersion: 1,
  databaseVersion: 5,
  validateTables: validateCashFlowBackupTables,
  summarize: (tables) => {
    validateCashFlowBackupTables(tables);
    return {
      clients: tables.clients.map(({ id, name }) => ({ id, name })),
      counts: Object.fromEntries(
        CASH_FLOW_BACKUP_TABLE_NAMES.map((name) => [name, tables[name].length]),
      ) as Record<CashFlowBackupTableName, number>,
    };
  },
};
