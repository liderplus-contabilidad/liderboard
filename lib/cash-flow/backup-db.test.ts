import "fake-indexeddb/auto";
import Dexie from "dexie";
import { afterEach, describe, expect, it, vi } from "vitest";
import { parseBackup, serializeBackup } from "@/lib/backup";
import {
  CASH_FLOW_BACKUP_TABLE_NAMES,
  cashFlowBackupAdapter,
  type CashFlowBackupTables,
} from "./backup";
import { cashFlowBackupEnvelopeFixture } from "./backup/fixtures";
import {
  CashFlowDb,
  captureCashFlowBackup,
  restoreCashFlowBackup,
  runCashFlowWrite,
  db,
  deleteFlow,
} from "./db";

const opened: Dexie[] = [];
function database(name = crypto.randomUUID()): CashFlowDb {
  const value = new CashFlowDb(`backup-test-${name}`);
  opened.push(value);
  return value;
}
async function seed(value: CashFlowDb, tables: CashFlowBackupTables) {
  await value.transaction("rw", value.tables, async () => {
    for (const name of CASH_FLOW_BACKUP_TABLE_NAMES) await value.table(name).bulkPut(tables[name]);
  });
}
async function read(value: CashFlowDb) {
  const entries = await Promise.all(
    CASH_FLOW_BACKUP_TABLE_NAMES.map(async (name) => [name, await value.table(name).toArray()]),
  );
  return JSON.parse(JSON.stringify(Object.fromEntries(entries)));
}
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(opened.splice(0).map((value) => value.delete()));
});

