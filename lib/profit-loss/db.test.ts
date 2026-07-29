import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import {
  applyMonthSlice,
  clientDatasets,
  clientEdits,
  countEditsForYears,
  createClient,
  datasetEdits,
  db,
  deleteClient,
  deleteYear,
  describeClientContents,
  getActiveClientId,
  getWorkspaceMeta,
  listClients,
  listClientSummaries,
  mergeWorkspaceYears,
  renameClient,
  replaceClientWorkspace,
  saveCellEdit,
  saveCellEdits,
  setActiveClient,
} from "./db";
import type { ParsedDataset, WorkspaceMeta } from "./types";

function dataset(id: string, year = 2026): ParsedDataset {
  return {
    id,
    fileName: "reporte.xlsx",
    uploadedAt: 0,
    companyName: "HOTELERA ANDES S.A.",
    periodLabel: `Ene–Dic ${year}`,
    year,
    baseFrequency: "mensual",
    role: "single",
    accounts: [{ code: "4", name: "Ingresos", values: [1] }],
    resultFromFile: [1],
    warnings: [],
  };
}

function center(id: string, centerId: string, year = 2026): ParsedDataset {
  return { ...dataset(id, year), role: "center", centerId, order: 0, centerColor: "#000" };
}

function meta(overrides: Partial<WorkspaceMeta> = {}): WorkspaceMeta {
  return {
    companyName: "HOTELERA ANDES S.A.",
    warnings: [],
    activeCenterId: "consolidado",
    loadedMonthsByYear: {},
    sourceSystemId: "monthly-single",
    ...overrides,
  };
}

/** Seeds one client with one single-mode dataset — the setup the edit tests need. */
async function seedClient(name: string, datasets: ParsedDataset[]): Promise<string> {
  const client = await createClient(name);
  await replaceClientWorkspace(
    client.id,
    datasets,
    meta({ activeCenterId: datasets[0]?.id ?? "" }),
  );
  return client.id;
}

beforeEach(async () => {
  await db.edits.clear();
  await db.datasets.clear();
  await db.meta.clear();
  await db.clients.clear();
  await db.active.clear();
});

describe("clientes", () => {
  it("crear un cliente lo deja vacío y activo, sin tocar a los demás", async () => {
    const first = await createClient("Delicmar");
    await replaceClientWorkspace(first.id, [dataset("a")], meta());

    const second = await createClient("Manor Galápagos");
    expect(await getActiveClientId()).toBe(second.id);
    expect(await clientDatasets(second.id)).toEqual([]);
    // El primero queda exactamente como estaba.
    expect((await clientDatasets(first.id)).map((d) => d.id)).toEqual(["a"]);
  });

  it("la lista viene ordenada por nombre", async () => {
    await createClient("Zulia");
    await createClient("Ángel");
    await createClient("Delicmar");
    expect((await listClients()).map((c) => c.name)).toEqual(["Ángel", "Delicmar", "Zulia"]);
  });

  it("renombrar conserva los datos y no toca la identidad", async () => {
    const id = await seedClient("Cliente 1", [center("c", "norte")]);
    await saveCellEdit({ datasetId: "c", code: "4", monthIndex: 0, value: 42, comment: "nota" });

    await renameClient(id, "Hospital Durán");

    expect((await listClients())[0].name).toBe("Hospital Durán");
    expect((await clientDatasets(id)).map((d) => d.id)).toEqual(["c"]);
    expect(await clientEdits(id)).toHaveLength(1);
    expect((await listClientSummaries())[0].identity).toEqual({
      system: "monthly-single",
      companyName: "HOTELERA ANDES S.A.",
      mode: "centers",
    });
  });

  it("un cliente sin datos no tiene identidad: la adopta en su primera carga", async () => {
    const client = await createClient("Ecomoda Retail");
    expect((await listClientSummaries())[0]).toMatchObject({ identity: null, years: [] });

    await replaceClientWorkspace(client.id, [center("c", "norte", 2026)], meta());
    const summary = (await listClientSummaries())[0];
    expect(summary.identity).not.toBeNull();
    expect(summary.years).toEqual([2026]);
  });
});

