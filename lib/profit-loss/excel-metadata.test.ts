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

  it("round-trips year, loadedMonths and mode through the workspace row", () => {
    const meta: AppWorkbookMeta = {
      year: 2026,
      loadedMonths: [0, 2, 5],
      mode: "single",
      system: "microplus",
      comments: [],
      adjustments: [],
    };
    expect(rowsToAppWorkbookMeta(appWorkbookMetaToRows(meta))).toEqual(meta);
  });

  it("round-trips comments and adjustments tagged by centerId", () => {
    const meta: AppWorkbookMeta = {
      year: 2026,
      loadedMonths: [0],
      mode: "centers",
      system: "monthly-centers",
      comments: [
        { centerId: "sucursal-norte", code: "4.1.1", monthIndex: 0, comment: "Ajuste de enero" },
      ],
      adjustments: [
        { centerId: "sucursal-norte", code: "4.1.1", monthIndex: 0, originalValue: 100 },
      ],
    };
    expect(rowsToAppWorkbookMeta(appWorkbookMetaToRows(meta))).toEqual(meta);
  });

  it("defaults to centers mode and empty months when the workspace row is missing", () => {
    expect(rowsToAppWorkbookMeta([])).toEqual({
      year: 0,
      loadedMonths: [],
      mode: "centers",
      // Un libro anterior a que se llevara el sistema solo pudo salir del estado único.
      system: "monthly-single",
      comments: [],
      adjustments: [],
    });
  });

  it("un libro sin la columna de sistema adopta el de estado único", () => {
    expect(rowsToAppWorkbookMeta([["workspace", 2026, "0,1", "single"]]).system).toBe(
      "monthly-single",
    );
  });

  it("drops malformed comment and adjustment rows", () => {
    const rows: unknown[][] = [
      ["workspace", 2026, "0", "single"],
      ["comment", "", "4", "x", "mes no numérico"], // monthIndex not a number → dropped
      ["adjustment", "", "4", 0], // missing originalValue → dropped
    ];
    const meta = rowsToAppWorkbookMeta(rows);
    expect(meta.comments).toEqual([]);
    expect(meta.adjustments).toEqual([]);
  });
});
