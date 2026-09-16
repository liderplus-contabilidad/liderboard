/**
 * IndexedDB persistence via Dexie, and the ONLY door to it — the rule every other module's `db.ts`
 * follows: with several empresas sharing these tables, an unbounded query mixes two companies'
 * cartera in silence, and nothing above can tell. Every read and write below takes a `clientId`.
 *
 * A SEPARATE database (`liderboard-cash-flow`) from PyG's, Ocupaciones' and Rol de Pagos': an
 * empresa of this module is not a row of any of theirs, even when the contador calls it by the same
 * name (design D1 — its centers and bank accounts are data no other module holds).
 *
 * What the parsers produce has no owner; this file STAMPS it at the door (`applyCut`,
 * `importChecks`), and it is here — not in a component — that a check's bank label is resolved to
 * one of the empresa's accounts and a document's identity is composed.
 */
import Dexie, { type Table } from "dexie";
import { normalizeLabel, sortByName, type EntityLogo } from "@/lib/workspaces";
import { mergeCut, type IncomingPayable } from "./cut";
import { todayISO } from "./dates";
import { accountRef } from "./export/cartera-workbook";
import { checkId, payableId } from "./identity";
import type { StoredPayableRow } from "./upload/liderplus";
import type {
  BankAccount,
  CashEntry,
  CashFlowCenter,
  CashFlowClient,
  Check,
  ParsedCartera,
  ParsedCheck,
  Payable,
  PayableKind,
  PaymentFlow,
} from "./types";

interface ActiveClientRow {
  key: "active";
  clientId: string | null;
}

/** The cut in force per empresa and source — what the CxP tiles print as «cartera al dd/mm». */
export interface CutMeta {
  /** `${clientId}::${source}` */
  key: string;
  clientId: string;
  source: "contifico" | "dingoo";
  cutDate: string;
  companyName: string | null;
  loadedAt: string;
}

const ACTIVE_KEY = "active";

const CASH_FLOW_STORES = {
  clients: "id",
  centers: "id, clientId",
  accounts: "id, clientId",
  // `[clientId+status]` is what lets the open cartera be read without touching the archive.
  payables: "id, clientId, [clientId+status], [clientId+source]",
  checks: "id, clientId, [clientId+accountId]",
  // UNIQUE: one flow per empresa and date — the record OF the cut date.
  flows: "id, clientId, &[clientId+date]",
  meta: "key, clientId",
  active: "key",
} as const;

/** v4 adds the hand-written rows of «Cargas cash» (`[clientId+section]` is how a matrix is read)
 *  and backfills the `cash` label on every stored document. */
const CASH_FLOW_STORES_V4 = {
  ...CASH_FLOW_STORES,
  cashEntries: "id, clientId, [clientId+section]",
} as const;

class CashFlowDb extends Dexie {
  clients!: Table<CashFlowClient, string>;
  centers!: Table<CashFlowCenter, string>;
  accounts!: Table<BankAccount, string>;
  payables!: Table<Payable, string>;
  checks!: Table<Check, string>;
  flows!: Table<PaymentFlow, string>;
  cashEntries!: Table<CashEntry, string>;
  meta!: Table<CutMeta, string>;
  active!: Table<ActiveClientRow, string>;

  constructor() {
    super("liderboard-cash-flow");
    // v1 was an UNRELEASED prototype whose code was lost before this module was written: its rows
    // do not have this shape (a check without `voucher`, a `flows` table with another key) and
    // nothing in them is worth migrating. v2 drops every table it may have left in a browser and v3
    // creates the real schema — Dexie cannot change a primary key in place, so the drop is its own
    // version. A fresh install goes straight through the three in one transaction.
    this.version(1).stores(CASH_FLOW_STORES);
    this.version(2).stores(
      Object.fromEntries(Object.keys(CASH_FLOW_STORES).map((table) => [table, null])),
    );
    this.version(3).stores(CASH_FLOW_STORES);
    this.version(4)
      .stores(CASH_FLOW_STORES_V4)
      .upgrade((tx) =>
        tx
          .table("payables")
          .toCollection()
          .modify((row: Partial<Payable>) => {
            row.cash ??= false;
          }),
      );
  }
}

export const db = new CashFlowDb();

// ---------------------------------------------------------------------------
// Empresas
// ---------------------------------------------------------------------------