describe("la partición por cliente", () => {
  it("cada lectura devuelve solo lo del cliente que se pide", async () => {
    const a = await seedClient("A", [center("a25", "norte", 2025)]);
    const b = await seedClient("B", [center("b26", "sur", 2026)]);
    await saveCellEdit({ datasetId: "a25", code: "4", monthIndex: 0, value: 111 });
    await saveCellEdit({ datasetId: "b26", code: "4", monthIndex: 0, value: 222 });

    expect((await clientDatasets(a)).map((d) => d.id)).toEqual(["a25"]);
    expect((await clientDatasets(b)).map((d) => d.id)).toEqual(["b26"]);
    expect((await clientEdits(a)).map((e) => e.value)).toEqual([111]);
    expect((await clientEdits(b)).map((e) => e.value)).toEqual([222]);
    expect((await getWorkspaceMeta(a))?.activeCenterId).toBe("a25");
  });

  it("cargar en un cliente deja al otro idéntico", async () => {
    const a = await seedClient("A", [center("a25", "norte", 2025)]);
    const b = await seedClient("B", [center("b26", "sur", 2026)]);
    await saveCellEdit({ datasetId: "b26", code: "4", monthIndex: 0, value: 222, comment: "ojo" });

    const before = {
      datasets: await clientDatasets(b),
      edits: await clientEdits(b),
      meta: await getWorkspaceMeta(b),
    };

    await applyMonthSlice(
      a,
      [center("a25", "norte", 2025), center("a26", "cartago", 2026)],
      meta(),
    );

    expect(await clientDatasets(b)).toEqual(before.datasets);
    expect(await clientEdits(b)).toEqual(before.edits);
    expect(await getWorkspaceMeta(b)).toEqual(before.meta);
  });

  it("el «Excel completo» de un cliente no alcanza los años de otro", async () => {
    const a = await seedClient("A", [center("a26", "norte", 2026)]);
    const b = await seedClient("B", [center("b26", "sur", 2026)]);

    await mergeWorkspaceYears(a, [center("a26-nuevo", "norte", 2026)], meta());

    expect((await clientDatasets(a)).map((d) => d.id)).toEqual(["a26-nuevo"]);
    expect((await clientDatasets(b)).map((d) => d.id)).toEqual(["b26"]);
  });

  it("borrar un año solo toca el año de ese cliente", async () => {
    const a = await seedClient("A", [center("a25", "norte", 2025), center("a26", "norte", 2026)]);
    const b = await seedClient("B", [center("b25", "sur", 2025)]);
    await saveCellEdit({ datasetId: "a25", code: "4", monthIndex: 0, value: 1 });
    await saveCellEdit({ datasetId: "b25", code: "4", monthIndex: 0, value: 2 });

    const { deletedEdits } = await deleteYear(a, 2025);

    expect(deletedEdits).toBe(1);
    expect((await clientDatasets(a)).map((d) => d.year)).toEqual([2026]);
    expect((await clientDatasets(b)).map((d) => d.year)).toEqual([2025]);
    expect(await clientEdits(b)).toHaveLength(1);
  });
});

describe("deleteClient", () => {
  it("arrastra sus datasets, ediciones y meta — y solo los suyos", async () => {
    const a = await seedClient("A", [center("a25", "norte", 2025)]);
    const b = await seedClient("B", [center("b26", "sur", 2026)]);
    await saveCellEdit({ datasetId: "a25", code: "4", monthIndex: 0, value: 1, comment: "x" });
    await saveCellEdit({ datasetId: "b26", code: "4", monthIndex: 0, value: 2, comment: "y" });

    await deleteClient(a);

    expect(await clientDatasets(a)).toEqual([]);
    expect(await db.edits.where("datasetId").equals("a25").count()).toBe(0);
    expect(await getWorkspaceMeta(a)).toBeUndefined();
    expect((await listClients()).map((c) => c.name)).toEqual(["B"]);
    // Lo de B, intacto.
    expect((await clientDatasets(b)).map((d) => d.id)).toEqual(["b26"]);
    expect(await clientEdits(b)).toHaveLength(1);
  });

  it("al borrar el activo, activa el primero por nombre de los que quedan", async () => {
    await createClient("Zulia");
    await createClient("Ángel");
    const active = await createClient("Delicmar");
    expect(await getActiveClientId()).toBe(active.id);

    await deleteClient(active.id);

    const remaining = await listClients();
    expect(remaining.map((c) => c.name)).toEqual(["Ángel", "Zulia"]);
    expect(await getActiveClientId()).toBe(remaining[0].id);
  });

  it("borrar un cliente que no está activo no cambia el activo", async () => {
    const other = await createClient("Zulia");
    const active = await createClient("Ángel");
    await deleteClient(other.id);
    expect(await getActiveClientId()).toBe(active.id);
  });

  it("borrar el último deja la app sin cliente activo", async () => {
    const only = await createClient("Delicmar");
    await deleteClient(only.id);
    expect(await listClients()).toEqual([]);
    expect(await getActiveClientId()).toBeNull();
  });
});

