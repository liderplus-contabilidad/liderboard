import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { sectionTone } from "./datos-sections";
import { APP_WORKBOOK_META_SHEET, rowsToAppWorkbookMeta } from "./excel-metadata";
import {
  buildMonthSliceWorkbook,
  buildMultiCenterWorkbook,
  buildPygWorkbook,
  buildSingleMonthSliceWorkbook,
  pygExportFilename,
} from "./export";
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
    const ws = await reload(buildPygWorkbook([{ dataset, edits }], { 2026: ALL_MONTHS }));
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

describe("buildPygWorkbook — currency format", () => {
  // The separators in a format code are placeholders Excel fills from the READER's locale, and
  // CLDR's Ecuador writes them backwards. Without the `[$$-409]` pin the file contradicts the
  // screen it was downloaded from, so the LCID is part of the contract, not a style choice.
  it("pins the amount cells to the en-US locale so the reader's region cannot flip them", async () => {
    const ws = await reload(buildPygWorkbook([{ dataset, edits }], { 2026: ALL_MONTHS }));
    const formats = new Set<string | undefined>();
    ws.eachRow((row) => {
      if (String(row.getCell(1).value ?? "").startsWith("4.1.1")) {
        formats.add(row.getCell(3).numFmt);
      }
    });

    expect(formats).toEqual(new Set(["[$$-409]#,##0.00;-[$$-409]#,##0.00"]));
  });
});

describe("buildPygWorkbook — metadata sheet", () => {
  it("writes mode, year, comments and value adjustments for the round-trip", async () => {
    const wb = buildPygWorkbook([{ dataset, edits }], { 2026: [0, 1] });
    const buffer = await wb.xlsx.writeBuffer();
    const workbook = XLSX.read(buffer as unknown as ArrayBuffer);
    const rows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[APP_WORKBOOK_META_SHEET], {
      header: 1,
      raw: true,
      defval: null,
    });
    const meta = rowsToAppWorkbookMeta(rows);

    expect(meta.mode).toBe("single");
    expect(meta.years).toEqual([{ year: 2026, loadedMonths: [0, 1] }]);
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
    const ws = await reload(buildPygWorkbook([{ dataset, edits }], { 2026: ALL_MONTHS }));
    const notes = allNotes(ws);

    // Two value edits (4.1.1 and 5.1.1) → two "Valor original" annotations, incl. the
    // one without a user comment.
    expect(notes.filter((n) => n.includes("Valor original"))).toHaveLength(2);
    expect(notes.some((n) => n.includes("Ajuste de enero"))).toBe(true);
    expect(notes.some((n) => n.includes("Revisar febrero"))).toBe(true);
  });
});

