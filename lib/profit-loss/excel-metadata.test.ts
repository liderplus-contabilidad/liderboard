import { describe, expect, it } from "vitest";
import {
  APP_WORKBOOK_META_SHEET,
  appWorkbookMetaToRows,
  rowsToAppWorkbookMeta,
  SINGLE_WORKBOOK_CENTER_KEY,
  type AppWorkbookMeta,
} from "./excel-metadata";

describe("excel-metadata", () => {
  it("exposes a stable, non-empty sheet name", () => {
    expect(APP_WORKBOOK_META_SHEET).toBeTruthy();
  });

  it("uses a fixed, empty centerId for the single-mode workbook's one slot", () => {
    expect(SINGLE_WORKBOOK_CENTER_KEY).toBe("");
  });

  it("round-trips every year's coverage, the sheet map and the mode", () => {
    const meta: AppWorkbookMeta = {
      years: [
        { year: 2025, loadedMonths: [0, 2, 5] },
        { year: 2026, loadedMonths: [0] },
      ],
      sheets: [
        { sheetName: "Estado de Resultados 2025", year: 2025, centerId: "" },
        { sheetName: "Estado de Resultados 2026", year: 2026, centerId: "" },
      ],
      mode: "single",
      system: "microplus",
      comments: [],
      adjustments: [],
    };
    expect(rowsToAppWorkbookMeta(appWorkbookMetaToRows(meta))).toEqual(meta);
  });

  it("una hoja se ata a su año por la metadata, no por su nombre", () => {
    // The sheet name is truncated to 31 characters and disambiguated, so it cannot be the record of
    // which year it belongs to.
    const meta: AppWorkbookMeta = {
      years: [{ year: 2025, loadedMonths: [0] }],
      sheets: [{ sheetName: "UN NOMBRE LARGUISIMO QUE SE (2)", year: 2025, centerId: "cartago" }],
      mode: "centers",
      system: "monthly-centers",
      comments: [],
      adjustments: [],
    };
    const read = rowsToAppWorkbookMeta(appWorkbookMetaToRows(meta));
    expect(read.sheets[0]).toEqual({
      sheetName: "UN NOMBRE LARGUISIMO QUE SE (2)",
      year: 2025,
      centerId: "cartago",
    });
  });

  it("round-trips comments and adjustments tagged by centerId AND year", () => {
    const meta: AppWorkbookMeta = {
      years: [{ year: 2026, loadedMonths: [0] }],
      sheets: [{ sheetName: "SUCURSAL NORTE", year: 2026, centerId: "sucursal-norte" }],
      mode: "centers",
      system: "monthly-centers",
      comments: [
        {
          centerId: "sucursal-norte",
          year: 2026,
          code: "4.1.1",
          monthIndex: 0,
          comment: "Ajuste de enero",
        },
      ],
      adjustments: [
        {
          centerId: "sucursal-norte",
          year: 2026,
          code: "4.1.1",
          monthIndex: 0,
          originalValue: 100,
        },
      ],
    };
    expect(rowsToAppWorkbookMeta(appWorkbookMetaToRows(meta))).toEqual(meta);
  });

  it("el mismo centro y mes de dos años son dos ajustes distintos", () => {
    const meta: AppWorkbookMeta = {
      years: [
        { year: 2025, loadedMonths: [0] },
        { year: 2026, loadedMonths: [0] },
      ],
      sheets: [],
      mode: "centers",
      system: "monthly-centers",
      comments: [],
      adjustments: [
        { centerId: "cartago", year: 2025, code: "4", monthIndex: 0, originalValue: 100 },
        { centerId: "cartago", year: 2026, code: "4", monthIndex: 0, originalValue: 700 },
      ],
    };
    expect(rowsToAppWorkbookMeta(appWorkbookMetaToRows(meta)).adjustments).toHaveLength(2);
  });

  it("defaults to centers mode and no years when the workspace row is missing", () => {
    expect(rowsToAppWorkbookMeta([])).toEqual({
      years: [],
      sheets: [],
      mode: "centers",
      // A workbook from before the system was carried can only have come out of the single statement.
      system: "monthly-single",
      comments: [],
      adjustments: [],
    });
  });

  it("un libro sin la columna de sistema adopta el de estado único", () => {
    expect(rowsToAppWorkbookMeta([["workspace", "single"]]).system).toBe("monthly-single");
  });

  it("drops malformed comment and adjustment rows", () => {
    const rows: unknown[][] = [
      ["workspace", "single", "monthly-single"],
      ["comment", "", 2026, "4", "x", "non-numeric month"], // monthIndex not a number → dropped
      ["adjustment", "", 2026, "4", 0], // missing originalValue → dropped
    ];
    const meta = rowsToAppWorkbookMeta(rows);
    expect(meta.comments).toEqual([]);
    expect(meta.adjustments).toEqual([]);
  });
});
