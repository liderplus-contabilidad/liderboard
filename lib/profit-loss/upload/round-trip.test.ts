import { describe, expect, it } from "vitest";
import type { DatosRow } from "../datos-types";
import { toDatosGrid } from "../derive";
import { PygParseError } from "../errors";
import {
  buildMonthSliceWorkbook,
  buildMultiCenterWorkbook,
  buildPygWorkbook,
  buildSingleMonthSliceWorkbook,
  monthSliceFilename,
  multiCenterFilename,
  workbookToBlob,
} from "../export";
import { segmentAccounts } from "../segment";
import type { CellEdit, PygDataset } from "../types";
import { resolveUpload } from "./registry";
import type { StagedUpload } from "./types";
import { slugifyCenter } from "../workspace";

const MONTHS = Array.from({ length: 12 }, () => 0);

function singleDataset(id: string, values: number[]): PygDataset {
  return {
    id,
    fileName: "x.xlsx",
    uploadedAt: 0,
    companyName: "NOMIK HOTELS S.A.S.",
    periodLabel: "Ene–Dic 2026",
    year: 2026,
    baseFrequency: "mensual",
    role: "single",
    accounts: [{ code: "4", name: "Ingresos", values: [...values] }],
    resultFromFile: [],
    warnings: [],
  };
}

/** `centerId` MUST be `slugifyCenter(name)`, same invariant `merge-month.ts` maintains —
 * `app-workbook.ts` re-derives it the same way from the sheet name on import. */
function center(
  id: string,
  name: string,
  order: number,
  generalValue: number,
  year = 2026,
): PygDataset {
  const values = [...MONTHS];
  values[0] = generalValue; // Enero
  values[2] = generalValue + 50; // Marzo
  return {
    id,
    fileName: "x.xlsx",
    uploadedAt: 0,
    companyName: "HOTELERA ANDES S.A.",
    periodLabel: `Ene–Dic ${year}`,
    year,
    baseFrequency: "mensual",
    role: "center",
    centerId: slugifyCenter(name),
    centerColor: "#000",
    order,
    costCenterName: name,
    accounts: [{ code: "4", name: "Ingresos", values }],
    resultFromFile: [],
    warnings: [],
  };
}

async function toBuffer(
  workbook: ReturnType<typeof buildMultiCenterWorkbook>,
): Promise<ArrayBuffer> {
  const blob = await workbookToBlob(workbook);
  return blob.arrayBuffer();
}

describe("round-trip — Excel completo multi-año", () => {
  it("lleva todos los años en un libro y los devuelve separados", async () => {
    const workbook = buildMultiCenterWorkbook({
      companyName: "HOTELERA ANDES S.A.",
      loadedMonthsByYear: { 2025: [0, 1], 2026: [0, 2] },
      centers: [
        { dataset: center("norte-25", "SUCURSAL NORTE", 0, 100, 2025), edits: [] },
        { dataset: center("sur-25", "SUCURSAL SUR", 1, 40, 2025), edits: [] },
        { dataset: center("norte-26", "SUCURSAL NORTE", 0, 700, 2026), edits: [] },
        { dataset: center("sur-26", "SUCURSAL SUR", 1, 80, 2026), edits: [] },
      ],
    });
    const fileName = multiCenterFilename([2025, 2026]);
    expect(fileName).toBe("PyG-2025-2026-completo.xlsx");

    const staged = resolveUpload(fileName, await toBuffer(workbook));
    const { datasets, meta } = staged as Extract<StagedUpload, { kind: "workspace" }>;

    // Cuatro centro-año, cada uno con su propio año y sus propios valores.
    expect(datasets).toHaveLength(4);
    expect(datasets.map((d) => d.year).sort()).toEqual([2025, 2025, 2026, 2026]);
    const norte25 = datasets.find((d) => d.year === 2025 && d.costCenterName === "SUCURSAL NORTE");
    const norte26 = datasets.find((d) => d.year === 2026 && d.costCenterName === "SUCURSAL NORTE");
    expect(norte25?.accounts.find((a) => a.code === "4")?.values[0]).toBe(100);
    expect(norte26?.accounts.find((a) => a.code === "4")?.values[0]).toBe(700);
    // La cobertura es de cada año, no compartida.
    expect(meta.loadedMonthsByYear).toEqual({ 2025: [0, 1], 2026: [0, 2] });
  });

  it("un mismo centro conserva su color en los dos años", async () => {
    const workbook = buildMultiCenterWorkbook({
      companyName: "HOTELERA ANDES S.A.",
      loadedMonthsByYear: { 2025: [0], 2026: [0] },
      centers: [
        // 2025 lista NORTE primero; 2026 lo lista segundo — el caso de los archivos reales.
        { dataset: center("norte-25", "SUCURSAL NORTE", 0, 100, 2025), edits: [] },
        { dataset: center("sur-25", "SUCURSAL SUR", 1, 40, 2025), edits: [] },
        { dataset: center("sur-26", "SUCURSAL SUR", 0, 80, 2026), edits: [] },
        { dataset: center("norte-26", "SUCURSAL NORTE", 1, 700, 2026), edits: [] },
      ],
    });
    const staged = resolveUpload(multiCenterFilename([2025, 2026]), await toBuffer(workbook));
    const { datasets } = staged as Extract<StagedUpload, { kind: "workspace" }>;

    const colorOf = (name: string, year: number) =>
      datasets.find((d) => d.costCenterName === name && d.year === year)?.centerColor;
    expect(colorOf("SUCURSAL NORTE", 2025)).toBe(colorOf("SUCURSAL NORTE", 2026));
    expect(colorOf("SUCURSAL SUR", 2025)).toBe(colorOf("SUCURSAL SUR", 2026));
    expect(colorOf("SUCURSAL NORTE", 2025)).not.toBe(colorOf("SUCURSAL SUR", 2025));
  });
});

