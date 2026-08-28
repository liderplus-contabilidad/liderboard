import "fake-indexeddb/auto";
import Dexie from "dexie";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CellEdit, ParsedDataset, WorkspaceMeta } from "./types";

/** Each test opens its own fresh `./db` singleton against a brand-new IndexedDB database, so
 * one test's post-migration (v3) state can never leak into the next test's v2 seed. */
afterEach(async () => {
  vi.resetModules();
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase("liderboard-pyg");
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    req.onblocked = () => resolve();
  });
});

function dataset(id: string, role: ParsedDataset["role"]): ParsedDataset {
  return {
    id,
    fileName: "x.xlsx",
    uploadedAt: 0,
    companyName: "HOTELERA ANDES S.A.",
    periodLabel: "Ene–Dic 2026",
    year: 2026,
    baseFrequency: "mensual",
    role,
    ...(role !== "single" ? { centerId: id, order: 0, centerColor: "#000" } : {}),
    accounts: [{ code: "4", name: "Ingresos", values: [1] }],
    resultFromFile: [1],
    warnings: [],
  };
}

/** A v2 meta row predates `loadedMonths` and `sourceSystemId` entirely — neither field existed
 * yet, which is exactly what the v4 and v5 upgrades have to cope with. */
type LegacyMeta = Omit<WorkspaceMeta, "loadedMonthsByYear" | "sourceSystemId">;

/** Seeds a v2 (pre-this-change) database directly, bypassing the app's own Dexie class so the
 * migration under test runs against genuinely old-shaped data when `./db` opens afterward. */
async function seedV2(
  datasets: ParsedDataset[],
  edits: CellEdit[],
  meta: LegacyMeta,
): Promise<void> {
  const legacy = new Dexie("liderboard-pyg");
  legacy
    .version(1)
    .stores({ datasets: "id", edits: "++id, datasetId, &[datasetId+code+monthIndex]" });
  legacy.version(2).stores({
    datasets: "id, role, order",
    edits: "++id, datasetId, &[datasetId+code+monthIndex]",
    meta: "key",
  });
  await legacy.open();
  await legacy.table<ParsedDataset>("datasets").bulkAdd(datasets);
  if (edits.length > 0) {
    await legacy.table<CellEdit>("edits").bulkAdd(edits);
  }
  await legacy.table("meta").add({ key: "workspace", ...meta });
  legacy.close();
}

/** A v3/v4 meta row predates `sourceSystemId` — the field the v5 upgrade fills in. */
type PreSystemMeta = Omit<WorkspaceMeta, "loadedMonthsByYear" | "sourceSystemId"> & {
  loadedMonths?: number[];
};

/** Seeds a v6 database — the last shape before clients. It is the only one that can legitimately
 * hold SEVERAL years, since `loadedMonthsByYear` is what v6 introduced, so it is what a realistic
 * multi-year workspace has to be seeded at. */
async function seedV6(
  datasets: ParsedDataset[],
  edits: CellEdit[],
  meta: WorkspaceMeta,
): Promise<void> {
  const legacy = new Dexie("liderboard-pyg");
  legacy
    .version(1)
    .stores({ datasets: "id", edits: "++id, datasetId, &[datasetId+code+monthIndex]" });
  for (const version of [2, 3, 4, 5]) {
    legacy.version(version).stores({
      datasets: "id, role, order",
      edits: "++id, datasetId, &[datasetId+code+monthIndex]",
      meta: "key",
    });
  }
  legacy.version(6).stores({
    datasets: "id, role, order, year",
    edits: "++id, datasetId, &[datasetId+code+monthIndex]",
    meta: "key",
  });
  await legacy.open();
  await legacy.table<ParsedDataset>("datasets").bulkAdd(datasets);
  if (edits.length > 0) {
    await legacy.table<CellEdit>("edits").bulkAdd(edits);
  }
  await legacy.table("meta").add({ key: "workspace", ...meta });
  legacy.close();
}

