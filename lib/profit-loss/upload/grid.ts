/**
 * PyG's own thin layer over `lib/excel/workbook.ts`'s generic Excel reading: same names, same
 * behavior, but narrowing that module's `null` failure into PyG's typed `PygParseError` — the
 * generic reader doesn't know PyG's error vocabulary, and shouldn't (`lib/excel/workbook.ts`'s
 * header explains why the split runs that direction). `findFirstDataRow`/`findHeaderRow` stay
 * HERE rather than moving down: both carry a plan-de-cuentas convention (an account-code
 * predicate, "past column B") that isn't Excel-reading in general, it's PyG's own header shape. A
 * strategy that needs an account-code test passes its own predicate to `findFirstDataRow`.
 */
import {
  compactLabel as sharedCompactLabel,
  normalizeLabel as sharedNormalizeLabel,
  readGrid as sharedReadGrid,
  readWorkbook as sharedReadWorkbook,
  toNumber as sharedToNumber,
  type Cell,
} from "@/lib/excel/workbook";
import type * as XLSX from "xlsx";
import { PygParseError } from "../errors";

export type { Cell };

export function readWorkbook(data: ArrayBuffer): XLSX.WorkBook {
  const workbook = sharedReadWorkbook(data);
  if (!workbook) {
    throw new PygParseError("invalid-file");
  }
  return workbook;
}

export function readGrid(workbook: XLSX.WorkBook, sheetName: string | undefined): Cell[][] {
  const grid = sharedReadGrid(workbook, sheetName);
  if (!grid) {
    throw new PygParseError("invalid-file");
  }
  return grid;
}

export const toNumber = sharedToNumber;
export const normalizeLabel = sharedNormalizeLabel;
export const compactLabel = sharedCompactLabel;

/** First row whose col A satisfies `isAccountCode` with a non-empty col B. */
export function findFirstDataRow(grid: Cell[][], isAccountCode: (code: string) => boolean): number {
  return grid.findIndex(
    (row) => typeof row[0] === "string" && isAccountCode(row[0].trim()) && Boolean(row[1]),
  );
}

/** Nearest row above the data with any non-empty cell at column index ≥ 2. */
export function findHeaderRow(grid: Cell[][], firstDataRow: number): number {
  for (let i = firstDataRow - 1; i >= 0; i--) {
    if (grid[i]?.some((cell, col) => col >= 2 && cell !== null && cell !== "")) {
      return i;
    }
  }
  return -1;
}
