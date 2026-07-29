import "fake-indexeddb/auto";
import Dexie from "dexie";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CellEdit, PygDataset, WorkspaceMeta } from "./types";

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

function dataset(id: string, role: PygDataset["role"]): PygDataset {
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
async function seedV2(datasets: PygDataset[], edits: CellEdit[], meta: LegacyMeta): Promise<void> {
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
  await legacy.table<PygDataset>("datasets").bulkAdd(datasets);
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

/** Seeds a v3 (post-monthly-cost-center-upload, pre-this-change) database directly — same shape
 * as v2, so only the schema VERSION differs, which is what determines which upgrade functions
 * `./db` runs when it opens afterward (v4's and v5's, here). */
async function seedV3(
  datasets: PygDataset[],
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
  await legacy.table<PygDataset>("datasets").bulkAdd(datasets);
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
    const meta = await db.meta.get("workspace");
    expect(meta).toBeUndefined();
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
    const meta = await db.meta.get("workspace");
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
    expect(await db.meta.get("workspace")).toBeUndefined();
  });
});

describe("v4 migration — a base-mensual single-statement workspace is conserved", () => {
  it("keeps the dataset and its edits, and seeds loadedMonths from non-zero months", async () => {
    const monthly: PygDataset = {
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
    const meta = await db.meta.get("workspace");
    // v4 infiere `loadedMonths`; v6 la mueve al eje del año sin perder nada.
    expect(meta?.loadedMonthsByYear).toEqual({ 2026: [0, 1, 2, 3, 4, 5, 6] });
  });
});

describe("v5 migration — el sistema de origen del workspace", () => {
  it("un workspace ya guardado adopta el id del estado único, sin descartarse", async () => {
    const monthly: PygDataset = {
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

    // Nada se descarta: el dataset sigue ahí y la meta solo gana el campo.
    expect((await db.datasets.toArray()).map((d) => d.id)).toEqual(["single-1"]);
    const meta = await db.meta.get("workspace");
    expect(meta?.sourceSystemId).toBe("monthly-single");
    expect(meta?.companyName).toBe("HOTELERA ANDES S.A.");
  });
});
