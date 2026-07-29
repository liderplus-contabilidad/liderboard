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
function center(id: string, name: string, order: number, generalValue: number): PygDataset {
  const values = [...MONTHS];
  values[0] = generalValue; // Enero
  values[2] = generalValue + 50; // Marzo
  return {
    id,
    fileName: "x.xlsx",
    uploadedAt: 0,
    companyName: "HOTELERA ANDES S.A.",
    periodLabel: "Ene–Dic 2026",
    year: 2026,
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

describe("round-trip — Excel completo", () => {
  it("re-enters as an equivalent workspace: centers, values, loadedMonths", async () => {
    const norte = center("norte", "SUCURSAL NORTE", 0, 100);
    const sur = center("sur", "SUCURSAL SUR", 1, 40);
    const workbook = buildMultiCenterWorkbook({
      companyName: "HOTELERA ANDES S.A.",
      year: 2026,
      loadedMonths: [0, 2],
      centers: [
        { dataset: norte, edits: [] },
        { dataset: sur, edits: [] },
      ],
    });
    const buffer = await toBuffer(workbook);
    const fileName = multiCenterFilename(2026);
    expect(fileName).toBe("PyG-2026-completo.xlsx");
    const staged = resolveUpload(fileName, buffer);
    expect(staged.kind).toBe("workspace");
    const { datasets, meta } = staged as Extract<StagedUpload, { kind: "workspace" }>;

    expect(datasets.map((d) => d.costCenterName)).toEqual(["SUCURSAL NORTE", "SUCURSAL SUR"]);
    expect(datasets[0].accounts.find((a) => a.code === "4")?.values[0]).toBe(100);
    expect(datasets[0].accounts.find((a) => a.code === "4")?.values[2]).toBe(150);
    expect(datasets[1].accounts.find((a) => a.code === "4")?.values[0]).toBe(40);
    expect(meta.loadedMonths).toEqual([0, 2]);
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
      year: 2026,
      loadedMonths: [0],
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
      year: 2026,
      loadedMonths: [0],
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
    const workbook = buildPygWorkbook(dataset, [], [0, 2]);
    const buffer = await toBuffer(workbook);
    const staged = resolveUpload("cualquier-nombre.xlsx", buffer);
    expect(staged.kind).toBe("workspace");
    const { datasets, meta } = staged as Extract<StagedUpload, { kind: "workspace" }>;

    expect(datasets).toHaveLength(1);
    expect(datasets[0].role).toBe("single");
    expect(datasets[0].companyName).toBe("NOMIK HOTELS S.A.S.");
    expect(datasets[0].accounts.find((a) => a.code === "4")?.values[0]).toBe(100);
    expect(datasets[0].accounts.find((a) => a.code === "4")?.values[2]).toBe(150);
    expect(meta.loadedMonths).toEqual([0, 2]);
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
    const workbook = buildPygWorkbook(dataset, [edit], [0]);
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
    const workbook = buildPygWorkbook(dataset, [], [4], "microplus");
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
    const buffer = await toBuffer(buildPygWorkbook(dataset, [], [0], "monthly-single"));
    const staged = resolveUpload("x.xlsx", buffer) as Extract<StagedUpload, { kind: "workspace" }>;
    expect(staged.meta.sourceSystemId).toBe("monthly-single");
  });

  it("el Excel completo por centros conserva su sistema", async () => {
    const norte = center("norte", "SUCURSAL NORTE", 0, 100);
    const buffer = await toBuffer(
      buildMultiCenterWorkbook({
        companyName: "HOTELERA ANDES S.A.",
        year: 2026,
        loadedMonths: [0],
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

    const buffer = await toBuffer(buildPygWorkbook(dataset, edits, [0], "monthly-single"));
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
        year: 2026,
        loadedMonths: [0],
        centers: [{ dataset: norte, edits }],
      }),
    );
    const staged = resolveUpload(multiCenterFilename(2026), buffer) as Extract<
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
