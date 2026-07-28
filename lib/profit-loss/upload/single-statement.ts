/**
 * Wraps the existing single-statement parser (`parsePygWorkbook`, in `../parse.ts`) as a
 * registry strategy. `parsePygWorkbook` itself is unchanged — same monthly/annual base, same
 * warnings, same errors — this only adds a shape-based `detect` so it is reached through the
 * registry instead of a direct import.
 *
 * A sucursal statement (a "Centro de Costo:" preamble line over month-name columns) is a
 * retired format: it has this shape but is deliberately excluded, so it matches no strategy
 * at all (see design.md's migration plan).
 */
import { parsePygWorkbook } from "../parse";
import { findFirstDataRow, findHeaderRow, normalizeLabel, readGrid } from "./grid";
import type { Cell } from "./grid";
import type { StagedUpload, UploadCandidate, UploadStrategy } from "./types";

/** Owned by this strategy: the source's own account-code shape. */
const ACCOUNT_CODE = /^\d+(\.\d+)*$/;
const COST_CENTER_LINE = /^Centro de Costo:\s*(.+)$/i;
const MONTH_LABELS = new Set([
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
]);

interface Located {
  grid: Cell[][];
  headerRow: number;
}

function locate(candidate: UploadCandidate): Located | null {
  let grid: Cell[][];
  try {
    grid = readGrid(candidate.workbook, candidate.workbook.SheetNames[0]);
  } catch {
    return null;
  }
  const firstDataRow = findFirstDataRow(grid, (code) => ACCOUNT_CODE.test(code));
  if (firstDataRow === -1) {
    return null;
  }
  const headerRow = findHeaderRow(grid, firstDataRow);
  if (headerRow === -1) {
    return null;
  }
  return { grid, headerRow };
}

/** True when every non-empty column at index ≥ 2 is a month name or "Total" — no free text. */
function isMonthOrTotalShape(headerRow: Cell[]): boolean {
  let sawUsableColumn = false;
  for (let col = 2; col < headerRow.length; col++) {
    const label = normalizeLabel(headerRow[col]);
    if (label === "") {
      continue;
    }
    if (label !== "total" && !MONTH_LABELS.has(label)) {
      return false;
    }
    sawUsableColumn = true;
  }
  return sawUsableColumn;
}

function hasCostCenterLine(grid: Cell[][], headerRow: number): boolean {
  return grid
    .slice(0, headerRow)
    .some((row) => typeof row[0] === "string" && COST_CENTER_LINE.test(row[0].trim()));
}

function detect(candidate: UploadCandidate): boolean {
  const located = locate(candidate);
  if (!located) {
    return false;
  }
  if (!isMonthOrTotalShape(located.grid[located.headerRow])) {
    return false;
  }
  // A sucursal statement has this exact shape but is retired — leave it unmatched.
  return !hasCostCenterLine(located.grid, located.headerRow);
}

function parse(candidate: UploadCandidate): StagedUpload {
  const result = parsePygWorkbook(candidate.buffer, candidate.fileName);
  return { kind: "single-statement", result };
}

export const singleStatementStrategy: UploadStrategy = {
  id: "single-statement",
  label: "Estado único",
  detect,
  parse,
};