describe("round-trip — Excel completo", () => {
  it("re-enters as an equivalent workspace: centers, values, loadedMonths", async () => {
    const norte = center("norte", "SUCURSAL NORTE", 0, 100);
    const sur = center("sur", "SUCURSAL SUR", 1, 40);
    const workbook = buildMultiCenterWorkbook({
      companyName: "HOTELERA ANDES S.A.",
      loadedMonthsByYear: { 2026: [0, 2] },
      centers: [
        { dataset: norte, edits: [] },
        { dataset: sur, edits: [] },
      ],
    });
    const buffer = await toBuffer(workbook);
    const fileName = multiCenterFilename([2026]);
    expect(fileName).toBe("PyG-2026-completo.xlsx");
    const staged = resolveUpload(fileName, buffer);
    expect(staged.kind).toBe("workspace");
    const { datasets, meta } = staged as Extract<StagedUpload, { kind: "workspace" }>;

    expect(datasets.map((d) => d.costCenterName)).toEqual(["SUCURSAL NORTE", "SUCURSAL SUR"]);
    expect(datasets[0].accounts.find((a) => a.code === "4")?.values[0]).toBe(100);
    expect(datasets[0].accounts.find((a) => a.code === "4")?.values[2]).toBe(150);
    expect(datasets[1].accounts.find((a) => a.code === "4")?.values[0]).toBe(40);
    expect(meta.loadedMonthsByYear).toEqual({ 2026: [0, 2] });
  });

  it("keeps an adjustment marked as an adjustment after the round-trip", async () => {
    const norte = center("norte", "SUCURSAL NORTE", 0, 100);
    const edit: CellEdit = {
      datasetId: "norte",
      code: "4",
      monthIndex: 0,
      value: 999,
      comment: "Ajuste de enero",
      updatedAt: 1,
    };
    const workbook = buildMultiCenterWorkbook({
      companyName: "HOTELERA ANDES S.A.",
      loadedMonthsByYear: { 2026: [0] },
      centers: [{ dataset: norte, edits: [edit] }],
    });
    const buffer = await toBuffer(workbook);
    const staged = resolveUpload("PyG-2026-completo.xlsx", buffer) as Extract<
      StagedUpload,
      { kind: "workspace" }
    >;

    expect(staged.datasets[0].accounts.find((a) => a.code === "4")?.values[0]).toBe(100);
    const norteId = staged.datasets[0].id;
    const seeds = staged.commentsByDataset.find((c) => c.datasetId === norteId)?.comments;
    expect(seeds).toEqual([{ code: "4", monthIndex: 0, comment: "Ajuste de enero", value: 999 }]);
  });
});

