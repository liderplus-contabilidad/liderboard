import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { buildMultiCenterWorkbook, buildPygWorkbook, pygExportFilename } from "./export";
import { parsePygWorkbook } from "./parse";
import { aoaToXlsxBuffer, MONTHLY_AOA, SUCURSAL_AOA, SUCURSAL_SUR_AOA } from "./parse.fixtures";
import type { CellEdit } from "./types";

const { dataset } = parsePygWorkbook(aoaToXlsxBuffer(MONTHLY_AOA), "reporte.xlsx");
const norte = parsePygWorkbook(aoaToXlsxBuffer(SUCURSAL_AOA), "norte.xls").dataset;
const sur = parsePygWorkbook(aoaToXlsxBuffer(SUCURSAL_SUR_AOA), "sur.xls").dataset;

/** Leaf edit (with comment), parent comment-only, and a leaf edit without a comment. */
const edits: CellEdit[] = [
  {
    datasetId: dataset.id,
    code: "4.1.1",
    monthIndex: 0,
    value: 150,
    comment: "Ajuste de enero",
    updatedAt: 1,
  },
  { datasetId: dataset.id, code: "4", monthIndex: 1, comment: "Revisar febrero", updatedAt: 1 },
  { datasetId: dataset.id, code: "5.1.1", monthIndex: 0, value: 90, updatedAt: 1 },
];

async function reload(wb: ExcelJS.Workbook): Promise<ExcelJS.Worksheet> {
  const buffer = await wb.xlsx.writeBuffer();
  const reloaded = new ExcelJS.Workbook();
  await reloaded.xlsx.load(buffer);
  return reloaded.worksheets[0];
}

function noteText(note: ExcelJS.Comment | string | undefined): string {
  if (!note) return "";
  if (typeof note === "string") return note;
  return (note.texts ?? []).map((t) => t.text).join("");
}

function allNotes(ws: ExcelJS.Worksheet): string[] {
  const notes: string[] = [];
  ws.eachRow((row) => {
    row.eachCell({ includeEmpty: false }, (cell) => {
      if (cell.note) notes.push(noteText(cell.note));
    });
  });
  return notes;
}

describe("buildPygWorkbook — value round-trip", () => {
  it("re-parses with the edited values and no sum mismatch", async () => {
    const wb = buildPygWorkbook(dataset, edits);
    const buffer = await wb.xlsx.writeBuffer();
    const { dataset: reparsed } = parsePygWorkbook(buffer as unknown as ArrayBuffer, "re.xlsx");

    expect(reparsed.accounts.find((a) => a.code === "4.1.1")?.values[0]).toBe(150);
    expect(reparsed.accounts.find((a) => a.code === "5.1.1")?.values[0]).toBe(90);
    // Parents and result were exported from the edited leaves, so nothing descuadra.
    expect(reparsed.warnings).toEqual([]);
  });
});

describe("buildPygWorkbook — comment round-trip", () => {
  it("restores comments (leaf and parent) from the metadata sheet", async () => {
    const wb = buildPygWorkbook(dataset, edits);
    const buffer = await wb.xlsx.writeBuffer();
    const { comments } = parsePygWorkbook(buffer as unknown as ArrayBuffer, "re.xlsx");

    expect(comments).toContainEqual({ code: "4.1.1", monthIndex: 0, comment: "Ajuste de enero" });
    expect(comments).toContainEqual({ code: "4", monthIndex: 1, comment: "Revisar febrero" });
  });
});

describe("buildPygWorkbook — cell notes", () => {
  it("annotates every edited cell with the original value, with or without a comment", async () => {
    const ws = await reload(buildPygWorkbook(dataset, edits));
    const notes = allNotes(ws);

    // Two value edits (4.1.1 and 5.1.1) → two "Valor original" annotations, incl. the
    // one without a user comment.
    expect(notes.filter((n) => n.includes("Valor original"))).toHaveLength(2);
    expect(notes.some((n) => n.includes("Ajuste de enero"))).toBe(true);
    expect(notes.some((n) => n.includes("Revisar febrero"))).toBe(true);
  });
});

