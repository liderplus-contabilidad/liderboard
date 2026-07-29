import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { APP_WORKBOOK_META_SHEET } from "../excel-metadata";
import { appWorkbookStrategy } from "./app-workbook";
import { buildCandidate } from "./registry";
import type { StagedUpload } from "./types";

const MONTH_HEADERS = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];

type Row = (string | number | null)[];

function statementSheet(values: number[]): Row[] {
  const total = values.reduce((sum, value) => sum + value, 0);
  return [
    ["HOTELERA ANDES S.A."],
    ["Estado de Resultados"],
    [null],
    [null, null, ...MONTH_HEADERS, "Total"],
    ["4", "Ingresos", ...values, total],
    [null, "Utilidad o Perdida", ...values, total],
  ];
}

function buildFixture(opts: {
  metaRows: (string | number)[][];
  norteValues: number[];
  sinCentroValues: number[];
}): ArrayBuffer {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet(statementSheet(opts.norteValues)),
    "Consolidado",
  );
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet(statementSheet(opts.norteValues)),
    "SUCURSAL NORTE",
  );
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet(statementSheet(opts.sinCentroValues)),
    "SIN CENTRO DE COSTO",
  );
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet(opts.metaRows),
    APP_WORKBOOK_META_SHEET,
  );
  return XLSX.write(workbook, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
}

const NORTE_VALUES = [150, 200, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
const SIN_CENTRO_VALUES = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];

describe("appWorkbookStrategy.detect", () => {
  it("matches a workbook that carries the hidden metadata sheet", () => {
    const buffer = buildFixture({
      metaRows: [["workspace", 2026, "0,1"]],
      norteValues: NORTE_VALUES,
      sinCentroValues: SIN_CENTRO_VALUES,
    });
    expect(appWorkbookStrategy.detect(buildCandidate("PyG-2026-completo.xlsx", buffer))).toBe(true);
  });
});

describe("appWorkbookStrategy.parse", () => {
  it("reconstructs centers (skipping Consolidado), year and loadedMonths", () => {
    const buffer = buildFixture({
      metaRows: [["workspace", 2026, "0,1"]],
      norteValues: NORTE_VALUES,
      sinCentroValues: SIN_CENTRO_VALUES,
    });
    const staged = appWorkbookStrategy.parse(buildCandidate("PyG-2026-completo.xlsx", buffer));
    expect(staged.kind).toBe("workspace");
    const { datasets, meta } = staged as Extract<StagedUpload, { kind: "workspace" }>;

    expect(datasets.map((d) => d.costCenterName)).toEqual([
      "SUCURSAL NORTE",
      "SIN CENTRO DE COSTO",
    ]);
    expect(datasets.map((d) => d.role)).toEqual(["center", "sin-centro"]);
    expect(datasets[0].accounts.find((a) => a.code === "4")?.values).toEqual(NORTE_VALUES);
    expect(datasets[0].year).toBe(2026);
    expect(meta.loadedMonths).toEqual([0, 1]);
    expect(meta.activeCenterId).toBe("consolidado");
  });

  it("merges a comment and an adjustment on the same cell into one edit seed", () => {
    const buffer = buildFixture({
      metaRows: [
        ["workspace", 2026, "0"],
        ["comment", "sucursal-norte", "4", 0, "Ajuste de enero"],
        ["adjustment", "sucursal-norte", "4", 0, 100],
      ],
      norteValues: NORTE_VALUES,
      sinCentroValues: SIN_CENTRO_VALUES,
    });
    const staged = appWorkbookStrategy.parse(buildCandidate("PyG-2026-completo.xlsx", buffer));
    const { datasets, commentsByDataset } = staged as Extract<StagedUpload, { kind: "workspace" }>;
    const norte = datasets.find((d) => d.costCenterName === "SUCURSAL NORTE");
    const seeds = commentsByDataset.find((c) => c.datasetId === norte?.id)?.comments;
    expect(seeds).toHaveLength(1);
    expect(norte?.accounts.find((a) => a.code === "4")?.values[0]).toBe(100);
    expect(seeds?.[0]).toEqual({
      code: "4",
      monthIndex: 0,
      comment: "Ajuste de enero",
      value: 150,
    });
  });

  it("produces a value-only seed when a cell has no textual comment", () => {
    const buffer = buildFixture({
      metaRows: [
        ["workspace", 2026, "0"],
        ["adjustment", "sucursal-norte", "4", 0, 100],
      ],
      norteValues: NORTE_VALUES,
      sinCentroValues: SIN_CENTRO_VALUES,
    });
    const staged = appWorkbookStrategy.parse(buildCandidate("PyG-2026-completo.xlsx", buffer));
    const { datasets, commentsByDataset } = staged as Extract<StagedUpload, { kind: "workspace" }>;
    const norte = datasets.find((d) => d.costCenterName === "SUCURSAL NORTE");
    const seeds = commentsByDataset.find((c) => c.datasetId === norte?.id)?.comments;
    expect(norte?.accounts.find((a) => a.code === "4")?.values[0]).toBe(100);
    expect(seeds).toEqual([{ code: "4", monthIndex: 0, comment: undefined, value: 150 }]);
  });
});