describe("replaceClientWorkspace", () => {
  it("vacía SOLO el cliente que reemplaza", async () => {
    const a = await seedClient("A", [center("a", "norte")]);
    const b = await seedClient("B", [center("b", "sur")]);
    await saveCellEdit({ datasetId: "b", code: "4", monthIndex: 0, value: 9 });

    await replaceClientWorkspace(a, [center("z", "z")], meta({ companyName: "OTRA" }));

    expect((await clientDatasets(a)).map((d) => d.id)).toEqual(["z"]);
    expect((await getWorkspaceMeta(a))?.companyName).toBe("OTRA");
    expect((await clientDatasets(b)).map((d) => d.id)).toEqual(["b"]);
    expect(await clientEdits(b)).toHaveLength(1);
  });

  it("conserva el comentario de una cuenta que sigue existiendo y pierde el de una que no", async () => {
    const withAccounts = (id: string, codes: string[]): ParsedDataset => ({
      ...center(id, "norte", 2026),
      accounts: codes.map((code) => ({ code, name: code, values: [1] })),
    });
    const a = await seedClient("A", [withAccounts("viejo", ["5.2.1", "5.2.9"])]);
    await saveCellEdit({ datasetId: "viejo", code: "5.2.1", monthIndex: 0, comment: "revisar" });
    await saveCellEdit({ datasetId: "viejo", code: "5.2.9", monthIndex: 0, comment: "se pierde" });
    // Un AJUSTE de valor, que el reemplazo sí descarta: el archivo nuevo trae otra cifra.
    await saveCellEdit({ datasetId: "viejo", code: "5.2.1", monthIndex: 1, value: 500 });

    await replaceClientWorkspace(a, [withAccounts("nuevo", ["5.2.1"])], meta());

    const edits = await clientEdits(a);
    expect(edits).toHaveLength(1);
    expect(edits[0]).toMatchObject({
      datasetId: "nuevo",
      code: "5.2.1",
      monthIndex: 0,
      comment: "revisar",
    });
    expect(edits[0].value).toBeUndefined();
  });

  it("un comentario no viaja a otro centro con la misma cuenta", async () => {
    const withCenter = (id: string, centerId: string): ParsedDataset => ({
      ...center(id, centerId, 2026),
      accounts: [{ code: "4", name: "Ingresos", values: [1] }],
    });
    const a = await seedClient("A", [withCenter("norte", "norte")]);
    await saveCellEdit({ datasetId: "norte", code: "4", monthIndex: 0, comment: "del norte" });

    await replaceClientWorkspace(a, [withCenter("sur", "sur")], meta());

    expect(await clientEdits(a)).toEqual([]);
  });

  it("siembra los comentarios que trae el archivo", async () => {
    const a = await seedClient("A", [center("a", "norte")]);
    await replaceClientWorkspace(a, [center("z", "z")], meta(), [
      { datasetId: "z", comments: [{ code: "4", monthIndex: 0, comment: "hola" }] },
    ]);
    const edits = await clientEdits(a);
    expect(edits).toHaveLength(1);
    expect(edits[0].comment).toBe("hola");
  });
});