export async function listClients(): Promise<CashFlowClient[]> {
  return sortByName(await db.clients.toArray());
}

/** Creates an EMPTY empresa and opens it. Validation and duplicate checking are `useEntityNaming`'s. */
export async function createClient(name: string, logo?: EntityLogo): Promise<CashFlowClient> {
  const client: CashFlowClient = { id: crypto.randomUUID(), name, ...(logo ? { logo } : {}) };
  await db.transaction("rw", db.clients, db.active, async () => {
    await db.clients.add(client);
    await db.active.put({ key: ACTIVE_KEY, clientId: client.id });
  });
  return client;
}

/** Changes the LABEL — name and logo — and nothing else. */
export async function updateClient(
  clientId: string,
  name: string,
  logo: EntityLogo | null,
): Promise<void> {
  await db.clients.update(clientId, { name, logo: logo ?? undefined });
}

/**
 * Deletes an empresa and EVERYTHING that hangs off it — centers, accounts, cartera, checks, flows,
 * cash entries and cut metadata — in ONE transaction. No other empresa is touched. Deleting the open one hands
 * the module to the first remaining BY NAME.
 */
export async function deleteClient(clientId: string): Promise<void> {
  await db.transaction(
    "rw",
    [
      db.clients,
      db.centers,
      db.accounts,
      db.payables,
      db.checks,
      db.flows,
      db.cashEntries,
      db.meta,
      db.active,
    ],
    async () => {
      await Promise.all([
        db.centers.where("clientId").equals(clientId).delete(),
        db.accounts.where("clientId").equals(clientId).delete(),
        db.payables.where("clientId").equals(clientId).delete(),
        db.checks.where("clientId").equals(clientId).delete(),
        db.flows.where("clientId").equals(clientId).delete(),
        db.cashEntries.where("clientId").equals(clientId).delete(),
        db.meta.where("clientId").equals(clientId).delete(),
      ]);
      await db.clients.delete(clientId);
      const active = await db.active.get(ACTIVE_KEY);
      if (active?.clientId !== clientId) {
        return;
      }
      const remaining = sortByName(await db.clients.toArray());
      await db.active.put({ key: ACTIVE_KEY, clientId: remaining[0]?.id ?? null });
    },
  );
}

export async function setActiveClient(clientId: string | null): Promise<void> {
  await db.active.put({ key: ACTIVE_KEY, clientId });
}

export async function getActiveClientId(): Promise<string | null> {
  return (await db.active.get(ACTIVE_KEY))?.clientId ?? null;
}

/** One empresa as the selector shows it: its label and what it holds. */
export interface CashFlowClientSummary extends CashFlowClient {
  accountCount: number;
  openPayableCount: number;
  checkCount: number;
}

/** Every empresa with its counts — ONE pass behind the selector's sublines. */
export async function listClientSummaries(): Promise<CashFlowClientSummary[]> {
  const [clients, accounts, openPayables, checks] = await Promise.all([
    db.clients.toArray(),
    db.accounts.toArray(),
    db.payables.filter((row) => row.status === "open").toArray(),
    db.checks.toArray(),
  ]);
  const count = <T extends { clientId: string }>(rows: T[]) => {
    const map = new Map<string, number>();
    for (const row of rows) {
      map.set(row.clientId, (map.get(row.clientId) ?? 0) + 1);
    }
    return map;
  };
  const byAccount = count(accounts);
  const byPayable = count(openPayables);
  const byCheck = count(checks);
  return sortByName(
    clients.map((client) => ({
      ...client,
      accountCount: byAccount.get(client.id) ?? 0,
      openPayableCount: byPayable.get(client.id) ?? 0,
      checkCount: byCheck.get(client.id) ?? 0,
    })),
  );
}

/** What deleting an empresa discards, in the terms the confirmation counts in. */
export interface CashFlowClientContents {
  accountCount: number;
  payableCount: number;
  checkCount: number;
  flowCount: number;
}

export async function describeClientContents(clientId: string): Promise<CashFlowClientContents> {
  const [accountCount, payableCount, checkCount, flowCount] = await Promise.all([
    db.accounts.where("clientId").equals(clientId).count(),
    db.payables.where("clientId").equals(clientId).count(),
    db.checks.where("clientId").equals(clientId).count(),
    db.flows.where("clientId").equals(clientId).count(),
  ]);
  return { accountCount, payableCount, checkCount, flowCount };
}

