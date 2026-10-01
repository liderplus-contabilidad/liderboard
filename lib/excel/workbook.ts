/**
 * Generic Excel-reading utilities: no account-code shape, no sign rule, no notion of where a
 * period comes from — those stay with whichever module reads its own format (PyG's
 * `lib/profit-loss/upload/`, Rol de Pagos' `lib/payroll/upload/`). Extracted out of PyG's upload
 * layer because none of this is PyG's: reading a workbook, reading a sheet into a grid, coercing
 * a cell to a number, and comparing labels ignoring case/accents/whitespace are needs every
 * Excel-reading module in the app shares (`CLAUDE.md`'s "extract what is general-purpose").
 *
 * Failure here returns `null` rather than throwing — which error to raise, and in what language,
 * belongs to the caller's own domain. PyG's `lib/profit-loss/upload/grid.ts` stays as a thin
 * delegator over this module so its callers keep throwing `PygParseError`.
 */
import * as XLSX from "xlsx";
export { compactLabel, normalizeLabel } from "@/lib/text";

export type Cell = string | number | null;

/** `null` when `data` isn't a workbook SheetJS can read. */
export function readWorkbook(data: ArrayBuffer): XLSX.WorkBook | null {
  try {
    return XLSX.read(data);
  } catch {
    return null;
  }
}

/** `null` when `sheetName` doesn't name a sheet in `workbook`, or the sheet can't be read. */
export function readGrid(workbook: XLSX.WorkBook, sheetName: string | undefined): Cell[][] | null {
  const sheet = sheetName ? workbook.Sheets[sheetName] : undefined;
  if (!sheet) {
    return null;
  }
  try {
    return XLSX.utils.sheet_to_json<Cell[]>(sheet, { header: 1, raw: true, defval: null });
  } catch {
    return null;
  }
}

export function toNumber(cell: Cell): number {
  if (typeof cell === "number" && Number.isFinite(cell)) {
    return cell;
  }
  const parsed = Number(cell ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}