describe("round-trip — un mes en crudo", () => {
  it("re-enters through the monthly-centers strategy", async () => {
    const norte = center("norte", "SUCURSAL NORTE", 0, 100);
    const sur = center("sur", "SUCURSAL SUR", 1, 40);
    const workbook = buildMonthSliceWorkbook({
      companyName: "HOTELERA ANDES S.A.",
      year: 2026,
      month: 0,
      centers: [
        { name: "SUCURSAL NORTE", dataset: norte, edits: [] },
        { name: "SUCURSAL SUR", dataset: sur, edits: [] },
      ],
    });
    const buffer = await toBuffer(workbook);
    const fileName = monthSliceFilename(2026, 0);
    expect(fileName).toBe("PyG-2026-01-liderboard.xlsx");

    const staged = resolveUpload(fileName, buffer);
    expect(staged.kind).toBe("month-slice");
    const slice = staged as Extract<StagedUpload, { kind: "month-slice" }>;
    expect(slice.year).toBe(2026);
    expect(slice.month).toBe(0);
    expect(slice.centers.map((c) => c.name)).toEqual(["SUCURSAL NORTE", "SUCURSAL SUR"]);
    expect(slice.general?.find((a) => a.code === "4")?.values).toEqual([140]); // GENERAL = Σ centers
  });
});

describe("round-trip — sin la hoja de metadatos", () => {
  it("no acierta ninguna estrategia (el estado único de doce columnas está retirado)", async () => {
    // Re-derive the SAME visible sheets via buildMultiCenterWorkbook, but strip the hidden
    // metadata sheet before re-uploading — losing the workspace-wide info (year/loadedMonths/
    // adjustments) is exactly what should happen when metadata never round-trips, and the
    // Consolidado sheet alone has the twelve-month shape `monthly-single` deliberately rejects.
    const norte = center("norte", "SUCURSAL NORTE", 0, 100);
    const workbook = buildMultiCenterWorkbook({
      companyName: "HOTELERA ANDES S.A.",
      loadedMonthsByYear: { 2026: [0] },
      centers: [{ dataset: norte, edits: [] }],
    });
    workbook.removeWorksheet(workbook.worksheets.find((w) => w.name.startsWith("_"))?.id ?? -1);
    const buffer = await toBuffer(workbook);
    expect(() => resolveUpload("cualquier-nombre.xlsx", buffer)).toThrow(PygParseError);
  });
});

describe("round-trip — Excel con tus datos (estado único)", () => {
  it("re-enters as an equivalent single-mode workspace: valores, meses cargados", async () => {
    const values = [...MONTHS];
    values[0] = 100; // Enero
    values[2] = 150; // Marzo
    const dataset = singleDataset("s1", values);
    const workbook = buildPygWorkbook([{ dataset: dataset, edits: [] }], { 2026: [0, 2] });
    const buffer = await toBuffer(workbook);
    const staged = resolveUpload("cualquier-nombre.xlsx", buffer);
    expect(staged.kind).toBe("workspace");
    const { datasets, meta } = staged as Extract<StagedUpload, { kind: "workspace" }>;

    expect(datasets).toHaveLength(1);
    expect(datasets[0].role).toBe("single");
    expect(datasets[0].companyName).toBe("NOMIK HOTELS S.A.S.");
    expect(datasets[0].accounts.find((a) => a.code === "4")?.values[0]).toBe(100);
    expect(datasets[0].accounts.find((a) => a.code === "4")?.values[2]).toBe(150);
    expect(meta.loadedMonthsByYear).toEqual({ 2026: [0, 2] });
  });

  it("keeps an adjustment marked as an adjustment after the round-trip", async () => {
    const dataset = singleDataset("s1", MONTHS);
    const edit: CellEdit = {
      datasetId: "s1",
      code: "4",
      monthIndex: 0,
      value: 999,
      comment: "Ajuste de enero",
      updatedAt: 1,
    };
    const workbook = buildPygWorkbook([{ dataset: dataset, edits: [edit] }], { 2026: [0] });
    const buffer = await toBuffer(workbook);
    const staged = resolveUpload("cualquier-nombre.xlsx", buffer) as Extract<
      StagedUpload,
      { kind: "workspace" }
    >;

    expect(staged.datasets[0].accounts.find((a) => a.code === "4")?.values[0]).toBe(0);
    const id = staged.datasets[0].id;
    const seeds = staged.commentsByDataset.find((c) => c.datasetId === id)?.comments;
    expect(seeds).toEqual([{ code: "4", monthIndex: 0, comment: "Ajuste de enero", value: 999 }]);
  });
});