describe("cash-flow backup IndexedDB boundary", () => {
  // Losing any stored field/table or merging rather than replacing breaks this roundtrip.
  it("roundtrips all ten tables and replaces another destination without touching other modules", async () => {
    const origin = database(),
      destination = database();
    const fixture = cashFlowBackupEnvelopeFixture();
    await seed(origin, fixture.tables);
    await destination.clients.put({ id: "destination-only", name: "Destino" });
    const other = new Dexie(`other-module-${crypto.randomUUID()}`);
    other.version(1).stores({ data: "id" });
    opened.push(other);
    await other.table("data").put({ id: "keep", amount: 52.25 });
    const snapshot = await captureCashFlowBackup(origin);
    expect(Date.parse(snapshot.createdAt)).toBeGreaterThan(0);
    const parsed = parseBackup(
      serializeBackup(snapshot, cashFlowBackupAdapter),
      cashFlowBackupAdapter,
    );
    await restoreCashFlowBackup(parsed, destination);
    expect(await read(destination)).toEqual(await read(origin));
    expect(await destination.clients.get("destination-only")).toBeUndefined();
    expect(await other.table("data").toArray()).toEqual([{ id: "keep", amount: 52.25 }]);
  });

  it("rolls back the complete old destination after a later table write fails", async () => {
    const value = database();
    await value.clients.put({ id: "old", name: "Anterior" });
    await value.active.put({ key: "active", clientId: "old" });
    const previous = await read(value);
    value.flows.hook("creating", () => {
      throw new Error("quota failure");
    });
    await expect(restoreCashFlowBackup(cashFlowBackupEnvelopeFixture(), value)).rejects.toThrow(
      "quota failure",
    );
    expect(await read(value)).toEqual(previous);
    await value.clients.put({ id: "unlocked", name: "Disponible" });
    expect(await value.clients.get("unlocked")).toBeDefined();
  });

  it("revalidates a preview before any write or editor callback", async () => {
    const value = database();
    await value.clients.put({ id: "old", name: "Anterior" });
    const previous = await read(value);
    const invalid = cashFlowBackupEnvelopeFixture();
    invalid.tables.payables[0].payFromAccountId = "account-b";
    let closed = false;
    await expect(
      restoreCashFlowBackup(invalid, value, () => {
        closed = true;
      }),
    ).rejects.toThrow();
    expect(closed).toBe(false);
    expect(await read(value)).toEqual(previous);
  });

  it("exports and restores an empty database, removing destination rows", async () => {
    const empty = database(),
      value = database();
    await seed(value, cashFlowBackupEnvelopeFixture().tables);
    const snapshot = await captureCashFlowBackup(empty);
    for (const rows of Object.values(snapshot.tables)) expect(rows).toEqual([]);
    await restoreCashFlowBackup(snapshot, value);
    expect(await read(value)).toEqual(snapshot.tables);
  });

  it("captures a coherent state while an independent connection writes two tables", async () => {
    const name = crypto.randomUUID(),
      value = database(name),
      second = database(name);
    await seed(value, cashFlowBackupEnvelopeFixture().tables);
    await second.open();
    const started = deferred(),
      finish = deferred();
    const writing = second.transaction("rw", second.clients, second.active, async () => {
      await second.clients.update("company-a", { name: "Nuevo estado" });
      started.resolve();
      await Dexie.waitFor(finish.promise);
      await second.active.put({ key: "active", clientId: "company-a" });
    });
    await started.promise;
    const captured = captureCashFlowBackup(value);
    finish.resolve();
    await writing;
    const snapshot = await captured;
    expect(snapshot.tables.clients.find((row) => row.id === "company-a")?.name).toBe(
      "Nuevo estado",
    );
    expect(snapshot.tables.active).toEqual([{ key: "active", clientId: "company-a" }]);
  });

  it("locks before closing editors, waits an accepted job, and rejects reentry and new writes", async () => {
    const value = database();
    await value.open();
    const finish = deferred(),
      started = deferred();
    const pending = runCashFlowWrite(async () => {
      started.resolve();
      await finish.promise;
    }, value);
    await started.promise;
    let closed = false,
      committed = false;
    const restoring = restoreCashFlowBackup(cashFlowBackupEnvelopeFixture(), value, () => {
      closed = true;
    }).then(() => {
      committed = true;
    });
    expect(closed).toBe(true);
    await expect(restoreCashFlowBackup(cashFlowBackupEnvelopeFixture(), value)).rejects.toThrow();
    await expect(runCashFlowWrite(async () => {}, value)).rejects.toThrow();
    await expect(value.clients.put({ id: "stale", name: "Formulario viejo" })).rejects.toThrow();
    expect(committed).toBe(false);
    finish.resolve();
    await pending;
    await restoring;
    expect(await value.clients.get("stale")).toBeUndefined();
    await runCashFlowWrite(async () => {
      await value.clients.put({ id: "new", name: "Nuevo" });
    }, value);
    expect(await value.clients.get("new")).toBeDefined();
  });

  it("waits transactions already in flight and clones the validated input while waiting", async () => {
    const value = database();
    await value.open();
    const finish = deferred(),
      started = deferred();
    const writing = value.transaction("rw", value.clients, async () => {
      await value.clients.put({ id: "old", name: "Pendiente" });
      started.resolve();
      await Dexie.waitFor(finish.promise);
    });
    await started.promise;
    const fixture = cashFlowBackupEnvelopeFixture();
    const restoring = restoreCashFlowBackup(fixture, value);
    fixture.tables.clients[0].name = "Mutado durante espera";
    finish.resolve();
    await writing;
    await restoring;
    expect(await value.clients.get("old")).toBeUndefined();
    expect((await value.clients.get("company-a"))?.name).toBe("Empresa á");
  });

  it("waits a mutation function whose read started before restore, preventing stale writes after commit", async () => {
    opened.push(db);
    await seed(db, cashFlowBackupEnvelopeFixture().tables);
    const finish = deferred(),
      started = deferred();
    const where = db.flows.where.bind(db.flows);
    // Delay the real lookup's delivery, as an async read may still be resolving while editors close.
    const delayedWhere = (index: string | string[]) => {
      const clause = where(index);
      const equals = clause.equals.bind(clause);
      vi.spyOn(clause, "equals").mockImplementation((key) => {
        const collection = equals(key);
        const first = collection.first.bind(collection);
        vi.spyOn(collection, "first").mockImplementation(() =>
          Dexie.Promise.resolve(first()).then(async (result) => {
            started.resolve();
            await finish.promise;
            return result;
          }),
        );
        return collection;
      });
      return clause;
    };
    vi.spyOn(db.flows, "where").mockImplementation(delayedWhere as typeof db.flows.where);
    const deleting = deleteFlow("company-a", "2026-10-08");
    const deletionResult = deleting.catch((error: Error) => error);
    await started.promise;
    let committed = false;
    const restoring = restoreCashFlowBackup(cashFlowBackupEnvelopeFixture(), db).then(() => {
      committed = true;
    });
    // Let a broken implementation finish its replacement while the earlier read is still delayed.
    await new Promise((resolve) => setTimeout(resolve, 25));
    expect(committed).toBe(false);
    finish.resolve();
    expect(await deletionResult).toBeInstanceOf(Error);
    await restoring;
    expect(await db.flows.toArray()).toHaveLength(3);
  });

  it("restores into a previously unopened database", async () => {
    const value = database();
    await restoreCashFlowBackup(cashFlowBackupEnvelopeFixture(), value);
    expect((await value.clients.get("company-a"))?.name).toBe("Empresa á");
    expect(await value.flows.count()).toBe(3);
  });

  it("continues after a pending editor job fails and releases the lock if editor closing fails", async () => {
    const value = database();
    await value.clients.put({ id: "old", name: "Anterior" });
    const finish = deferred();
    const pending = runCashFlowWrite(async () => {
      await finish.promise;
      throw new Error("editor failed");
    }, value).catch((error: Error) => error);
    const restoring = restoreCashFlowBackup(cashFlowBackupEnvelopeFixture(), value);
    finish.resolve();
    expect(await pending).toBeInstanceOf(Error);
    await restoring;
    expect(await value.clients.get("old")).toBeUndefined();
    const previous = await read(value);
    await expect(
      restoreCashFlowBackup(cashFlowBackupEnvelopeFixture(), value, () => {
        throw new Error("closing failed");
      }),
    ).rejects.toThrow("closing failed");
    expect(await read(value)).toEqual(previous);
    await runCashFlowWrite(async () => {
      await value.clients.put({ id: "new", name: "Nuevo" });
    }, value);
    expect(await value.clients.get("new")).toBeDefined();
  });
});