/** The single client the v7 upgrade produces, with the meta row it re-keyed onto it. `meta` is
 * read by the client's id, not by `"workspace"`, which is exactly what v7 changed. */
async function migrated(db: {
  clients: { toArray(): Promise<{ id: string; name: string }[]> };
  meta: { get(key: string): Promise<(WorkspaceMeta & { key: string }) | undefined> };
  active: { get(key: string): Promise<{ clientId: string | null } | undefined> };
}) {
  const clients = await db.clients.toArray();
  const client = clients[0];
  return {
    clients,
    client,
    meta: client ? await db.meta.get(client.id) : undefined,
    activeClientId: (await db.active.get("active"))?.clientId ?? null,
  };
}

/** Seeds a v3 (post-monthly-cost-center-upload, pre-this-change) database directly — same shape
 * as v2, so only the schema VERSION differs, which is what determines which upgrade functions
 * `./db` runs when it opens afterward (v4's and v5's, here). */
async function seedV3(
  datasets: ParsedDataset[],
  edits: CellEdit[],
  meta: PreSystemMeta,
): Promise<void> {
  const legacy = new Dexie("liderboard-pyg");
  legacy
    .version(1)
    .stores({ datasets: "id", edits: "++id, datasetId, &[datasetId+code+monthIndex]" });
  legacy.version(2).stores({
    datasets: "id, role, order",
    edits: "++id, datasetId, &[datasetId+code+monthIndex]",
    meta: "key",
  });
  legacy.version(3).stores({
    datasets: "id, role, order",
    edits: "++id, datasetId, &[datasetId+code+monthIndex]",
    meta: "key",
  });
  await legacy.open();
  await legacy.table<ParsedDataset>("datasets").bulkAdd(datasets);
  if (edits.length > 0) {
    await legacy.table<CellEdit>("edits").bulkAdd(edits);
  }
  await legacy.table("meta").add({ key: "workspace", ...meta });
  legacy.close();
}

describe("v3 migration — retiring by-centers workspaces", () => {
  it("discards center/sin-centro datasets and edits, keeps single ones intact", async () => {
    await seedV2(
      [
        dataset("single-1", "single"),
        dataset("center-norte", "center"),
        dataset("sin-centro-1", "sin-centro"),
      ],
      [
        { datasetId: "single-1", code: "4", monthIndex: 0, value: 5, updatedAt: 1 },
        { datasetId: "center-norte", code: "4", monthIndex: 0, value: 9, updatedAt: 1 },
      ],
      { companyName: "HOTELERA ANDES S.A.", warnings: [], activeCenterId: "consolidado" },
    );
    const { db } = await import("./db");
    await db.open();

    const remaining = await db.datasets.toArray();
    expect(remaining.map((d) => d.id)).toEqual(["single-1"]);

    const edits = await db.edits.toArray();
    expect(edits.map((e) => e.datasetId)).toEqual(["single-1"]);

    // The old workspace's meta described a by-centers workspace — no longer meaningful once
    // its datasets are gone.
    expect((await migrated(db)).meta).toBeUndefined();
  });
});

describe("v3 migration — a pure single-statement workspace is untouched", () => {
  it("keeps the single dataset, its edits, and its meta row intact", async () => {
    await seedV2(
      [dataset("single-1", "single")],
      [{ datasetId: "single-1", code: "4", monthIndex: 0, value: 5, updatedAt: 1 }],
      { companyName: "HOTELERA ANDES S.A.", warnings: ["w"], activeCenterId: "single-1" },
    );
    const { db } = await import("./db");
    await db.open();

    expect((await db.datasets.toArray()).map((d) => d.id)).toEqual(["single-1"]);
    expect(await db.edits.count()).toBe(1);
    const { meta } = await migrated(db);
    expect(meta?.companyName).toBe("HOTELERA ANDES S.A.");
    expect(meta?.activeCenterId).toBe("single-1");
  });
});

