/**
 * The bridge that lets a workbook's comments, adjustments and coverage survive a download →
 * re-upload round-trip, for BOTH single-mode ("Excel con tus datos") and by-centers ("Excel
 * completo") workspaces — see `app-workbook.ts`, the one strategy that reads this sheet back
 * for either mode, told apart by `AppWorkbookMeta.mode`.
 *
 * The workbook covers EVERY year the workspace holds, so nothing here is scalar any more: the
 * coverage is one row per year, every comment and adjustment names its year, and a `sheet` row
 * maps each visible worksheet to the (year, centro) it holds. That mapping is what makes the
 * sheet NAME free to be truncated and de-duplicated for Excel's 31-character limit — the year is
 * read from the metadata, never parsed back out of the title.
 *
 * Pure and library-agnostic on purpose: it works on arrays-of-arrays, so `exceljs` (which
 * writes the sheet) and SheetJS `xlsx` (which reads it) both use these helpers without
 * importing each other.
 */
import { LEGACY_SYSTEM } from "./upload/systems";

/** Obscure name so it can't collide with a real accounting sheet; hidden in the workbook. One
 * sheet for the WHOLE workbook (not one per center-year): a cell needs its year and its center
 * named to be placed back, and both travel in the row. */
export const APP_WORKBOOK_META_SHEET = "_liderplus_workspace_meta";

/** The `centerId` a single-mode workbook's rows carry — there is exactly one "center" and it
 * has no real name, so every comment/adjustment row is tagged with this instead. */
export const SINGLE_WORKBOOK_CENTER_KEY = "";

export type AppWorkbookMode = "single" | "centers";

/** One year of the workbook and the months it actually holds. */
export interface AppWorkbookYear {
  year: number;
  loadedMonths: number[];
}

/** Which (year, centro) a visible worksheet holds. */
export interface AppWorkbookSheet {
  sheetName: string;
  year: number;
  /** `SINGLE_WORKBOOK_CENTER_KEY` in single mode; the Consolidado sheets are not listed. */
  centerId: string;
}

export interface CenterCellComment {
  centerId: string;
  year: number;
  code: string;
  monthIndex: number;
  comment: string;
}

export interface CenterCellAdjustment {
  centerId: string;
  year: number;
  code: string;
  monthIndex: number;
  /** The file's value before the adjustment — the base a reload needs to detect conflicts. */
  originalValue: number;
}

export interface AppWorkbookMeta {
  /** Ascending; a workbook always carries at least one. */
  years: AppWorkbookYear[];
  sheets: AppWorkbookSheet[];
  mode: AppWorkbookMode;
  /** The accounting system the workspace came from (`upload/systems.ts`) — carried so a
   * download → re-upload keeps the workspace's identity, MicroPlus included, instead of the
   * reconstructed workspace claiming to come from the app's own format. */
  system: string;
  comments: CenterCellComment[];
  adjustments: CenterCellAdjustment[];
}

export function appWorkbookMetaToRows(meta: AppWorkbookMeta): (string | number)[][] {
  const rows: (string | number)[][] = [["workspace", meta.mode, meta.system]];
  for (const entry of meta.years) {
    rows.push(["year", entry.year, entry.loadedMonths.join(",")]);
  }
  for (const sheet of meta.sheets) {
    rows.push(["sheet", sheet.sheetName, sheet.year, sheet.centerId]);
  }
  for (const c of meta.comments) {
    rows.push(["comment", c.centerId, c.year, c.code, c.monthIndex, c.comment]);
  }
  for (const a of meta.adjustments) {
    rows.push(["adjustment", a.centerId, a.year, a.code, a.monthIndex, a.originalValue]);
  }
  return rows;
}

/** Rows → `AppWorkbookMeta`, dropping any row whose kind or shape isn't recognized. */
export function rowsToAppWorkbookMeta(rows: unknown[][]): AppWorkbookMeta {
  const years: AppWorkbookYear[] = [];
  const sheets: AppWorkbookSheet[] = [];
  let mode: AppWorkbookMode = "centers";
  // A workbook downloaded before the system was carried can only have come from the
  // single-statement format, the same reasoning the Dexie migration follows.
  let system: string = LEGACY_SYSTEM;
  const comments: CenterCellComment[] = [];
  const adjustments: CenterCellAdjustment[] = [];

  for (const row of rows) {
    const [kind, ...rest] = row;
    if (kind === "workspace") {
      const [rawMode, rawSystem] = rest;
      if (rawMode === "single" || rawMode === "centers") {
        mode = rawMode;
      }
      if (typeof rawSystem === "string" && rawSystem !== "") {
        system = rawSystem;
      }
    } else if (kind === "year") {
      const [rawYear, rawMonths] = rest;
      if (typeof rawYear === "number") {
        years.push({
          year: rawYear,
          loadedMonths:
            typeof rawMonths === "string" && rawMonths !== ""
              ? rawMonths
                  .split(",")
                  .map(Number)
                  .filter((n) => Number.isInteger(n))
              : [],
        });
      }
    } else if (kind === "sheet") {
      const [sheetName, year, centerId] = rest;
      if (
        typeof sheetName === "string" &&
        typeof year === "number" &&
        typeof centerId === "string"
      ) {
        sheets.push({ sheetName, year, centerId });
      }
    } else if (kind === "comment") {
      const [centerId, year, code, monthIndex, comment] = rest;
      if (
        typeof centerId === "string" &&
        typeof year === "number" &&
        typeof code === "string" &&
        typeof monthIndex === "number" &&
        typeof comment === "string" &&
        comment !== ""
      ) {
        comments.push({ centerId, year, code, monthIndex, comment });
      }
    } else if (kind === "adjustment") {
      const [centerId, year, code, monthIndex, originalValue] = rest;
      if (
        typeof centerId === "string" &&
        typeof year === "number" &&
        typeof code === "string" &&
        typeof monthIndex === "number" &&
        typeof originalValue === "number"
      ) {
        adjustments.push({ centerId, year, code, monthIndex, originalValue });
      }
    }
  }
  return {
    years: years.sort((a, b) => a.year - b.year),
    sheets,
    mode,
    system,
    comments,
    adjustments,
  };
}