describe("round-trip — el sistema de origen sobrevive al Excel de la app", () => {
  it("un workspace MicroPlus descargado y vuelto a cargar sigue siendo MicroPlus", async () => {
    const dataset = singleDataset("s1", MONTHS);
    const workbook = buildPygWorkbook(
      [{ dataset: dataset, edits: [] }],
      { 2026: [4] },
      "microplus",
    );
    const buffer = await toBuffer(workbook);

    const staged = resolveUpload("PyG HOSPITAL.xlsx", buffer);
    // Lo atiende la estrategia del libro de la app…
    expect(staged.kind).toBe("workspace");
    // …y el workspace reconstruido conserva `microplus` como sistema de origen.
    const { meta } = staged as Extract<StagedUpload, { kind: "workspace" }>;
    expect(meta.sourceSystemId).toBe("microplus");
  });

  it("un workspace del otro sistema conserva el suyo", async () => {
    const dataset = singleDataset("s1", MONTHS);
    const buffer = await toBuffer(
      buildPygWorkbook([{ dataset: dataset, edits: [] }], { 2026: [0] }, "monthly-single"),
    );
    const staged = resolveUpload("x.xlsx", buffer) as Extract<StagedUpload, { kind: "workspace" }>;
    expect(staged.meta.sourceSystemId).toBe("monthly-single");
  });

  it("el Excel completo por centros conserva su sistema", async () => {
    const norte = center("norte", "SUCURSAL NORTE", 0, 100);
    const buffer = await toBuffer(
      buildMultiCenterWorkbook({
        companyName: "HOTELERA ANDES S.A.",
        loadedMonthsByYear: { 2026: [0] },
        centers: [{ dataset: norte, edits: [] }],
      }),
    );
    const staged = resolveUpload("PyG-2026-completo.xlsx", buffer) as Extract<
      StagedUpload,
      { kind: "workspace" }
    >;
    expect(staged.meta.sourceSystemId).toBe("monthly-centers");
  });
});

describe("round-trip — a segmented state", () => {
  /** 5 with its subtree 5.2, already segmented: root 6 in zeros, as left by `segmentWorkspace`. */
  function segmented(id: string): PygDataset {
    const at = (value: number): number[] => [...MONTHS].map((_, i) => (i === 0 ? value : 0));
    return {
      ...singleDataset(id, MONTHS),
      accounts: segmentAccounts([
        { code: "4", name: "Ingresos", values: at(5000) },
        { code: "5", name: "Costos y Gastos", values: at(1000) },
        { code: "5.2", name: "Gastos", values: at(1000) },
        { code: "5.2.1", name: "Servicios", values: at(1000) },
      ]),
    };
  }

  /** What the user writes when reclassifying 300 as non-operational: the pair 6.1 / 5.2.1. */
  const reclassification = (id: string): CellEdit[] => [
    { datasetId: id, code: "6.1", monthIndex: 0, value: 300, updatedAt: 1 },
    { datasetId: id, code: "5.2.1", monthIndex: 0, value: 700, updatedAt: 1 },
  ];

  function seedsAsEdits(staged: Extract<StagedUpload, { kind: "workspace" }>): CellEdit[] {
    const datasetId = staged.datasets[0].id;
    const seeds = staged.commentsByDataset.find((c) => c.datasetId === datasetId)?.comments ?? [];
    return seeds.map((seed) => ({ datasetId, ...seed, updatedAt: 1 }));
  }

  /** Each row of the Income Statement in January, including summary rows (by their `resultKind`). */
  function januaryByRow(dataset: PygDataset, edits: CellEdit[]): Record<string, number> {
    const out: Record<string, number> = {};
    const walk = (rows: DatosRow[]): void => {
      for (const row of rows) {
        out[row.code || `#${row.resultKind}`] = row.cells[0]?.value ?? 0;
        if (row.children) {
          walk(row.children);
        }
      }
    };
    walk(toDatosGrid(dataset, edits, "mensual").rows);
    return out;
  }

  it("single state: reclassification to section 6 survives download and reload", async () => {
    const dataset = segmented("s1");
    const edits = reclassification("s1");
    const before = januaryByRow(dataset, edits);
    expect(before["6.1"]).toBe(300);
    expect(before["#no-operacional"]).toBe(300);

    const buffer = await toBuffer(
      buildPygWorkbook([{ dataset: dataset, edits: edits }], { 2026: [0] }, "monthly-single"),
    );
    const staged = resolveUpload("PyG NOMIK.xlsx", buffer) as Extract<
      StagedUpload,
      { kind: "workspace" }
    >;

    // Section 6 returns complete: its accounts are still there...
    expect(staged.datasets[0].accounts.map((a) => a.code)).toEqual([
      "4",
      "5",
      "5.2",
      "5.2.1",
      "6",
      "6.1",
    ]);
    // ...and the base remains as in the file (6 in zeros), with the amount in the edit.
    expect(staged.datasets[0].accounts.find((a) => a.code === "6.1")?.values[0]).toBe(0);
    expect(januaryByRow(staged.datasets[0], seedsAsEdits(staged))).toEqual(before);
  });

  it("by centers: each center recovers its own reclassification", async () => {
    const norte: PygDataset = {
      ...segmented("norte"),
      role: "center",
      centerId: slugifyCenter("SUCURSAL NORTE"),
      centerColor: "#000",
      order: 0,
      costCenterName: "SUCURSAL NORTE",
    };
    const edits = reclassification("norte");
    const before = januaryByRow(norte, edits);

    const buffer = await toBuffer(
      buildMultiCenterWorkbook({
        companyName: "NOMIK HOTELS S.A.S.",
        loadedMonthsByYear: { 2026: [0] },
        centers: [{ dataset: norte, edits }],
      }),
    );
    const staged = resolveUpload(multiCenterFilename([2026]), buffer) as Extract<
      StagedUpload,
      { kind: "workspace" }
    >;

    expect(staged.datasets[0].accounts.find((a) => a.code === "6.1")?.values[0]).toBe(0);
    expect(januaryByRow(staged.datasets[0], seedsAsEdits(staged))).toEqual(before);
  });
});

