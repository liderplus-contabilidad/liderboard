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

/** A v2 meta row predates `loadedMonths` entirely — it didn't exist as a field yet. */
type LegacyMeta = Omit<WorkspaceMeta, "loadedMonths">;

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
