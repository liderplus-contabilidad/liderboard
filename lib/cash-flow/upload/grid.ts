/**
 * The by-LABEL helpers every reader of this module shares. A column is found by what its header
 * says, never by its letter (`CLAUDE.md`: a workbook is located BY LABEL); a row is a header row
 * when it holds every label a format requires. Contífico's export puts «Provincia»/«Cantón» in
 * some clients and not in others — by-label reading is what survives that.
 */
import { compactLabel, type Cell } from "@/lib/excel/workbook";

export type Grid = Cell[][];

/** The index of the first row holding EVERY label in `required` (compared compacted), or `-1`. */
export function findHeaderRow(grid: Grid, required: readonly string[], maxRows = 40): number {
  const wanted = required.map(compactLabel);
  const limit = Math.min(grid.length, maxRows);
  for (let index = 0; index < limit; index += 1) {
    const labels = new Set((grid[index] ?? []).map(compactLabel));
    if (wanted.every((label) => labels.has(label))) {
      return index;
    }
  }
  return -1;
}

/** Column index of each label in the header row; `-1` for a label that is not there. */
export function locate(header: readonly Cell[], labels: readonly string[]): number[] {
  const compacted = header.map(compactLabel);
  return labels.map((label) => compacted.indexOf(compactLabel(label)));
}

export function cellText(cell: Cell): string {
  return String(cell ?? "").trim();
}

/**
 * A number as the sheet wrote it: a real number, or text with Ecuador's local format («1.234,56»)
 * or the plain one («1,234.56» / «1234.56»). `0` for a blank; `null` never, because a blank amount
 * IS zero in every report this module reads.
 */
export function cellAmount(cell: Cell): number {
  if (typeof cell === "number") {
    return Number.isFinite(cell) ? cell : 0;
  }
  const text = cellText(cell).replace(/\s/g, "");
  if (!text || text === "-") {
    return 0;
  }
  const negative = /^\(.*\)$/.test(text) || text.startsWith("-");
  const digits = text.replace(/[()$-]/g, "");
  // «1.234,56» (comma last) is local; «1,234.56» or «1234.56» is plain.
  const lastComma = digits.lastIndexOf(",");
  const lastDot = digits.lastIndexOf(".");
  const normalized =
    lastComma > lastDot ? digits.replace(/\./g, "").replace(",", ".") : digits.replace(/,/g, "");
  const value = Number(normalized);
  if (!Number.isFinite(value)) {
    return 0;
  }
  return negative ? -value : value;
}

/** The first non-empty text cell of the first `rows` rows — where reports write the razón social. */
export function firstTextLine(grid: Grid, rows = 3): string | null {
  for (let index = 0; index < Math.min(rows, grid.length); index += 1) {
    for (const cell of grid[index] ?? []) {
      const text = cellText(cell);
      if (text) {
        return text;
      }
    }
  }
  return null;
}
