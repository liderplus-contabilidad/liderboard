import { describe, expect, it } from "vitest";
import {
  buildMonthSliceWorkbook,
  buildMultiCenterWorkbook,
  monthSliceFilename,
  multiCenterFilename,
  workbookToBlob,
} from "../export";
import type { CellEdit, PygDataset } from "../types";
import { resolveUpload } from "./registry";
import type { StagedUpload } from "./types";
import { slugifyCenter } from "../workspace";

const MONTHS = Array.from({ length: 12 }, () => 0);

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

    // The visible sheet shows the ADJUSTED value...
    expect(staged.datasets[0].accounts.find((a) => a.code === "4")?.values[0]).toBe(100);
    // ...but the metadata restores the seed as a real edit (value + comment), not baked in.
    const norteId = staged.datasets[0].id;
    const seeds = staged.commentsByDataset.find((c) => c.datasetId === norteId)?.comments;
    expect(seeds).toEqual([{ code: "4", monthIndex: 0, comment: "Ajuste de enero", value: 100 }]);
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
    expect(slice.general.find((a) => a.code === "4")?.values).toEqual([140]); // GENERAL = Σ centers
  });
});

describe("round-trip — sin la hoja de metadatos", () => {
  it("falls back to the Consolidado sheet alone (its shape matches single-statement)", async () => {
    // Re-derive the SAME visible sheets via buildMultiCenterWorkbook, but strip the hidden
    // metadata sheet before re-uploading — losing the workspace-wide info (year/loadedMonths/
    // adjustments) is exactly what should happen when metadata never round-trips, and the
    // Consolidado sheet alone has the same shape `single-statement` already accepts.
    const norte = center("norte", "SUCURSAL NORTE", 0, 100);
    const workbook = buildMultiCenterWorkbook({
      companyName: "HOTELERA ANDES S.A.",
      year: 2026,
      loadedMonths: [0],
      centers: [{ dataset: norte, edits: [] }],
    });
    workbook.removeWorksheet(workbook.worksheets.find((w) => w.name.startsWith("_"))?.id ?? -1);
    const buffer = await toBuffer(workbook);
    const staged = resolveUpload("cualquier-nombre.xlsx", buffer);
    expect(staged.kind).toBe("single-statement");
  });
});
