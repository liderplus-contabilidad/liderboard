/**
 * Grid-reading utilities every upload strategy shares. Deliberately convention-free: no
 * account-code shape, no sign rule, no notion of where a period comes from — those stay in
 * each strategy (see `upload/types.ts`'s doc on what a strategy owns vs. shares). A strategy
 * that needs an account-code test passes its own predicate to `findFirstDataRow`.
 */
import * as XLSX from "xlsx";
import { PygParseError } from "../errors";

export type Cell = string | number | null;

export function readWorkbook(data: ArrayBuffer): XLSX.WorkBook {
  try {
    return XLSX.read(data);
  } catch {
    throw new PygParseError("invalid-file");
  }
}

export function readGrid(workbook: XLSX.WorkBook, sheetName: string | undefined): Cell[][] {
  const sheet = sheetName ? workbook.Sheets[sheetName] : undefined;
  if (!sheet) {
    throw new PygParseError("invalid-file");
  }
  try {
    return XLSX.utils.sheet_to_json<Cell[]>(sheet, { header: 1, raw: true, defval: null });
  } catch {
    throw new PygParseError("invalid-file");
  }
}

export function toNumber(cell: Cell): number {
  if (typeof cell === "number" && Number.isFinite(cell)) {
    return cell;
  }
  const parsed = Number(cell ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Strips accents and case so header/label comparisons ignore both ("Márzo" → "marzo"). */
export function normalizeLabel(cell: Cell): string {
  return String(cell ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();
}

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