describe("colores de sección", () => {
  /** El ARGB del relleno de la fila cuyo código es `code`, o `undefined` si no lleva relleno. */
  function fillOf(ws: ExcelJS.Worksheet, code: string): string | undefined {
    let argb: string | undefined;
    ws.eachRow((row) => {
      if (String(row.getCell(1).value ?? "") !== code) return;
      const fill = row.getCell(1).fill;
      argb = fill?.type === "pattern" ? (fill.fgColor?.argb ?? undefined) : undefined;
    });
    return argb;
  }

  it("pinta la raíz con el tono pleno y el nivel 2 con el claro, como en Datos", async () => {
    const ws = await reload(buildPygWorkbook([{ dataset, edits }], { 2026: ALL_MONTHS }));
    expect(fillOf(ws, "4")).toBe(sectionTone("4", 1)?.argb);
    expect(fillOf(ws, "4.1")).toBe(sectionTone("4.1", 2)?.argb);
    expect(fillOf(ws, "5")).toBe(sectionTone("5", 1)?.argb);
    expect(fillOf(ws, "5.1")).toBe(sectionTone("5.1", 2)?.argb);
    // Y los dos bloques no se confunden entre sí en el archivo.
    expect(fillOf(ws, "4")).not.toBe(fillOf(ws, "5"));
  });

  it("del nivel 3 hacia dentro la hoja vuelve a ser blanca", async () => {
    const ws = await reload(buildPygWorkbook([{ dataset, edits }], { 2026: ALL_MONTHS }));
    expect(fillOf(ws, "4.1.1")).toBeUndefined();
    expect(fillOf(ws, "5.1.2.1")).toBeUndefined();
  });

  it("la fila de resultado no lleva tono: la cierra su propio borde", async () => {
    const ws = await reload(buildPygWorkbook([{ dataset, edits }], { 2026: ALL_MONTHS }));
    let resultado: ExcelJS.Row | undefined;
    ws.eachRow((row) => {
      if (String(row.getCell(2).value ?? "").startsWith("Utilidad")) resultado = row;
    });
    expect(resultado).toBeDefined();
    // Su raya superior le deja un `fill` vacío al releer; lo que importa es que no tiene color.
    const fill = resultado?.getCell(1).fill;
    expect(fill?.type === "pattern" ? fill.fgColor?.argb : undefined).toBeUndefined();
  });

  it("el tono cubre la fila entera, del código al Total", async () => {
    const ws = await reload(buildPygWorkbook([{ dataset, edits }], { 2026: ALL_MONTHS }));
    let raiz: ExcelJS.Row | undefined;
    ws.eachRow((row) => {
      if (String(row.getCell(1).value ?? "") === "4") raiz = row;
    });
    // 2 columnas de identificación + 12 meses + Total.
    for (let col = 1; col <= 15; col++) {
      const fill = raiz?.getCell(col).fill;
      expect(fill?.type === "pattern" ? fill.fgColor?.argb : undefined).toBe(
        sectionTone("4", 1)?.argb,
      );
    }
  });

  it("también llega a «un mes en crudo», que tiene su propio escritor", async () => {
    const porCentros = await reload(
      buildMonthSliceWorkbook({
        companyName: "HOTELERA ANDES S.A.",
        year: 2026,
        month: 0,
        centers: [{ name: "SUCURSAL NORTE", dataset: norte, edits: [] }],
      }),
    );
    expect(fillOf(porCentros, "4")).toBe(sectionTone("4", 1)?.argb);
    expect(fillOf(porCentros, "5.1")).toBe(sectionTone("5.1", 2)?.argb);
    expect(fillOf(porCentros, "5.1.1")).toBeUndefined();

    const unico = await reload(
      buildSingleMonthSliceWorkbook({
        companyName: "HOTELERA ANDES S.A.",
        year: 2026,
        month: 0,
        dataset,
        edits: [],
      }),
    );
    expect(fillOf(unico, "4")).toBe(sectionTone("4", 1)?.argb);
    expect(fillOf(unico, "4.1")).toBe(sectionTone("4.1", 2)?.argb);
  });

  it("también llega al «Excel completo», que comparte el mismo escritor", async () => {
    const wb = buildMultiCenterWorkbook({
      companyName: "HOTELERA ANDES S.A.",
      loadedMonthsByYear: { 2026: ALL_MONTHS },
      centers: [{ dataset: norte, edits: [] }],
    });
    const buffer = await wb.xlsx.writeBuffer();
    const reloaded = new ExcelJS.Workbook();
    await reloaded.xlsx.load(buffer);
    for (const ws of reloaded.worksheets.filter((s) => s.state !== "veryHidden")) {
      expect(fillOf(ws, "4")).toBe(sectionTone("4", 1)?.argb);
    }
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
      loadedMonthsByYear: { 2026: ALL_MONTHS },
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
      loadedMonthsByYear: { 2026: ALL_MONTHS },
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
      loadedMonthsByYear: { 2026: [0, 1] }, // only Enero–Febrero loaded
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
      loadedMonthsByYear: { 2026: ALL_MONTHS },
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

// ── «Ocultar cuentas en cero» ──────────────────────────────────────────────

/** A chart of accounts where "4.1.2" moves in one center only and "4.9" moves nowhere. */
const HIDE_PLAN: AccountRow[] = [
  { code: "4", name: "Ingresos", values: months() },
  { code: "4.1", name: "Ventas", values: months() },
  { code: "4.1.1", name: "Habitaciones", values: months(100) },
  { code: "4.1.2", name: "Eventos", values: months() },
  { code: "4.9", name: "Otros ingresos", values: months() },
  { code: "5", name: "Costos y Gastos", values: months() },
  { code: "5.1", name: "Sueldos", values: months(40) },
];

const plan = (overrides: Record<string, number[]> = {}): AccountRow[] =>
  HIDE_PLAN.map((a) => ({ ...a, values: overrides[a.code] ?? [...a.values] }));

const hideNorte = buildDataset("h-norte", plan(), {
  role: "center",
  centerId: "norte",
  costCenterName: "NORTE",
});
const hideSur = buildDataset("h-sur", plan({ "4.1.2": months(0, 55) }), {
  role: "center",
  centerId: "sur",
  costCenterName: "SUR",
});

/** Every account code written, per visible sheet (the hidden metadata sheet excluded). */
async function codesBySheet(wb: ExcelJS.Workbook): Promise<Map<string, string[]>> {
  const buffer = await wb.xlsx.writeBuffer();
  const reloaded = new ExcelJS.Workbook();
  await reloaded.xlsx.load(buffer);
  const out = new Map<string, string[]>();
  for (const ws of reloaded.worksheets) {
    if (ws.name === APP_WORKBOOK_META_SHEET) continue;
    const codes: string[] = [];
    ws.eachRow((row) => {
      const code = String(row.getCell(1).value ?? "");
      if (/^\d/.test(code)) codes.push(code);
    });
    out.set(ws.name, codes);
  }
  return out;
}

const multiCenter = (hideEmpty: boolean, edits: CellEdit[] = []) =>
  buildMultiCenterWorkbook({
    companyName: "HOTELERA ANDES S.A.",
    loadedMonthsByYear: { 2026: ALL_MONTHS },
    hideEmpty,
    centers: [
      { dataset: hideNorte, edits },
      { dataset: hideSur, edits: [] },
    ],
  });

describe("buildMultiCenterWorkbook — ocultar cuentas en cero", () => {
  it("writes the whole chart of accounts when the switch is off", async () => {
    const sheets = await codesBySheet(multiCenter(false));
    for (const codes of sheets.values()) {
      expect(codes).toContain("4.9");
    }
  });

  it("omits a code with no movement in ANY sheet", async () => {
    const sheets = await codesBySheet(multiCenter(true));
    expect(sheets.size).toBe(3); // Consolidado + NORTE + SUR
    for (const codes of sheets.values()) {
      expect(codes).not.toContain("4.9");
    }
  });

  it("keeps every sheet on the same chart of accounts", async () => {
    // "4.1.2" only moves in SUR. Judged sheet by sheet it would vanish from NORTE, and the two
    // would stop lining up; judged per workbook it stays everywhere, in NORTE with its zeros.
    const sheets = await codesBySheet(multiCenter(true));
    const written = [...sheets.values()];
    expect(written.every((codes) => codes.includes("4.1.2"))).toBe(true);
    expect(new Set(written.map((codes) => codes.join("|"))).size).toBe(1);
  });

  it("keeps a zero account that carries a comment", async () => {
    const commented: CellEdit[] = [
      {
        datasetId: hideNorte.id,
        code: "4.9",
        monthIndex: 2,
        comment: "Cerrada este año",
        updatedAt: 1,
      },
    ];
    const sheets = await codesBySheet(multiCenter(true, commented));
    for (const codes of sheets.values()) {
      expect(codes).toContain("4.9");
    }
  });

  it("leaves nothing the metadata sheet restores pointing at an absent row", async () => {
    const commented: CellEdit[] = [
      {
        datasetId: hideNorte.id,
        code: "4.9",
        monthIndex: 2,
        comment: "Cerrada este año",
        updatedAt: 1,
      },
      { datasetId: hideNorte.id, code: "5.1", monthIndex: 0, value: 12, updatedAt: 1 },
    ];
    const wb = multiCenter(true, commented);
    const buffer = await wb.xlsx.writeBuffer();
    const workbook = XLSX.read(buffer as unknown as ArrayBuffer);
    const meta = rowsToAppWorkbookMeta(
      XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[APP_WORKBOOK_META_SHEET], {
        header: 1,
        raw: true,
        defval: null,
      }),
    );
    const written = new Set([...(await codesBySheet(wb)).values()].flat());
    for (const entry of [...meta.comments, ...meta.adjustments]) {
      expect(written).toContain(entry.code);
    }
  });
});

describe("buildPygWorkbook — ocultar cuentas en cero", () => {
  const single = buildDataset("h-single", plan());

  it("omits the accounts with no movement in any year of the file", async () => {
    const sheets = await codesBySheet(
      buildPygWorkbook([{ dataset: single, edits: [] }], { 2026: ALL_MONTHS }, undefined, true),
    );
    const codes = [...sheets.values()].flat();
    expect(codes).not.toContain("4.9");
    expect(codes).not.toContain("4.1.2");
    expect(codes).toContain("4.1.1");
  });

  it("keeps an account whose zero was PRODUCED by an adjustment", async () => {
    // 70 en enero, ajustado a 0: la cuenta queda en cero de punta a punta. Omitirla perdería el
    // ajuste y su valor original, que es justo lo que el archivo tiene que poder devolver.
    const withOtros = buildDataset("h-single-adj", [
      ...plan(),
      { code: "5.9", name: "Multas", values: months(70) },
    ]);
    const adjusted: CellEdit[] = [
      { datasetId: withOtros.id, code: "5.9", monthIndex: 0, value: 0, updatedAt: 1 },
    ];
    const sheets = await codesBySheet(
      buildPygWorkbook(
        [{ dataset: withOtros, edits: adjusted }],
        { 2026: ALL_MONTHS },
        undefined,
        true,
      ),
    );
    const codes = [...sheets.values()].flat();
    expect(codes).toContain("5.9");
    expect(codes).not.toContain("4.9");
  });

  it("keeps a year's accounts alive when another year moves them", async () => {
    const y2025 = buildDataset("h-single-2025", plan({ "4.1.2": months(0, 0, 12) }), {
      year: 2025,
    });
    const sheets = await codesBySheet(
      buildPygWorkbook(
        [
          { dataset: y2025, edits: [] },
          { dataset: single, edits: [] },
        ],
        { 2025: ALL_MONTHS, 2026: ALL_MONTHS },
        undefined,
        true,
      ),
    );
    expect(sheets.size).toBe(2);
    for (const codes of sheets.values()) {
      expect(codes).toContain("4.1.2");
      expect(codes).not.toContain("4.9");
    }
  });
});

/** The header labels of every visible sheet, in order. */
async function headersBySheet(wb: ExcelJS.Workbook): Promise<Map<string, string[]>> {
  const buffer = await wb.xlsx.writeBuffer();
  const reloaded = new ExcelJS.Workbook();
  await reloaded.xlsx.load(buffer);
  const out = new Map<string, string[]>();
  for (const ws of reloaded.worksheets) {
    if (ws.name === APP_WORKBOOK_META_SHEET) continue;
    let labels: string[] = [];
    ws.eachRow((row) => {
      const values = (row.values as unknown[]).slice(3).map((v) => String(v ?? ""));
      if (values[0] === "Enero" || values.includes("Total")) {
        if (labels.length === 0) labels = values.filter(Boolean);
      }
    });
    out.set(ws.name, labels);
  }
  return out;
}

describe("buildMultiCenterWorkbook — ocultar meses en cero", () => {
  // «4.1.1» mueve enero en NORTE y marzo en SUR; ningún otro mes se toca en ninguna hoja.
  const eneroNorte = buildDataset("m-norte", plan({ "4.1.1": months(100) }), {
    role: "center",
    centerId: "norte",
    costCenterName: "NORTE",
  });
  const marzoSur = buildDataset("m-sur", plan({ "4.1.1": months(0, 0, 60) }), {
    role: "center",
    centerId: "sur",
    costCenterName: "SUR",
  });
  const book = (hideEmpty: boolean) =>
    buildMultiCenterWorkbook({
      companyName: "HOTELERA ANDES S.A.",
      loadedMonthsByYear: { 2026: ALL_MONTHS },
      hideEmpty,
      centers: [
        { dataset: eneroNorte, edits: [] },
        { dataset: marzoSur, edits: [] },
      ],
    });

  it("writes the twelve months when the switch is off", async () => {
    for (const labels of (await headersBySheet(book(false))).values()) {
      expect(labels).toHaveLength(13); // doce meses + Total
    }
  });

  it("keeps a month that ANY sheet moved, and drops the rest", async () => {
    // Enero lo mueve NORTE y marzo lo mueve SUR: los dos sobreviven en LAS DOS hojas, así siguen
    // alineadas. Los otros diez no los movió nadie.
    for (const labels of (await headersBySheet(book(true))).values()) {
      expect(labels).toEqual(["Enero", "Marzo", "Total"]);
    }
  });

  it("leaves the Total unchanged, because a dropped month contributed zero", async () => {
    const totalOf = async (wb: ExcelJS.Workbook) => {
      const buffer = await wb.xlsx.writeBuffer();
      const reloaded = new ExcelJS.Workbook();
      await reloaded.xlsx.load(buffer);
      const ws = reloaded.worksheets.find((w) => w.name === "NORTE") as ExcelJS.Worksheet;
      let total: unknown;
      ws.eachRow((row) => {
        if (String(row.getCell(1).value ?? "") === "4.1.1") {
          total = row.getCell(row.cellCount).value;
        }
      });
      return total;
    };
    expect(await totalOf(book(true))).toBe(await totalOf(book(false)));
    expect(await totalOf(book(true))).toBe(100);
  });
});