// ---------------------------------------------------------------------------
// Centros y cuentas
// ---------------------------------------------------------------------------

export async function listCenters(clientId: string): Promise<CashFlowCenter[]> {
  return sortByName(await db.centers.where("clientId").equals(clientId).toArray());
}

export async function addCenter(clientId: string, name: string): Promise<CashFlowCenter> {
  const center: CashFlowCenter = { id: crypto.randomUUID(), clientId, name: name.trim() };
  await db.centers.add(center);
  return center;
}

export async function renameCenter(centerId: string, name: string): Promise<void> {
  await db.centers.update(centerId, { name: name.trim() });
}

/**
 * Creates a center for each label the empresa does not have yet — what the cartera's upload
 * proposes from the file's own «Centro de costos» column — in ONE transaction. A label a center
 * already answers to (`normalizeLabel`) creates nothing. Documents need no update: they keep their
 * label and `resolveCenterId` matches it from now on.
 */
export async function createCentersForLabels(
  clientId: string,
  labels: readonly string[],
): Promise<CashFlowCenter[]> {
  return db.transaction("rw", db.centers, async () => {
    const existing = await db.centers.where("clientId").equals(clientId).toArray();
    const known = new Set(existing.map((center) => normalizeLabel(center.name)));
    const created: CashFlowCenter[] = [];
    for (const label of labels) {
      const name = label.trim();
      const key = normalizeLabel(name);
      if (!key || known.has(key)) {
        continue;
      }
      const center: CashFlowCenter = { id: crypto.randomUUID(), clientId, name };
      await db.centers.add(center);
      known.add(key);
      created.push(center);
    }
    return created;
  });
}

/** Deletes a center; its accounts fall back to «de la empresa». Documents keep their label. */
export async function deleteCenter(centerId: string): Promise<void> {
  await db.transaction("rw", db.centers, db.accounts, async () => {
    await db.accounts.filter((account) => account.centerId === centerId).modify({ centerId: null });
    await db.centers.delete(centerId);
  });
}

export async function listAccounts(clientId: string): Promise<BankAccount[]> {
  const accounts = await db.accounts.where("clientId").equals(clientId).toArray();
  return accounts.sort((a, b) => a.bank.localeCompare(b.bank) || a.number.localeCompare(b.number));
}

export type BankAccountInput = Pick<BankAccount, "bank" | "number" | "overdraft" | "centerId"> & {
  label?: string;
};

export async function addAccount(clientId: string, input: BankAccountInput): Promise<BankAccount> {
  const label = input.label?.trim();
  const account: BankAccount = {
    id: crypto.randomUUID(),
    clientId,
    bank: input.bank.trim(),
    number: input.number.trim(),
    ...(label ? { label } : {}),
    overdraft: input.overdraft,
    centerId: input.centerId,
  };
  await db.accounts.add(account);
  return account;
}

export async function updateAccount(
  accountId: string,
  patch: Partial<BankAccountInput>,
): Promise<void> {
  await db.accounts.update(accountId, {
    ...patch,
    ...(patch.bank !== undefined ? { bank: patch.bank.trim() } : {}),
    ...(patch.number !== undefined ? { number: patch.number.trim() } : {}),
    // An emptied label is removed, so the account goes back to bank + number.
    ...(patch.label !== undefined ? { label: patch.label.trim() || undefined } : {}),
  });
}

/** Deletes an account; its checks and marked documents fall back to «sin cuenta», never deleted. */
export async function deleteAccount(accountId: string): Promise<void> {
  await db.transaction("rw", db.accounts, db.checks, db.payables, db.flows, async () => {
    await db.checks.filter((check) => check.accountId === accountId).modify({ accountId: null });
    await db.payables
      .filter((payable) => payable.payFromAccountId === accountId)
      .modify({ payFromAccountId: null });
    await db.accounts.delete(accountId);
  });
}

// ---------------------------------------------------------------------------
// Cartera
// ---------------------------------------------------------------------------

/** The whole cartera of ONE empresa, open and settled. Readers narrow it on read. */
export async function listPayables(clientId: string): Promise<Payable[]> {
  return db.payables.where("clientId").equals(clientId).toArray();
}

export interface CutSummary {
  written: number;
  settled: number;
}

/**
 * Applies a cut — see `cut.ts` for what that means — in ONE transaction, and records it in `meta`.
 * The identity of each incoming document is composed HERE, at the door.
 */
