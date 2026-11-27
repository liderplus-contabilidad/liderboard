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

/** A workbook read in SheetJS' DENSE mode, for sheets too large to copy. `cellDates` is on so
 *  `readDenseRows` can hand a date cell over as text. */
export function readWorkbookDense(data: ArrayBuffer): XLSX.WorkBook | null {
  try {
    return XLSX.read(data, { dense: true, cellDates: true });
  } catch {
    return null;
  }
}

/** The rows the sheet DECLARES in its own range (`A1:R558273` → 558273), header included; `null`
 *  when it declares none. */
export function declaredRowCount(
  workbook: XLSX.WorkBook,
  sheetName: string | undefined,
): number | null {
  const sheet = sheetName ? workbook.Sheets[sheetName] : undefined;
  const ref = sheet?.["!ref"];
  if (!ref) {
    return null;
  }
  try {
    return XLSX.utils.decode_range(ref).e.r + 1;
  } catch {
    return null;
  }
}

/**
 * The sheet's rows, one at a time, without the second copy `readGrid` builds. A date cell is
 * handed over as TEXT (`YYYY-MM-DD HH:MM:SS.mmm`). `null` when `sheetName` names no sheet.
 */
export function readDenseRows(
  workbook: XLSX.WorkBook,
  sheetName: string | undefined,
): Iterable<Cell[]> | null {
  const sheet = sheetName ? workbook.Sheets[sheetName] : undefined;
  if (!sheet) {
    return null;
  }
  const dense = (sheet as { "!data"?: XLSX.CellObject[][] })["!data"];
  const ref = sheet["!ref"];
  let range: XLSX.Range | null = null;
  if (!dense) {
    if (!ref) {
      return [];
    }
    try {
      range = XLSX.utils.decode_range(ref);
    } catch {
      return [];
    }
  }
  const rows = dense;
  const bounds = range;
  return {
    *[Symbol.iterator](): Iterator<Cell[]> {
      if (rows) {
        for (const row of rows) {
          yield (row ?? []).map(denseCell);
        }
        return;
      }
      if (!bounds) {
        return;
      }
      for (let r = bounds.s.r; r <= bounds.e.r; r++) {
        const row: Cell[] = [];
        for (let c = bounds.s.c; c <= bounds.e.c; c++) {
          row.push(
            denseCell(sheet[XLSX.utils.encode_cell({ r, c })] as XLSX.CellObject | undefined),
          );
        }
        yield row;
      }
    },
  };
}

function denseCell(cell: XLSX.CellObject | undefined | null): Cell {
  const value = cell?.v;
  if (value === undefined || value === null) {
    return null;
  }
  if (value instanceof Date) {
    return formatDateCell(value);
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === "boolean") {
    return String(value);
  }
  return String(value);
}

/**
 * A date cell as text, built from its UTC parts: SheetJS turns a serial into a `Date` whose UTC
 * parts carry the file's wall clock. The local parts are off by the machine's offset, which would
 * move a date at midnight on the 1st into the previous month.
 */
function formatDateCell(value: Date): string {
  const pad = (n: number, width = 2) => String(n).padStart(width, "0");
  return (
    `${value.getUTCFullYear()}-${pad(value.getUTCMonth() + 1)}-${pad(value.getUTCDate())} ` +
    `${pad(value.getUTCHours())}:${pad(value.getUTCMinutes())}:${pad(value.getUTCSeconds())}.` +
    `${pad(value.getUTCMilliseconds(), 3)}`
  );
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

/** `normalizeLabel` plus collapsing INNER runs of whitespace (including newlines, which `\s`
 * already matches), so `"NOMBRE  DE LA  CUENTA"` and a label wrapped onto two lines both still
 * match. Shared because more than one label-located format needs it. */
export function compactLabel(cell: Cell): string {
  return normalizeLabel(cell).replace(/\s+/g, " ");
}