describe("v4 migration — retiring annual-base single-statement workspaces", () => {
  it("discards a base-anual single dataset with its edits and clears meta", async () => {
    await seedV3(
      [{ ...dataset("single-1", "single"), baseFrequency: "anual" }],
      [{ datasetId: "single-1", code: "4", monthIndex: 0, value: 5, updatedAt: 1 }],
      {
        companyName: "HOTELERA ANDES S.A.",
        warnings: [],
        activeCenterId: "single-1",
        loadedMonths: [],
      },
    );
    const { db } = await import("./db");
    await db.open();

    expect(await db.datasets.count()).toBe(0);
    expect(await db.edits.count()).toBe(0);
    // With no datasets and no workspace row, v7 creates no client.
    expect((await migrated(db)).clients).toEqual([]);
  });
});

describe("v4 migration — a base-mensual single-statement workspace is conserved", () => {
  it("keeps the dataset and its edits, and seeds loadedMonths from non-zero months", async () => {
    const monthly: ParsedDataset = {
      ...dataset("single-1", "single"),
      accounts: [
        {
          code: "4",
          name: "Ingresos",
          values: [10, 20, 30, 40, 50, 60, 70, 0, 0, 0, 0, 0],
        },
      ],
    };
    await seedV3(
      [monthly],
      [{ datasetId: "single-1", code: "4", monthIndex: 0, value: 5, updatedAt: 1 }],
      {
        companyName: "HOTELERA ANDES S.A.",
        warnings: [],
        activeCenterId: "single-1",
        loadedMonths: [],
      },
    );
    const { db } = await import("./db");
    await db.open();

    expect((await db.datasets.toArray()).map((d) => d.id)).toEqual(["single-1"]);
    expect(await db.edits.count()).toBe(1);
    const { meta } = await migrated(db);
    // v4 infers `loadedMonths`; v6 moves it onto the year's axis without losing anything.
    expect(meta?.loadedMonthsByYear).toEqual({ 2026: [0, 1, 2, 3, 4, 5, 6] });
  });
});

describe("v5 migration — el sistema de origen del workspace", () => {
  it("un workspace ya guardado adopta el id del estado único, sin descartarse", async () => {
    const monthly: ParsedDataset = {
      ...dataset("single-1", "single"),
      accounts: [{ code: "4", name: "Ingresos", values: [10, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] }],
    };
    await seedV3([monthly], [], {
      companyName: "HOTELERA ANDES S.A.",
      warnings: [],
      activeCenterId: "single-1",
      loadedMonths: [0],
    });
    const { db } = await import("./db");
    await db.open();

    // Nothing is discarded: the dataset is still there and the meta only gains the field.
    expect((await db.datasets.toArray()).map((d) => d.id)).toEqual(["single-1"]);
    const { meta } = await migrated(db);
    expect(meta?.sourceSystemId).toBe("monthly-single");
    expect(meta?.companyName).toBe("HOTELERA ANDES S.A.");
  });
});