export async function applyCut(
  clientId: string,
  cartera: ParsedCartera,
  cutDate: string,
): Promise<CutSummary> {
  const incoming: IncomingPayable[] = cartera.payables.map((doc) => ({
    ...doc,
    id: payableId(clientId, cartera.source, doc.supplier, doc.docType, doc.docNumber),
  }));
  return db.transaction("rw", db.payables, db.meta, async () => {
    const existing = await db.payables
      .where("[clientId+source]")
      .equals([clientId, cartera.source])
      .toArray();
    const writes = mergeCut(existing, incoming, clientId, cartera.source, cutDate);
    await db.payables.bulkPut(writes);
    await db.meta.put({
      key: `${clientId}::${cartera.source}`,
      clientId,
      source: cartera.source,
      cutDate,
      companyName: cartera.companyName,
      loadedAt: new Date().toISOString(),
    });
    const written = incoming.length;
    return { written, settled: writes.length - written };
  });
}

/**
 * REPLACES the empresa's cartera with the rows of a «cartera para recargar» — every source, open
 * and settled, marks included — in ONE transaction. Not a cut: a cut merges what a SYSTEM exported
 * and settles the absent; this puts back what THIS module exported, as it was. The account each
 * row names is resolved by label against the empresa's accounts; one it does not have reads as
 * «sin cuenta». The cuts in force are left as they were.
 */
export async function replaceCartera(
  clientId: string,
  rows: readonly StoredPayableRow[],
): Promise<number> {
  return db.transaction("rw", db.payables, db.accounts, async () => {
    const accounts = await db.accounts.where("clientId").equals(clientId).toArray();
    const byRef = new Map(
      accounts.map((account) => [normalizeLabel(accountRef(account)), account.id]),
    );
    const today = todayISO();
    const payables: Payable[] = rows.map((row) => ({
      id:
        row.source === "manual"
          ? crypto.randomUUID()
          : payableId(clientId, row.source, row.supplier, row.docType, row.docNumber),
      clientId,
      source: row.source,
      supplier: row.supplier,
      supplierTaxId: row.supplierTaxId,
      docType: row.docType,
      docNumber: row.docNumber,
      description: row.description,
      issuedOn: row.issuedOn,
      dueOn: row.dueOn,
      amount: row.amount,
      withholdings: row.withholdings,
      payments: row.payments,
      balance: row.balance,
      centerName: row.centerName,
      ...(row.kind ? { kind: row.kind } : {}),
      priority: row.priority,
      cash: row.cash,
      payOn: row.payOn,
      payFromAccountId: row.payFromAccount
        ? (byRef.get(normalizeLabel(row.payFromAccount)) ?? null)
        : null,
      observation: row.observation,
      approved: row.approved,
      finalReview: row.finalReview,
      notified: row.notified,
      status: row.status,
      settledOn: row.settledOn,
      cutDate: row.cutDate || today,
    }));
    await db.payables.where("clientId").equals(clientId).delete();
    await db.payables.bulkPut(payables);
    return payables.length;
  });
}

export async function listCuts(clientId: string): Promise<CutMeta[]> {
  return db.meta.where("clientId").equals(clientId).toArray();
}

export interface ManualPayableInput {
  supplier: string;
  kind: PayableKind;
  amount: number;
  dueOn: string | null;
  centerName: string | null;
  description: string;
}

export async function addManualPayable(
  clientId: string,
  input: ManualPayableInput,
): Promise<Payable> {
  const today = todayISO();
  const payable: Payable = {
    id: crypto.randomUUID(),
    clientId,
    source: "manual",
    supplier: input.supplier.trim(),
    supplierTaxId: null,
    docType: "—",
    docNumber: "",
    description: input.description.trim(),
    issuedOn: today,
    dueOn: input.dueOn,
    amount: input.amount,
    withholdings: 0,
    payments: 0,
    balance: input.amount,
    centerName: input.centerName,
    kind: input.kind,
    priority: null,
    cash: false,
    payOn: null,
    payFromAccountId: null,
    observation: "",
    approved: null,
    finalReview: false,
    notified: false,
    status: "open",
    settledOn: null,
    cutDate: today,
  };
  await db.payables.add(payable);
  return payable;
}

