import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import {
  applyMonthSlice,
  db,
  getWorkspaceMeta,
  replaceWorkspace,
  saveCellEdit,
  saveCellEdits,
} from "./db";
import type { PygDataset } from "./types";

function dataset(id: string): PygDataset {
  return {
    id,
    fileName: "reporte.xlsx",
    uploadedAt: 0,
    companyName: "HOTELERA ANDES S.A.",
    periodLabel: "Ene–Dic 2026",
    year: 2026,
    baseFrequency: "mensual",
    role: "single",
    accounts: [{ code: "4", name: "Ingresos", values: [1] }],
    resultFromFile: [1],
    warnings: [],
  };
}

function center(id: string, centerId: string): PygDataset {
  return { ...dataset(id), role: "center", centerId, order: 0, centerColor: "#000" };
}

/** Seed a single dataset (single-mode workspace) as edit-test setup. */
function seed(id: string): Promise<void> {
  return replaceWorkspace([dataset(id)], {
    companyName: "X",
    warnings: [],
    activeCenterId: id,
    loadedMonths: [],
  });
}

beforeEach(async () => {
  await db.edits.clear();
  await db.datasets.clear();
  await db.meta.clear();
});

describe("saveCellEdit", () => {
  it("upserts on the same cell instead of duplicating", async () => {
    await seed("a");
    await saveCellEdit({ datasetId: "a", code: "4.1.1", monthIndex: 0, value: 10 });
    await saveCellEdit({ datasetId: "a", code: "4.1.1", monthIndex: 0, value: 20, comment: "ok" });
    const stored = await db.edits.toArray();
    expect(stored).toHaveLength(1);
    expect(stored[0].value).toBe(20);
    expect(stored[0].comment).toBe("ok");
    expect(stored[0].updatedAt).toBeGreaterThan(0);
  });

  it("deletes the record when value and comment are both empty", async () => {
    await seed("a");
    await saveCellEdit({ datasetId: "a", code: "4.1.1", monthIndex: 0, value: 10, comment: "x" });
    await saveCellEdit({ datasetId: "a", code: "4.1.1", monthIndex: 0 });
    expect(await db.edits.count()).toBe(0);
  });

  it("keeps a null value edit (an explicit clear) as a stored edit", async () => {
    await seed("a");
    await saveCellEdit({ datasetId: "a", code: "4.1.1", monthIndex: 0, value: null });
    const stored = await db.edits.toArray();
    expect(stored).toHaveLength(1);
    expect(stored[0].value).toBeNull();
  });

  it("serializes concurrent saves on the same cell without colliding on the unique index", async () => {
    await seed("a");
    // Fire two writes for the SAME cell concurrently — as React StrictMode's double-invoked
    // state updater did in the browser. Without atomic read-modify-write, both read "no
    // existing row" and both insert, so the second violates &[datasetId+code+monthIndex].
    await Promise.all([
      saveCellEdit({ datasetId: "a", code: "4.1.1", monthIndex: 0, value: 10 }),
      saveCellEdit({ datasetId: "a", code: "4.1.1", monthIndex: 0, value: 20 }),
    ]);
    const stored = await db.edits.toArray();
    expect(stored).toHaveLength(1);
  });
});

describe("saveCellEdits", () => {
  it("writes every cell of one move", async () => {
    await seed("a");
    await saveCellEdits([
      { datasetId: "a", code: "6.1.1", monthIndex: 0, value: 10 },
      { datasetId: "a", code: "5.2.1.1", monthIndex: 0, value: 50 },
    ]);
    const stored = await db.edits.toArray();

    expect(stored.map((e) => [e.code, e.value])).toEqual([
      ["6.1.1", 10],
      ["5.2.1.1", 50],
    ]);
  });

  it("rolls the whole move back when one cell fails", async () => {
    // A reclassification is the non-operating amount AND the discount on its twin. Half-applied,
    // the pair would stop adding up to what the file brought — so the transaction takes both.
    await seed("a");
    await expect(
      saveCellEdits([
        { datasetId: "a", code: "6.1.1", monthIndex: 0, value: 10 },
        { datasetId: "a", code: "5.2.1.1", monthIndex: Number.NaN, value: 50 },
      ]),
    ).rejects.toThrow();

    expect(await db.edits.toArray()).toEqual([]);
  });
});

