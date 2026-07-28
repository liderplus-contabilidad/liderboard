/**
 * The bridge that lets comments survive a download → re-upload round-trip. Exported
 * workbooks carry a hidden metadata sheet with one row per comment; `parse` reads it back.
 *
 * Pure and library-agnostic on purpose: it works on arrays-of-arrays, so `exceljs` (which
 * writes the sheet) and SheetJS `xlsx` (which reads it) both use these helpers without
 * importing each other. Value edits are NOT stored here — they fold into the new baseline.
 */
import type { ImportedComment } from "./types";

/** Obscure name so it can't collide with a real accounting sheet; hidden in the workbook. */
export const META_SHEET_NAME = "_liderplus_meta";

const META_HEADER = ["code", "monthIndex", "comment"] as const;

/** Comments → the sheet's rows (header first). Callers pass only edits that have text. */
export function commentsToMetaRows(
  comments: { code: string; monthIndex: number; comment: string }[],
): (string | number)[][] {
  return [
    [...META_HEADER],
    ...comments.map(({ code, monthIndex, comment }) => [code, monthIndex, comment]),
  ];
}

/**
 * Rows → comments, keeping only well-formed data rows. The header (a non-numeric
 * `monthIndex` cell) and any malformed row fail validation and drop out, so no explicit
 * header-skipping is needed. Comment text is kept verbatim (never trimmed).
 */
export function metaRowsToComments(rows: unknown[][]): ImportedComment[] {
  const comments: ImportedComment[] = [];
  for (const row of rows) {
    const [code, monthIndex, comment] = row;
    if (
      typeof code === "string" &&
      code.trim() !== "" &&
      typeof monthIndex === "number" &&
      Number.isInteger(monthIndex) &&
      typeof comment === "string" &&
      comment !== ""
    ) {
      comments.push({ code: code.trim(), monthIndex, comment });
    }
  }
  return comments;
}

/**
 * The "Excel completo" (app-workbook) round-trip's hidden metadata sheet — one sheet for the
 * WHOLE workspace, not one per center, because `loadedMonths` is workspace-wide (a file is a
 * month and brings every center) and a cell needs its center named to be placed back. Each
 * row is tagged by kind so the three concerns (workspace period, comments, adjustments) share
 * one sheet without a fixed row order.
 */
export const APP_WORKBOOK_META_SHEET = "_liderplus_workspace_meta";

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
  comments: CenterCellComment[];
  adjustments: CenterCellAdjustment[];
}

export function appWorkbookMetaToRows(meta: AppWorkbookMeta): (string | number)[][] {
  const rows: (string | number)[][] = [["workspace", meta.year, meta.loadedMonths.join(",")]];
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
  const comments: CenterCellComment[] = [];
  const adjustments: CenterCellAdjustment[] = [];

  for (const row of rows) {
    const [kind, ...rest] = row;
    if (kind === "workspace") {
      const [rawYear, rawMonths] = rest;
      if (typeof rawYear === "number") {
        year = rawYear;
      }
      if (typeof rawMonths === "string" && rawMonths !== "") {
        loadedMonths = rawMonths
          .split(",")
          .map(Number)
          .filter((n) => Number.isInteger(n));
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
  return { year, loadedMonths, comments, adjustments };
}
