/**
 * The bridge that lets a workbook's comments, adjustments and period survive a download →
 * re-upload round-trip, for BOTH single-mode ("Excel con tus datos") and by-centers ("Excel
 * completo") workspaces — see `app-workbook.ts`, the one strategy that reads this sheet back
 * for either mode, told apart by `AppWorkbookMeta.mode`.
 *
 * Pure and library-agnostic on purpose: it works on arrays-of-arrays, so `exceljs` (which
 * writes the sheet) and SheetJS `xlsx` (which reads it) both use these helpers without
 * importing each other.
 */
import { LEGACY_SYSTEM } from "./upload/systems";

/** Obscure name so it can't collide with a real accounting sheet; hidden in the workbook. One
 * sheet for the WHOLE workspace (not one per center), because `loadedMonths` is workspace-wide
 * and a cell needs its center named to be placed back. Each row is tagged by kind so the three
 * concerns (workspace period, comments, adjustments) share one sheet without a fixed row order. */
export const APP_WORKBOOK_META_SHEET = "_liderplus_workspace_meta";

/** The `centerId` a single-mode workbook's rows carry — there is exactly one "center" and it
 * has no real name, so every comment/adjustment row is tagged with this instead. */
export const SINGLE_WORKBOOK_CENTER_KEY = "";

export type AppWorkbookMode = "single" | "centers";

export interface CenterCellComment {
  centerId: string;
  code: string;
  monthIndex: number;
  comment: string;
}

export interface CenterCellAdjustment {
  centerId: string;
  code: string;
  monthIndex: number;
  /** The file's value before the adjustment — the base a reload needs to detect conflicts. */
  originalValue: number;
}

export interface AppWorkbookMeta {
  year: number;
  loadedMonths: number[];
  mode: AppWorkbookMode;
  /** The accounting system the workspace came from (`upload/systems.ts`) — carried so a
   * download → re-upload keeps the workspace's identity, MicroPlus included, instead of the
   * reconstructed workspace claiming to come from the app's own format. */
  system: string;
  comments: CenterCellComment[];
  adjustments: CenterCellAdjustment[];
}

export function appWorkbookMetaToRows(meta: AppWorkbookMeta): (string | number)[][] {
  const rows: (string | number)[][] = [
    ["workspace", meta.year, meta.loadedMonths.join(","), meta.mode, meta.system],
  ];
  for (const c of meta.comments) {
    rows.push(["comment", c.centerId, c.code, c.monthIndex, c.comment]);
  }
  for (const a of meta.adjustments) {
    rows.push(["adjustment", a.centerId, a.code, a.monthIndex, a.originalValue]);
  }
  return rows;
}

/** Rows → `AppWorkbookMeta`, dropping any row whose kind or shape isn't recognized. */
export function rowsToAppWorkbookMeta(rows: unknown[][]): AppWorkbookMeta {
  let year = 0;
  let loadedMonths: number[] = [];
  let mode: AppWorkbookMode = "centers";
  // A workbook downloaded before the system was carried can only have come from the
  // single-statement format, the same reasoning the Dexie migration follows.
  let system: string = LEGACY_SYSTEM;
  const comments: CenterCellComment[] = [];
  const adjustments: CenterCellAdjustment[] = [];

  for (const row of rows) {
    const [kind, ...rest] = row;
    if (kind === "workspace") {
      const [rawYear, rawMonths, rawMode, rawSystem] = rest;
      if (typeof rawYear === "number") {
        year = rawYear;
      }
      if (typeof rawMonths === "string" && rawMonths !== "") {
        loadedMonths = rawMonths
          .split(",")
          .map(Number)
          .filter((n) => Number.isInteger(n));
      }
      if (rawMode === "single" || rawMode === "centers") {
        mode = rawMode;
      }
      if (typeof rawSystem === "string" && rawSystem !== "") {
        system = rawSystem;
      }
    } else if (kind === "comment") {
      const [centerId, code, monthIndex, comment] = rest;
      if (
        typeof centerId === "string" &&
        typeof code === "string" &&
        typeof monthIndex === "number" &&
        typeof comment === "string" &&
        comment !== ""
      ) {
        comments.push({ centerId, code, monthIndex, comment });
      }
    } else if (kind === "adjustment") {
      const [centerId, code, monthIndex, originalValue] = rest;
      if (
        typeof centerId === "string" &&
        typeof code === "string" &&
        typeof monthIndex === "number" &&
        typeof originalValue === "number"
      ) {
        adjustments.push({ centerId, code, monthIndex, originalValue });
      }
    }
  }
  return { year, loadedMonths, mode, system, comments, adjustments };
}