describe("replaceWorkspace", () => {
  it("stores several datasets + meta and clears the previous workspace", async () => {
    await replaceWorkspace(
      [center("a", "norte"), center("b", "sur")],
      { companyName: "ACME", warnings: ["w"], activeCenterId: "consolidado", loadedMonths: [] },
      [
        { datasetId: "a", comments: [{ code: "4", monthIndex: 0, comment: "hola" }] },
        { datasetId: "b", comments: [] },
      ],
    );
    expect(await db.datasets.count()).toBe(2);
    const meta = await getWorkspaceMeta();
    expect(meta?.companyName).toBe("ACME");
    expect(meta?.activeCenterId).toBe("consolidado");
    const seeded = await db.edits.where("datasetId").equals("a").toArray();
    expect(seeded).toHaveLength(1);
    expect(seeded[0].comment).toBe("hola");
  });

  it("returns order-less (single) datasets via toArray — orderBy('order') would drop them", async () => {
    // s1 is role:"single" with no `order`; c1 is a center with order 0.
    await replaceWorkspace([dataset("s1"), center("c1", "norte")], {
      companyName: "X",
      warnings: [],
      activeCenterId: "s1",
      loadedMonths: [],
    });
    // The provider must query toArray(): both rows come back.
    expect((await db.datasets.toArray()).map((d) => d.id).sort()).toEqual(["c1", "s1"]);
    // Regression guard: an index scan on "order" silently excludes the order-less single row.
    expect((await db.datasets.orderBy("order").toArray()).map((d) => d.id)).toEqual(["c1"]);
  });

  it("wipes datasets, edits and meta of the prior workspace", async () => {
    await replaceWorkspace(
      [center("a", "norte")],
      { companyName: "ACME", warnings: [], activeCenterId: "consolidado", loadedMonths: [] },
      [{ datasetId: "a", comments: [] }],
    );
    await saveCellEdit({ datasetId: "a", code: "4", monthIndex: 0, value: 1 });
    await replaceWorkspace(
      [center("z", "z")],
      { companyName: "OTHER", warnings: [], activeCenterId: "consolidado", loadedMonths: [] },
      [{ datasetId: "z", comments: [] }],
    );
    expect((await db.datasets.toArray()).map((d) => d.id)).toEqual(["z"]);
    expect(await db.edits.count()).toBe(0);
    expect((await getWorkspaceMeta())?.companyName).toBe("OTHER");
  });
});

describe("applyMonthSlice", () => {
  it("upserts datasets and meta without touching edits", async () => {
    await replaceWorkspace(
      [center("a", "norte")],
      { companyName: "ACME", warnings: [], activeCenterId: "consolidado", loadedMonths: [0] },
      [{ datasetId: "a", comments: [] }],
    );
    await saveCellEdit({ datasetId: "a", code: "4", monthIndex: 0, value: 42 });

    const updated = {
      ...center("a", "norte"),
      accounts: [{ code: "4", name: "Ingresos", values: [1, 2] }],
    };
    await applyMonthSlice([updated], {
      companyName: "ACME",
      warnings: [],
      activeCenterId: "consolidado",
      loadedMonths: [0, 1],
    });

    const stored = await db.datasets.get("a");
    expect(stored?.accounts[0].values).toEqual([1, 2]);
    // The prior adjustment is still there — applyMonthSlice never clears `edits`.
    const edits = await db.edits.toArray();
    expect(edits).toHaveLength(1);
    expect(edits[0].value).toBe(42);
    const meta = await getWorkspaceMeta();
    expect(meta?.loadedMonths).toEqual([0, 1]);
  });

  it("adds a brand-new center dataset alongside the existing ones", async () => {
    await replaceWorkspace([center("a", "norte")], {
      companyName: "ACME",
      warnings: [],
      activeCenterId: "consolidado",
      loadedMonths: [0],
    });
    await applyMonthSlice([center("a", "norte"), center("b", "sur")], {
      companyName: "ACME",
      warnings: [],
      activeCenterId: "consolidado",
      loadedMonths: [0],
    });
    expect((await db.datasets.toArray()).map((d) => d.id).sort()).toEqual(["a", "b"]);
  });
});
