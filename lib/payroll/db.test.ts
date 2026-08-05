import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import {
  createClient,
  createPeriod,
  db,
  deleteClient,
  describeClientContents,
  getActiveClientId,
  getClient,
  listClients,
  listClientSummaries,
  listPeriods,
  renameClient,
  setActiveClient,
} from "./db";

/** The cliente every scoped case runs inside; a second one appears only where isolation is the point. */
let clientId = "";

beforeEach(async () => {
  await db.periods.clear();
  await db.clients.clear();
  await db.active.clear();
  clientId = (await createClient("Manor Galápagos")).id;
});

describe("clientes", () => {
  it("creates an EMPTY cliente and opens it", async () => {
    expect(await listPeriods(clientId)).toEqual([]);
    expect(await getActiveClientId()).toBe(clientId);
  });

  it("lists clientes by name, and renaming reorders", async () => {
    await createClient("Ambato Centro");
    expect((await listClients()).map((c) => c.name)).toEqual(["Ambato Centro", "Manor Galápagos"]);

    await renameClient(clientId, "Alfa");
    expect((await listClients()).map((c) => c.name)).toEqual(["Alfa", "Ambato Centro"]);
  });

  it("renaming touches the label and nothing else", async () => {
    await createPeriod(clientId, 2026, 2, "ordinario");
    await renameClient(clientId, "Otro nombre");
    const summaries = await listClientSummaries();
    expect(summaries[0].name).toBe("Otro nombre");
    expect(summaries[0].periodCount).toBe(1);
  });

  it("summarizes what each cliente holds, for the selector's subline", async () => {
    await createPeriod(clientId, 2025, 0, "ordinario");
    await createPeriod(clientId, 2026, 2, "ordinario");
    await createPeriod(clientId, 2026, 5, "ordinario");

    const summary = (await listClientSummaries()).find((c) => c.id === clientId);
    expect(summary?.periodCount).toBe(3);
    expect(summary?.years).toEqual([2025, 2026]);
  });

  it("un cliente recién creado no tiene ningún período", async () => {
    const summary = (await listClientSummaries())[0];
    expect(summary.periodCount).toBe(0);
    expect(summary.years).toEqual([]);
  });

  it("counts what deleting a cliente discards", async () => {
    await createPeriod(clientId, 2025, 0, "ordinario");
    await createPeriod(clientId, 2026, 2, "ordinario");

    expect(await describeClientContents(clientId)).toEqual({
      periodCount: 2,
      years: [2025, 2026],
    });
  });
});

describe("aislamiento entre clientes", () => {
  let other = "";

  beforeEach(async () => {
    other = (await createClient("Ambato Centro")).id;
    await setActiveClient(clientId);
  });

  it("keeps the same (year, mes) of two clientes apart", async () => {
    await createPeriod(clientId, 2026, 5, "ordinario");
    await createPeriod(other, 2026, 5, "ordinario");

    expect((await listPeriods(clientId))[0].clientId).toBe(clientId);
    expect((await listPeriods(other))[0].clientId).toBe(other);
  });

  it("lists only the open cliente's períodos, so no read can mix two empresas", async () => {
    await createPeriod(clientId, 2026, 2, "ordinario");
    await createPeriod(other, 2026, 5, "ordinario");

    expect((await listPeriods(clientId)).map((p) => p.monthIndex)).toEqual([2]);
    expect((await listPeriods(other)).map((p) => p.monthIndex)).toEqual([5]);
  });

  it("deleting a cliente takes its períodos and leaves the others intact", async () => {
    await createPeriod(clientId, 2025, 0, "ordinario");
    await createPeriod(clientId, 2026, 2, "ordinario");
    await createPeriod(other, 2026, 5, "ordinario");

    await deleteClient(clientId);

    expect(await db.periods.where("clientId").equals(clientId).count()).toBe(0);
    expect((await listPeriods(other)).map((p) => p.monthIndex)).toEqual([5]);
    // The open cliente was deleted, so the module falls back to the first remaining one BY NAME.
    expect(await getActiveClientId()).toBe(other);
  });

  it("leaves no active cliente once the last one is deleted", async () => {
    await deleteClient(other);
    await deleteClient(clientId);
    expect(await getActiveClientId()).toBeNull();
    expect(await listClients()).toEqual([]);
  });

  it("deleting a cliente that is NOT active leaves the active one untouched", async () => {
    await deleteClient(other);
    expect(await getActiveClientId()).toBe(clientId);
    expect(await getClient(clientId)).toBeDefined();
  });
});

describe("períodos", () => {
  it("creates an empty período: captura, sin totales", async () => {
    const period = await createPeriod(clientId, 2026, 5, "ordinario");
    expect(period.status).toBe("captura");
    expect(period.totals).toBeUndefined();
    expect(period.clientId).toBe(clientId);
  });

  it("lists períodos most-recent-first", async () => {
    await createPeriod(clientId, 2026, 2, "ordinario");
    await createPeriod(clientId, 2025, 11, "ordinario");
    await createPeriod(clientId, 2026, 5, "ordinario");

    expect((await listPeriods(clientId)).map((p) => [p.year, p.monthIndex])).toEqual([
      [2026, 5],
      [2026, 2],
      [2025, 11],
    ]);
  });

  it("rejects a duplicate (year, mes) for the same cliente", async () => {
    await createPeriod(clientId, 2026, 5, "ordinario");
    await expect(createPeriod(clientId, 2026, 5, "ordinario")).rejects.toThrow();
    expect(await listPeriods(clientId)).toHaveLength(1);
  });

  it("el mismo (year, mes) SÍ puede existir en dos clientes distintos", async () => {
    const other = (await createClient("Ambato Centro")).id;
    await createPeriod(clientId, 2026, 5, "ordinario");
    await expect(createPeriod(other, 2026, 5, "ordinario")).resolves.toBeDefined();
  });
});