/** What the screen may rewrite of a document: the marks and the four working columns. */
export type PayablePatch = Partial<
  Pick<
    Payable,
    | "priority"
    | "cash"
    | "payOn"
    | "payFromAccountId"
    | "observation"
    | "approved"
    | "finalReview"
    | "notified"
  >
>;

export async function updatePayable(payableId: string, patch: PayablePatch): Promise<void> {
  await db.payables.update(payableId, patch);
}

/** The same patch over several rows — the bulk bar of Cuentas por pagar. */
export async function updatePayables(ids: readonly string[], patch: PayablePatch): Promise<void> {
  await db.transaction("rw", db.payables, async () => {
    for (const id of ids) {
      await db.payables.update(id, patch);
    }
  });
}

/** «Marcar pagado» / liquidar: archived at `date`, never deleted. The mark is cleared with it. */
export async function settlePayables(ids: readonly string[], date: string): Promise<void> {
  await db.transaction("rw", db.payables, async () => {
    for (const id of ids) {
      await db.payables.update(id, { status: "settled", settledOn: date, priority: null });
    }
  });
}

/** Reopens a settled row — the undo of a mistaken «pagado». */
export async function reopenPayable(payableId: string): Promise<void> {
  await db.payables.update(payableId, { status: "open", settledOn: null });
}

/** Only a MANUAL obligation can be deleted: an imported document is the file's, and the cut owns it. */
export async function deleteManualPayable(payableId: string): Promise<void> {
  const row = await db.payables.get(payableId);
  if (row?.source === "manual") {
    await db.payables.delete(payableId);
  }
}

// ---------------------------------------------------------------------------
// Cheques
// ---------------------------------------------------------------------------

export async function listChecks(clientId: string): Promise<Check[]> {
  return db.checks.where("clientId").equals(clientId).toArray();
}

/** The account whose bank label matches `bank` (`normalizeLabel` both sides), or `null`. With two
 *  accounts of the same bank the first by number wins — the book names the bank, not the account. */
export function resolveAccountByBank(
  bank: string,
  accounts: readonly BankAccount[],
): BankAccount | null {
  const wanted = normalizeLabel(bank);
  if (!wanted) {
    return null;
  }
  return accounts.find((account) => normalizeLabel(account.bank) === wanted) ?? null;
}

export interface ChecksImportSummary {
  written: number;
  unassigned: number;
}

/** Upserts the register's book by voucher, resolving each bank label at the door. */
export async function importChecks(
  clientId: string,
  parsed: readonly ParsedCheck[],
): Promise<ChecksImportSummary> {
  const accounts = await listAccounts(clientId);
  let unassigned = 0;
  const rows: Check[] = parsed.map((check) => {
    const account = resolveAccountByBank(check.bank, accounts);
    if (!account && !check.voided) {
      unassigned += 1;
    }
    return {
      id: checkId(clientId, check.voucher),
      clientId,
      voucher: check.voucher,
      bank: check.bank,
      accountId: account?.id ?? null,
      payee: check.payee,
      number: check.number,
      amount: check.amount,
      issuedOn: check.issuedOn,
      step: check.step,
      voided: check.voided,
      cashedOn: check.cashedOn,
      place: check.place,
      note: "",
    };
  });
  await db.transaction("rw", db.checks, async () => {
    // A reload keeps the note typed on screen: it is the one field the book does not carry.
    const previous = new Map(
      (await db.checks.where("clientId").equals(clientId).toArray()).map((row) => [row.id, row]),
    );
    await db.checks.bulkPut(
      rows.map((row) => ({ ...row, note: previous.get(row.id)?.note ?? "" })),
    );
  });
  return { written: rows.length, unassigned };
}

export type CheckInput = Omit<Check, "id" | "clientId">;

export async function addCheck(clientId: string, input: CheckInput): Promise<Check> {
  const check: Check = { ...input, id: checkId(clientId, input.voucher), clientId };
  await db.checks.add(check);
  return check;
}

export async function updateCheck(id: string, patch: Partial<CheckInput>): Promise<void> {
  await db.checks.update(id, patch);
}

export async function deleteCheck(id: string): Promise<void> {
  await db.checks.delete(id);
}

/**
 * Creates an account for each bank label the empresa does not have yet — number empty, overdraft
 * zero, of the empresa — and hands every unassigned check of that label to it, in ONE transaction.
 * It is what the register's upload proposes from the book's own BANCO column, and what «Sin cuenta»
 * does with one click. A label an account already answers to creates nothing and only assigns.
 */