describe("v7 migration — el workspace único pasa a ser el primer cliente", () => {
  it("un workspace por centros con varios años y ajustes se convierte en un cliente activo", async () => {
    const centers: ParsedDataset[] = [
      { ...dataset("c25", "center"), id: "c25", centerId: "cartago", year: 2025 },
      { ...dataset("c26", "center"), id: "c26", centerId: "cartago", year: 2026 },
      { ...dataset("a26", "center"), id: "a26", centerId: "albemarle", year: 2026 },
    ];
    await seedV6(
      centers,
      [
        { datasetId: "c25", code: "4", monthIndex: 0, value: 999, updatedAt: 1 },
        { datasetId: "c26", code: "4", monthIndex: 3, comment: "revisar", updatedAt: 1 },
      ],
      {
        companyName: "DARWIN & WOLF",
        warnings: [],
        activeCenterId: "consolidado",
        loadedMonthsByYear: { 2025: [0, 1], 2026: [0, 1, 2] },
        sourceSystemId: "monthly-centers",
      },
    );
    const { db } = await import("./db");
    await db.open();

    const { client, meta, activeClientId, clients } = await migrated(db);
    expect(clients).toHaveLength(1);
    expect(client.name).toBe("DARWIN & WOLF");
    expect(activeClientId).toBe(client.id);

    // Every dataset carries its client; none is lost.
    const datasets = await db.datasets.toArray();
    expect(datasets.map((d) => d.id).sort()).toEqual(["a26", "c25", "c26"]);
    expect(datasets.every((d) => d.clientId === client.id)).toBe(true);
    expect(await db.datasets.where("clientId").equals(client.id).count()).toBe(3);

    // The coverage of BOTH years travels whole in the re-keyed row.
    expect(meta?.activeCenterId).toBe("consolidado");
    expect(meta?.sourceSystemId).toBe("monthly-centers");
    expect(meta?.loadedMonthsByYear).toEqual({ 2025: [0, 1], 2026: [0, 1, 2] });
    // And the old row no longer exists.
    expect(await db.meta.get("workspace")).toBeUndefined();
  });

  it("un workspace de estado único también se convierte, con su dataset y sus ediciones", async () => {
    await seedV3(
      [dataset("single-1", "single")],
      [{ datasetId: "single-1", code: "4", monthIndex: 0, value: 5, updatedAt: 1 }],
      {
        companyName: "NOMIK HOTELS S.A.S.",
        warnings: [],
        activeCenterId: "single-1",
        loadedMonths: [0],
      },
    );
    const { db } = await import("./db");
    await db.open();

    const { client } = await migrated(db);
    expect(client.name).toBe("NOMIK HOTELS S.A.S.");
    expect((await db.datasets.toArray())[0].clientId).toBe(client.id);
    expect(await db.edits.count()).toBe(1);
  });

  it("un `companyName` vacío deja el cliente llamado «Cliente 1»", async () => {
    await seedV3([dataset("single-1", "single")], [], {
      companyName: "   ",
      warnings: [],
      activeCenterId: "single-1",
      loadedMonths: [0],
    });
    const { db } = await import("./db");
    await db.open();

    expect((await migrated(db)).client.name).toBe("Cliente 1");
  });

  it("una base que nunca cargó nada no crea ningún cliente", async () => {
    const legacy = new Dexie("liderboard-pyg");
    legacy
      .version(1)
      .stores({ datasets: "id", edits: "++id, datasetId, &[datasetId+code+monthIndex]" });
    legacy.version(2).stores({
      datasets: "id, role, order",
      edits: "++id, datasetId, &[datasetId+code+monthIndex]",
      meta: "key",
    });
    await legacy.open();
    legacy.close();

    const { db } = await import("./db");
    await db.open();

    const { clients, activeClientId } = await migrated(db);
    expect(clients).toEqual([]);
    expect(activeClientId).toBeNull();
  });

  it("la migración no pierde ajustes ni comentarios", async () => {
    await seedV3(
      [dataset("single-1", "single")],
      [
        { datasetId: "single-1", code: "4", monthIndex: 0, value: 1234, updatedAt: 1 },
        { datasetId: "single-1", code: "5", monthIndex: 6, comment: "ojo con esto", updatedAt: 1 },
        {
          datasetId: "single-1",
          code: "5.2",
          monthIndex: 2,
          value: 7,
          comment: "ambas",
          updatedAt: 1,
        },
      ],
      {
        companyName: "DARWIN & WOLF",
        warnings: [],
        activeCenterId: "single-1",
        loadedMonths: [0],
      },
    );
    const { db } = await import("./db");
    await db.open();

    const edits = (await db.edits.toArray()).sort((a, b) => a.code.localeCompare(b.code));
    expect(edits.map((e) => [e.code, e.monthIndex, e.value, e.comment])).toEqual([
      ["4", 0, 1234, undefined],
      ["5", 6, undefined, "ojo con esto"],
      ["5.2", 2, 7, "ambas"],
    ]);
  });
});