describe("round-trip — un mes en crudo (estado único)", () => {
  it("re-enters through la estrategia de estado único mensual y reescribe el mes", async () => {
    const values = [...MONTHS];
    values[5] = 400; // Junio
    const dataset = singleDataset("s1", values);
    const workbook = buildSingleMonthSliceWorkbook({
      companyName: "NOMIK HOTELS S.A.S.",
      year: 2026,
      month: 5,
      dataset,
      edits: [],
    });
    const buffer = await toBuffer(workbook);
    const fileName = monthSliceFilename(2026, 5);
    expect(fileName).toBe("PyG-2026-06-liderboard.xlsx");

    const staged = resolveUpload(fileName, buffer);
    expect(staged.kind).toBe("month-slice");
    const slice = staged as Extract<StagedUpload, { kind: "month-slice" }>;
    expect(slice.mode).toBe("single");
    expect(slice.year).toBe(2026);
    expect(slice.month).toBe(5);
    expect(slice.centers[0].centerId).toBeNull();
    expect(slice.centers[0].accounts.find((a) => a.code === "4")?.values).toEqual([400]);
  });
});

describe("round-trip — «Ocultar cuentas en cero»", () => {
  /** Un centro con dos cuentas: «4» se mueve, «5» no la usó nadie. */
  function withUnused(id: string, name: string, order: number, generalValue: number): PygDataset {
    const base = center(id, name, order, generalValue);
    return {
      ...base,
      accounts: [...base.accounts, { code: "5", name: "Costos y Gastos", values: [...MONTHS] }],
    };
  }

  it("el archivo recortado vuelve a entrar y devuelve lo que sí lleva", async () => {
    const workbook = buildMultiCenterWorkbook({
      companyName: "HOTELERA ANDES S.A.",
      loadedMonthsByYear: { 2026: [0, 2] },
      hideEmpty: true,
      centers: [
        { dataset: withUnused("norte", "SUCURSAL NORTE", 0, 700), edits: [] },
        { dataset: withUnused("sur", "SUCURSAL SUR", 1, 80), edits: [] },
      ],
    });
    const staged = resolveUpload(multiCenterFilename([2026]), await toBuffer(workbook));
    const { datasets, meta } = staged as Extract<StagedUpload, { kind: "workspace" }>;

    expect(datasets).toHaveLength(2);
    for (const dataset of datasets) {
      expect(dataset.accounts.map((a) => a.code)).toEqual(["4"]);
    }
    expect(datasets.find((d) => d.costCenterName === "SUCURSAL NORTE")?.accounts[0].values[0]).toBe(
      700,
    );
    expect(meta.loadedMonthsByYear).toEqual({ 2026: [0, 2] });
  });

  it("una cuenta en cero con comentario sobrevive al viaje y recupera su nota", async () => {
    // Es la razón por la que «anotada ≠ en cero»: sin la excepción, el comentario de la hoja de
    // metadatos apuntaría a una fila que el archivo ya no lleva.
    const comment: CellEdit[] = [
      { datasetId: "norte", code: "5", monthIndex: 0, comment: "Cerrada este año", updatedAt: 1 },
    ];
    const workbook = buildMultiCenterWorkbook({
      companyName: "HOTELERA ANDES S.A.",
      loadedMonthsByYear: { 2026: [0, 2] },
      hideEmpty: true,
      centers: [
        { dataset: withUnused("norte", "SUCURSAL NORTE", 0, 700), edits: comment },
        { dataset: withUnused("sur", "SUCURSAL SUR", 1, 80), edits: [] },
      ],
    });
    const staged = resolveUpload(multiCenterFilename([2026]), await toBuffer(workbook));
    const { datasets, commentsByDataset } = staged as Extract<StagedUpload, { kind: "workspace" }>;

    const norte = datasets.find((d) => d.costCenterName === "SUCURSAL NORTE");
    expect(norte?.accounts.map((a) => a.code)).toEqual(["4", "5"]);
    const seeds = commentsByDataset.find((c) => c.datasetId === norte?.id)?.comments ?? [];
    expect(seeds).toContainEqual(
      expect.objectContaining({ code: "5", monthIndex: 0, comment: "Cerrada este año" }),
    );
  });

  it("el estado único recortado también vuelve a entrar", async () => {
    const dataset: PygDataset = {
      ...singleDataset("solo", [500, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
      accounts: [
        { code: "4", name: "Ingresos", values: [500, ...MONTHS.slice(1)] },
        { code: "5", name: "Costos y Gastos", values: [...MONTHS] },
      ],
    };
    const workbook = buildPygWorkbook([{ dataset, edits: [] }], { 2026: [0] }, undefined, true);
    const staged = resolveUpload("PyG NOMIK 2026.xlsx", await toBuffer(workbook));
    const { datasets } = staged as Extract<StagedUpload, { kind: "workspace" }>;

    expect(datasets).toHaveLength(1);
    expect(datasets[0].accounts.map((a) => a.code)).toEqual(["4"]);
    expect(datasets[0].accounts[0].values[0]).toBe(500);
  });
});

describe("round-trip — meses ocultos", () => {
  it("un libro sin los meses vacíos devuelve los valores en su mes correcto", async () => {
    // `app-workbook.ts` mapea los meses POR RÓTULO de cabecera, no por posición, así que quitar
    // columnas no descoloca nada: enero sigue siendo enero aunque febrero no esté.
    const workbook = buildMultiCenterWorkbook({
      companyName: "HOTELERA ANDES S.A.",
      loadedMonthsByYear: { 2026: [0, 2] },
      hideEmpty: true,
      centers: [
        { dataset: center("norte", "SUCURSAL NORTE", 0, 100), edits: [] },
        { dataset: center("sur", "SUCURSAL SUR", 1, 40), edits: [] },
      ],
    });
    const staged = resolveUpload(multiCenterFilename([2026]), await toBuffer(workbook));
    const { datasets, meta } = staged as Extract<StagedUpload, { kind: "workspace" }>;

    const norte = datasets.find((d) => d.costCenterName === "SUCURSAL NORTE");
    const values = norte?.accounts.find((a) => a.code === "4")?.values;
    expect(values?.[0]).toBe(100); // Enero, escrito
    expect(values?.[2]).toBe(150); // Marzo, escrito
    expect(values?.[1]).toBe(0); // Febrero, ausente del archivo → cero
    expect(values).toHaveLength(12);
    // Y la cobertura sigue viniendo de la hoja de metadatos, no de qué columnas se escribieron:
    // un mes cargado que no vendió nada vuelve como CARGADO y en cero, no como nunca cargado.
    expect(meta.loadedMonthsByYear).toEqual({ 2026: [0, 2] });
  });
});

describe("round-trip — con el membrete del cliente", () => {
  /** Un PNG de 1×1 real: exceljs lo mete en el zip de verdad, así que el libro que se relee es
   *  exactamente el que se descarga. */
  const LOGO = {
    dataUrl:
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    mime: "image/png" as const,
    width: 640,
    height: 160,
  };

  const workspace = (logo?: typeof LOGO) => ({
    companyName: "HOTELERA ANDES S.A.",
    loadedMonthsByYear: { 2026: [0, 2] },
    centers: [
      { dataset: center("norte", "SUCURSAL NORTE", 0, 100), edits: [] },
      { dataset: center("sur", "SUCURSAL SUR", 1, 40), edits: [] },
    ],
    ...(logo ? { logo } : {}),
  });

  /**
   * El riesgo entero del membrete en una prueba: el libro se vuelve a leer con SheetJS, que ignora
   * las imágenes flotantes, y la razón social se busca en la primera celda no vacía de la COLUMNA
   * A. Si el logo desplazara una fila o aterrizara en esa columna, esto se cae.
   */
  it("un libro con logo vuelve a entrar EXACTAMENTE igual que uno sin logo", async () => {
    const sinLogo = buildMultiCenterWorkbook(workspace());
    const conLogo = buildMultiCenterWorkbook(workspace(LOGO));

    const name = multiCenterFilename([2026]);
    const a = resolveUpload(name, await toBuffer(sinLogo)) as Extract<
      StagedUpload,
      { kind: "workspace" }
    >;
    const b = resolveUpload(name, await toBuffer(conLogo)) as Extract<
      StagedUpload,
      { kind: "workspace" }
    >;

    // Las mismas cuentas, los mismos valores, la misma cobertura y la misma razón social.
    expect(b.meta).toEqual(a.meta);
    expect(b.datasets.map((d) => ({ ...d, id: "", uploadedAt: 0 }))).toEqual(
      a.datasets.map((d) => ({ ...d, id: "", uploadedAt: 0 })),
    );
    expect(b.datasets[0]?.companyName).toBe("HOTELERA ANDES S.A.");
  });

  it("las notas de celda sobreviven al desplazamiento de filas", async () => {
    // `spliceRows` mueve filas ya escritas, y en ellas viajan los comentarios y el «Valor original»
    // de cada ajuste. Si se perdieran, el libro descargado dejaría de explicar sus propias cifras.
    const conNota = buildMultiCenterWorkbook({
      ...workspace(LOGO),
      centers: [
        {
          dataset: center("norte", "SUCURSAL NORTE", 0, 100),
          edits: [
            {
              datasetId: "norte",
              code: "4",
              monthIndex: 0,
              value: 175,
              comment: "Ajuste de enero",
              updatedAt: 1,
            },
          ],
        },
      ],
    });
    const notes: string[] = [];
    for (const ws of conNota.worksheets) {
      ws.eachRow((row) => {
        row.eachCell({ includeEmpty: false }, (cellRef) => {
          if (cellRef.note) {
            notes.push(JSON.stringify(cellRef.note));
          }
        });
      });
    }
    expect(notes.join(" ")).toContain("Ajuste de enero");
  });

  it("sin logo el libro no embebe ninguna imagen", async () => {
    const wb = buildMultiCenterWorkbook(workspace());
    expect(wb.model.media ?? []).toHaveLength(0);
  });

  it("embebe la imagen UNA vez y la ancla en cada hoja visible", async () => {
    const wb = buildMultiCenterWorkbook(workspace(LOGO));

    // Un solo medio para las tres hojas visibles (Consolidado + dos centros).
    expect(wb.model.media).toHaveLength(1);
    const visible = wb.worksheets.filter((ws) => ws.state !== "veryHidden");
    expect(visible.length).toBeGreaterThan(1);
    for (const ws of visible) {
      expect(ws.getImages()).toHaveLength(1);
    }
    // La hoja de metadatos va oculta y no la lee nadie: no lleva membrete.
    for (const ws of wb.worksheets.filter((w) => w.state === "veryHidden")) {
      expect(ws.getImages()).toHaveLength(0);
    }
  });
});