export async function createAccountsForBanks(
  clientId: string,
  banks: readonly string[],
): Promise<BankAccount[]> {
  return db.transaction("rw", db.accounts, db.checks, async () => {
    const existing = await db.accounts.where("clientId").equals(clientId).toArray();
    const created: BankAccount[] = [];
    for (const bank of banks) {
      const label = bank.trim();
      let account = resolveAccountByBank(label, [...existing, ...created]);
      if (!account) {
        account = {
          id: crypto.randomUUID(),
          clientId,
          bank: label,
          number: "",
          overdraft: 0,
          centerId: null,
        };
        await db.accounts.add(account);
        created.push(account);
      }
      const wanted = normalizeLabel(label);
      await db.checks
        .where("clientId")
        .equals(clientId)
        .filter((check) => check.accountId === null && normalizeLabel(check.bank) === wanted)
        .modify({ accountId: account.id });
    }
    return created;
  });
}

/** Stamps `accountId` on EVERY check of the empresa whose bank label is `bank` — «Sin cuenta»'s
 *  bulk assignment. */
export async function assignBankToAccount(
  clientId: string,
  bank: string,
  accountId: string,
): Promise<number> {
  const wanted = normalizeLabel(bank);
  return db.checks
    .where("clientId")
    .equals(clientId)
    .filter((check) => check.accountId === null && normalizeLabel(check.bank) === wanted)
    .modify({ accountId });
}

// ---------------------------------------------------------------------------
// Flujos
// ---------------------------------------------------------------------------

export async function listFlows(clientId: string): Promise<PaymentFlow[]> {
  const flows = await db.flows.where("clientId").equals(clientId).toArray();
  return flows.sort((a, b) => b.date.localeCompare(a.date));
}

export async function getFlow(clientId: string, date: string): Promise<PaymentFlow | undefined> {
  return db.flows.where("[clientId+date]").equals([clientId, date]).first();
}

/**
 * Writes the flow OF a date: creates it on the first edit, updates it afterwards. `patch` may bring
 * balances (merged by account) and/or the whole income list.
 */
export async function saveFlow(
  clientId: string,
  date: string,
  patch: { balances?: Record<string, number>; incomes?: PaymentFlow["incomes"] },
): Promise<PaymentFlow> {
  return db.transaction("rw", db.flows, async () => {
    const existing = await getFlow(clientId, date);
    const next: PaymentFlow = existing
      ? {
          ...existing,
          balances: { ...existing.balances, ...(patch.balances ?? {}) },
          incomes: patch.incomes ?? existing.incomes,
        }
      : {
          id: crypto.randomUUID(),
          clientId,
          date,
          balances: patch.balances ?? {},
          incomes: patch.incomes ?? [],
        };
    await db.flows.put(next);
    return next;
  });
}

export async function deleteFlow(clientId: string, date: string): Promise<void> {
  const existing = await getFlow(clientId, date);
  if (existing) {
    await db.flows.delete(existing.id);
  }
}

// ---------------------------------------------------------------------------
// Cargas cash — the hand-written rows; PROVEEDORES is derived from the cartera (`cash-entries.ts`)
// ---------------------------------------------------------------------------

/** Every row of the empresa, both sections, oldest date first and then by insertion. */
export async function listCashEntries(clientId: string): Promise<CashEntry[]> {
  const rows = await db.cashEntries.where("clientId").equals(clientId).toArray();
  return rows.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
}

/** «+ Agregar fila»: an empty row dated today, so the grid has a cell to type into. */
export async function addCashEntry(
  clientId: string,
  section: CashEntry["section"],
  date = todayISO(),
): Promise<CashEntry> {
  const entry: CashEntry = {
    id: crypto.randomUUID(),
    clientId,
    section,
    date,
    detail: "",
    amounts: {},
    loan: null,
    observation: "",
  };
  await db.cashEntries.add(entry);
  return entry;
}

export async function updateCashEntry(
  id: string,
  patch: Partial<Pick<CashEntry, "date" | "detail" | "amounts" | "loan" | "observation">>,
): Promise<void> {
  await db.cashEntries.update(id, patch);
}

export async function deleteCashEntry(id: string): Promise<void> {
  await db.cashEntries.delete(id);
}