describe("describeClientContents", () => {
  it("cuenta años, centros, cuentas y comentarios", async () => {
    const withAccounts = (id: string, centerId: string, year: number): ParsedDataset => ({
      ...center(id, centerId, year),
      accounts: [
        { code: "4", name: "Ingresos", values: [1] },
        { code: "5", name: "Gastos", values: [1] },
      ],
    });
    const a = await seedClient("A", [
      withAccounts("n25", "norte", 2025),
      withAccounts("n26", "norte", 2026),
      withAccounts("s26", "sur", 2026),
    ]);
    await saveCellEdit({ datasetId: "n25", code: "4", monthIndex: 0, comment: "una" });
    await saveCellEdit({ datasetId: "n26", code: "5", monthIndex: 3, comment: "otra" });
    // Un ajuste sin comentario no cuenta como comentario.
    await saveCellEdit({ datasetId: "s26", code: "4", monthIndex: 0, value: 7 });

    expect(await describeClientContents(a)).toEqual({
      years: [2025, 2026],
      // El mismo centro en dos años es UN centro.
      centers: 2,
      accounts: 2,
      comments: 2,
    });
  });

  it("un cliente vacío no cuenta nada", async () => {
    const client = await createClient("Ecomoda Retail");
    expect(await describeClientContents(client.id)).toEqual({
      years: [],
      centers: 0,
      accounts: 0,
      comments: 0,
    });
  });
});

describe("countEditsForYears", () => {
  it("cuenta solo los años pedidos, y solo de ese cliente", async () => {
    const a = await seedClient("A", [center("a25", "norte", 2025), center("a26", "norte", 2026)]);
    const b = await seedClient("B", [center("b25", "sur", 2025)]);
    await saveCellEdit({ datasetId: "a25", code: "4", monthIndex: 0, value: 1 });
    await saveCellEdit({ datasetId: "a26", code: "4", monthIndex: 0, value: 2 });
    await saveCellEdit({ datasetId: "b25", code: "4", monthIndex: 0, value: 3 });

    expect(await countEditsForYears(a, [2025])).toBe(1);
    expect(await countEditsForYears(a, [2025, 2026])).toBe(2);
    expect(await countEditsForYears(b, [2026])).toBe(0);
  });
});

describe("mergeWorkspaceYears — el «Excel completo» no borra los años que no trae", () => {
  it("reemplaza solo los años del archivo y deja intactos los demás", async () => {
    // El caso que motiva todo esto: ya tengo 2025 y 2026, y cargo un libro de 2027.
    const a = await seedClient("A", [
      center("c25", "cartago", 2025),
      center("c26", "cartago", 2026),
    ]);
    await db.meta.put({
      key: a,
      ...meta({
        loadedMonthsByYear: { 2025: [0, 1], 2026: [0] },
        sourceSystemId: "monthly-centers",
      }),
    });
    await saveCellEdit({ datasetId: "c25", code: "4", monthIndex: 0, value: 999 });

    await mergeWorkspaceYears(
      a,
      [center("c27", "cartago", 2027)],
      meta({ loadedMonthsByYear: { 2027: [0, 1, 2] }, sourceSystemId: "monthly-centers" }),
    );

    expect((await clientDatasets(a)).map((d) => d.year).sort()).toEqual([2025, 2026, 2027]);
    // La cobertura de los años anteriores sobrevive junto a la del año nuevo.
    expect((await getWorkspaceMeta(a))?.loadedMonthsByYear).toEqual({
      2025: [0, 1],
      2026: [0],
      2027: [0, 1, 2],
    });
    // Y el ajuste de 2025 sigue ahí: el archivo no hablaba de ese año.
    expect(await datasetEdits("c25")).toHaveLength(1);
  });

  it("un año que el archivo SÍ trae se reemplaza entero, ajustes incluidos", async () => {
    const a = await seedClient("A", [center("c26", "cartago", 2026)]);
    await saveCellEdit({ datasetId: "c26", code: "4", monthIndex: 0, value: 999 });

    await mergeWorkspaceYears(
      a,
      [center("c26-nuevo", "cartago", 2026)],
      meta({ loadedMonthsByYear: { 2026: [0, 1] } }),
    );

    expect(await clientDatasets(a)).toHaveLength(1);
    expect((await clientDatasets(a))[0].id).toBe("c26-nuevo");
    // El ajuste viejo se fue con su dataset; el archivo trae los suyos.
    expect(await datasetEdits("c26")).toHaveLength(0);
  });
});

