import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { APP_WORKBOOK_META_SHEET, rowsToAppWorkbookMeta } from "./excel-metadata";
import { buildMultiCenterWorkbook, buildPygWorkbook, pygExportFilename } from "./export";
import { MONTHLY_ACCOUNTS } from "./parse.fixtures";
import type { AccountRow, CellEdit, PygDataset } from "./types";

function buildDataset(
  id: string,
  accounts: AccountRow[],
  overrides: Partial<PygDataset> = {},
): PygDataset {
  return {
    id,
    fileName: "reporte.xlsx",
    uploadedAt: 0,
    companyName: "HOTELERA ANDES S.A.",
    periodLabel: "Ene–Dic 2026",
    year: 2026,
    baseFrequency: "mensual",
    role: "single",
    accounts: accounts.map((a) => ({ ...a, values: [...a.values] })),
    resultFromFile: [],
    warnings: [],
    ...overrides,
  };
}

function months(...values: number[]): number[] {
  return Array.from({ length: 12 }, (_, i) => values[i] ?? 0);
}

const dataset = buildDataset("reporte", MONTHLY_ACCOUNTS);
const norte = buildDataset("norte", MONTHLY_ACCOUNTS, { costCenterName: "SUCURSAL NORTE" });
const SUR_ACCOUNTS: AccountRow[] = [
  { code: "4", name: "Ingresos", values: months(30, 20) },
  { code: "4.1", name: "Ventas", values: months(30, 20) },
  { code: "4.1.1", name: "Ventas Habitaciones", values: months(30, 20) },
  { code: "5", name: "Costos y Gastos", values: months(10) },
  { code: "5.1", name: "Gastos Operativos", values: months(10) },
  { code: "5.1.1", name: "Sueldos", values: months(10) },
];
const sur = buildDataset("sur", SUR_ACCOUNTS, { costCenterName: "SUCURSAL SUR" });

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
  it("writes the edited values, not the file's original ones", async () => {
    const ws = await reload(buildPygWorkbook(dataset, edits));
    let habitacionesEnero: unknown;
    let sueldosEnero: unknown;
    ws.eachRow((row) => {
      const code = String(row.getCell(1).value ?? "");
      if (code === "4.1.1") habitacionesEnero = row.getCell(3).value;
      if (code === "5.1.1") sueldosEnero = row.getCell(3).value;
    });
    expect(habitacionesEnero).toBe(150);
    expect(sueldosEnero).toBe(90);
  });
});

describe("buildPygWorkbook — metadata sheet", () => {
  it("writes mode, year, comments and value adjustments for the round-trip", async () => {
    const wb = buildPygWorkbook(dataset, edits, [0, 1]);
    const buffer = await wb.xlsx.writeBuffer();
    const workbook = XLSX.read(buffer as unknown as ArrayBuffer);
    const rows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[APP_WORKBOOK_META_SHEET], {
      header: 1,
      raw: true,
      defval: null,
    });
    const meta = rowsToAppWorkbookMeta(rows);

    expect(meta.mode).toBe("single");
    expect(meta.year).toBe(2026);
    expect(meta.loadedMonths).toEqual([0, 1]);
    expect(meta.comments).toContainEqual(
      expect.objectContaining({ code: "4.1.1", monthIndex: 0, comment: "Ajuste de enero" }),
    );
    expect(meta.comments).toContainEqual(
      expect.objectContaining({ code: "4", monthIndex: 1, comment: "Revisar febrero" }),
    );
    expect(meta.adjustments).toContainEqual(
      expect.objectContaining({ code: "4.1.1", monthIndex: 0, originalValue: 100 }),
    );
    expect(meta.adjustments).toContainEqual(
      expect.objectContaining({ code: "5.1.1", monthIndex: 0, originalValue: 80 }),
    );
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