describe("pygExportFilename", () => {
  it("derives a data filename from company and period", () => {
    const name = pygExportFilename(dataset);
    expect(name).toContain("HOTELERA ANDES S.A.");
    expect(name).toContain("Ene–Dic 2026");
    expect(name.endsWith(".xlsx")).toBe(true);
  });

  it("tolerates a missing dataset", () => {
    expect(pygExportFilename(undefined).endsWith(".xlsx")).toBe(true);
    expect(pygExportFilename(undefined)).toContain("LiderPlus");
  });
});

const ALL_MONTHS = Array.from({ length: 12 }, (_, i) => i);

describe("buildMultiCenterWorkbook", () => {
  it("emits a Consolidado sheet, one sheet per center, and Sin centro de costo as one more", () => {
    const sinCentro = {
      ...sur,
      id: "sin",
      role: "sin-centro" as const,
      costCenterName: "Sin centro de costo",
      accounts: [{ code: "4", name: "Ingresos", values: [7, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] }],
      resultFromFile: [],
    };
    const wb = buildMultiCenterWorkbook({
      companyName: "HOTELERA ANDES S.A.",
      year: 2026,
      loadedMonths: ALL_MONTHS,
      centers: [
        {
          dataset: { ...norte, role: "center" as const, costCenterName: "SUCURSAL NORTE" },
          edits: [],
        },
        { dataset: { ...sur, role: "center" as const, costCenterName: "SUCURSAL SUR" }, edits: [] },
        { dataset: sinCentro, edits: [] },
      ],
    });
    const names = wb.worksheets.map((w) => w.name);
    expect(names).toContain("Consolidado");
    expect(names).toContain("SUCURSAL NORTE");
    expect(names).toContain("SUCURSAL SUR");
    expect(names).toContain("Sin centro de costo");
  });

  it("builds the Consolidado sheet from EDITED center values, not the raw sum", () => {
    // "4.1.1" Enero is 100 in the raw fixture; edit it to 999 in NORTE.
    const edit: CellEdit = {
      datasetId: norte.id,
      code: "4.1.1",
      monthIndex: 0,
      value: 999,
      updatedAt: 1,
    };
    const wb = buildMultiCenterWorkbook({
      companyName: "X",
      year: 2026,
      loadedMonths: ALL_MONTHS,
      centers: [
        { dataset: { ...norte, role: "center" as const, costCenterName: "NORTE" }, edits: [edit] },
      ],
    });
    const ws = wb.getWorksheet("Consolidado");
    let enero: unknown;
    ws?.eachRow((row) => {
      if (String(row.getCell(1).value ?? "") === "4.1.1") {
        enero = row.getCell(3).value; // FIRST_VALUE_COL (Enero)
      }
    });
    expect(enero).toBe(999);
  });

  it("leaves unloaded months empty instead of 0", () => {
    const wb = buildMultiCenterWorkbook({
      companyName: "X",
      year: 2026,
      loadedMonths: [0, 1], // only Enero–Febrero loaded
      centers: [
        { dataset: { ...norte, role: "center" as const, costCenterName: "NORTE" }, edits: [] },
      ],
    });
    const ws = wb.getWorksheet("NORTE");
    let row4: ExcelJS.Row | undefined;
    ws?.eachRow((row) => {
      if (String(row.getCell(1).value ?? "") === "4") {
        row4 = row;
      }
    });
    expect(row4?.getCell(3).value ?? null).toBe(130); // Enero: loaded, from the fixture
    expect(row4?.getCell(5).value ?? null).toBeNull(); // Marzo: NOT loaded → empty, not 0
  });

  it("truncates and de-duplicates over-long / colliding sheet names", async () => {
    const long = "CENTRO CON UN NOMBRE EXTREMADAMENTE LARGO QUE SUPERA EL LIMITE";
    const wb = buildMultiCenterWorkbook({
      companyName: "X",
      year: 2026,
      loadedMonths: ALL_MONTHS,
      centers: [
        { dataset: { ...norte, costCenterName: long }, edits: [] },
        { dataset: { ...sur, costCenterName: long }, edits: [] },
      ],
    });
    for (const w of wb.worksheets) {
      expect(w.name.length).toBeLessThanOrEqual(31);
    }
    expect(new Set(wb.worksheets.map((w) => w.name)).size).toBe(wb.worksheets.length);
  });
});