describe("applyMonthSlice", () => {
  it("upserts datasets and meta without touching edits", async () => {
    const a = await seedClient("A", [center("a", "norte")]);
    await saveCellEdit({ datasetId: "a", code: "4", monthIndex: 0, value: 42 });

    const updated = {
      ...center("a", "norte"),
      accounts: [{ code: "4", name: "Ingresos", values: [1, 2] }],
    };
    await applyMonthSlice(a, [updated], meta({ loadedMonthsByYear: { 2026: [0, 1] } }));

    expect((await db.datasets.get("a"))?.accounts[0].values).toEqual([1, 2]);
    // The prior adjustment is still there — applyMonthSlice never clears `edits`.
    const edits = await clientEdits(a);
    expect(edits).toHaveLength(1);
    expect(edits[0].value).toBe(42);
    expect((await getWorkspaceMeta(a))?.loadedMonthsByYear).toEqual({ 2026: [0, 1] });
  });

  it("adds a brand-new center dataset alongside the existing ones", async () => {
    const a = await seedClient("A", [center("a", "norte")]);
    await applyMonthSlice(a, [center("a", "norte"), center("b", "sur")], meta());
    expect((await clientDatasets(a)).map((d) => d.id).sort()).toEqual(["a", "b"]);
  });

  it("devuelve los datasets sin `order` — un índice sobre `order` los excluiría", async () => {
    // Regresión: IndexedDB deja fuera de un índice las filas cuya clave es `undefined`, así que
    // un dataset `single` (sin `order`) desaparecería de un `orderBy("order")`. La consulta
    // acotada por cliente no usa ese índice.
    const a = await seedClient("A", [dataset("s1"), center("c1", "norte")]);
    expect((await clientDatasets(a)).map((d) => d.id).sort()).toEqual(["c1", "s1"]);
  });
});

describe("el cliente activo", () => {
  it("se recuerda y se puede cambiar", async () => {
    const first = await createClient("Delicmar");
    const second = await createClient("Manor Galápagos");
    expect(await getActiveClientId()).toBe(second.id);

    await setActiveClient(first.id);
    expect(await getActiveClientId()).toBe(first.id);
  });

  it("una base sin nada no tiene cliente activo", async () => {
    expect(await getActiveClientId()).toBeNull();
  });
});

describe("saveCellEdit", () => {
  it("upserts on the same cell instead of duplicating", async () => {
    await seedClient("A", [dataset("a")]);
    await saveCellEdit({ datasetId: "a", code: "4.1.1", monthIndex: 0, value: 10 });
    await saveCellEdit({ datasetId: "a", code: "4.1.1", monthIndex: 0, value: 20, comment: "ok" });
    const stored = await db.edits.toArray();
    expect(stored).toHaveLength(1);
    expect(stored[0].value).toBe(20);
    expect(stored[0].comment).toBe("ok");
    expect(stored[0].updatedAt).toBeGreaterThan(0);
  });

  it("deletes the record when value and comment are both empty", async () => {
    await seedClient("A", [dataset("a")]);
    await saveCellEdit({ datasetId: "a", code: "4.1.1", monthIndex: 0, value: 10, comment: "x" });
    await saveCellEdit({ datasetId: "a", code: "4.1.1", monthIndex: 0 });
    expect(await db.edits.count()).toBe(0);
  });

  it("keeps a null value edit (an explicit clear) as a stored edit", async () => {
    await seedClient("A", [dataset("a")]);
    await saveCellEdit({ datasetId: "a", code: "4.1.1", monthIndex: 0, value: null });
    const stored = await db.edits.toArray();
    expect(stored).toHaveLength(1);
    expect(stored[0].value).toBeNull();
  });

  it("serializes concurrent saves on the same cell without colliding on the unique index", async () => {
    await seedClient("A", [dataset("a")]);
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
    await seedClient("A", [dataset("a")]);
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
    await seedClient("A", [dataset("a")]);
    await expect(
      saveCellEdits([
        { datasetId: "a", code: "6.1.1", monthIndex: 0, value: 10 },
        { datasetId: "a", code: "5.2.1.1", monthIndex: Number.NaN, value: 50 },
      ]),
    ).rejects.toThrow();

    expect(await db.edits.toArray()).toEqual([]);
  });
});
