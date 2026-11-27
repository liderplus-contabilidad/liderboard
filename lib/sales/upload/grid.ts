/**
 * WHERE each thing is in the flat sales report, and how a cell is read.
 *
 * The report is a table: a header row, then one row per invoice LINE. Everything is located by
 * LABEL, on whatever row carries the header — which is also what lets the module's own download,
 * whose header sits under a letterhead, come back in. Seven labels are required (the six the firm
 * reads plus `COD. ARTICULO`); every other column is optional and ignored.
 */
import { compactLabel, type Cell } from "@/lib/excel/workbook";
import { parseCurrency } from "@/lib/format";

/** The labels, compared already compacted (no accents, no double spaces, case-insensitive). */
const DATE_LABEL = "fecha";
const INSURER_LABEL = "seguro";
/** The accounting system writes a trailing full stop; both spellings are accepted. */
const TYPE_LABELS = ["tipo de servicio.", "tipo de servicio"];
const CODE_LABEL = "cod. articulo";
const NAME_LABEL = "nombre del articulo";
const AMOUNT_LABEL = "neto";
const VENDOR_LABEL = "vendedor";
/** Optional: the module's identity (`identity.ts`). */
const COMPANY_LABEL = "cod. empresa";

/** The required labels, as they are named back to the user when one is missing. */
export const REQUIRED_LABELS = [
  "FECHA",
  "SEGURO",
  "TIPO DE SERVICIO",
  "COD. ARTICULO",
  "NOMBRE DEL ARTICULO",
  "NETO",
  "VENDEDOR",
] as const;

/** The system's own text (`2026-03-15 00:00:00.000`), and what `readDenseRows` turns a date
 *  cell into. */
const DATE = /^(\d{4})-(\d{2})-(\d{2})/;
/** `dd/mm/aaaa`, for a hand-made file. */
const DATE_DMY = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/;

export function salesLabel(cell: Cell): string {
  return compactLabel(cell);
}

/**
 * A cell as text, trimmed and with inner whitespace collapsed — HERE, once: the real file brings
 * trailing spaces on its names, and `'BMI DEL ECUADOR '` left alone is a second insurer.
 */
export function salesText(cell: Cell): string {
  if (cell === null || cell === undefined) {
    return "";
  }
  return String(cell).replace(/\s+/g, " ").trim();
}

/**
 * The amounts arrive as TEXT (`"2.0000"`, `"1,234.56"`); a bare `Number` would give `NaN`.
 * `null` when the cell is not a number.
 */
export function toSalesNumber(cell: Cell): number | null {
  if (typeof cell === "number") {
    return Number.isFinite(cell) ? cell : null;
  }
  const raw = salesText(cell).replace(/\s/g, "");
  if (raw === "") {
    return null;
  }
  // Parentheses are the accountant's negative sign.
  const negative = /^\(.*\)$/.test(raw);
  // `parseCurrency` and not a bare `Number` over stripped commas: it is the app's one reading of
  // an amount, and it REJECTS the inverted convention («17.338,85», «12,5») instead of misreading
  // it by a factor of a thousand.
  // The system writes amounts under one without their leading zero («.4000»): 82.762 of the real
  // file's rows. The zero is restored before the strict reading, which demands a digit there.
  const parsed = parseCurrency(raw.replace(/[()]/g, "").replace(/^(-?\$?)\./, "$10."));
  if (parsed === null) {
    return null;
  }
  return negative ? -parsed : parsed;
}

/** A line's date, or `null` when the cell carries none that can be read. */
export function toSalesDate(cell: Cell): { year: number; monthIndex: number; day: number } | null {
  const raw = salesText(cell);
  const iso = DATE.exec(raw);
  if (iso) {
    return { year: Number(iso[1]), monthIndex: Number(iso[2]) - 1, day: Number(iso[3]) };
  }
  const dmy = DATE_DMY.exec(raw);
  if (dmy) {
    return { year: Number(dmy[3]), monthIndex: Number(dmy[2]) - 1, day: Number(dmy[1]) };
  }
  return null;
}

export interface SalesHeader {
  row: number;
  dateCol: number;
  insurerCol: number;
  typeCol: number;
  codeCol: number;
  nameCol: number;
  amountCol: number;
  vendorCol: number;
  /** `-1` when the file does not ship it. */
  companyCol: number;
}

/** The required labels the closest candidate row was missing. */
export function missingSalesLabels(grid: readonly Cell[][]): string[] {
  let best: string[] | null = null;
  for (const row of grid) {
    const found = locate(row);
    const missing = REQUIRED_LABELS.filter((_label, index) => found.required[index] === -1);
    if (missing.length === 0) {
      return [];
    }
    // The row that got closest is the one worth naming the gap of.
    if (best === null || missing.length < best.length) {
      best = missing;
    }
  }
  return best ?? [...REQUIRED_LABELS];
}

interface Located {
  /** Column of each entry of `REQUIRED_LABELS`, in that order; `-1` when absent. */
  required: number[];
  companyCol: number;
}

function locate(row: readonly Cell[]): Located {
  const required = [-1, -1, -1, -1, -1, -1, -1];
  let companyCol = -1;
  for (let col = 0; col < row.length; col++) {
    const label = salesLabel(row[col]);
    if (label === DATE_LABEL && required[0] === -1) {
      required[0] = col;
    } else if (label === INSURER_LABEL && required[1] === -1) {
      required[1] = col;
    } else if (TYPE_LABELS.includes(label) && required[2] === -1) {
      required[2] = col;
    } else if (label === CODE_LABEL && required[3] === -1) {
      required[3] = col;
    } else if (label === NAME_LABEL && required[4] === -1) {
      required[4] = col;
    } else if (label === AMOUNT_LABEL && required[5] === -1) {
      required[5] = col;
    } else if (label === VENDOR_LABEL && required[6] === -1) {
      required[6] = col;
    } else if (label === COMPANY_LABEL && companyCol === -1) {
      companyCol = col;
    }
  }
  return { required, companyCol };
}

/** The header: the first row carrying all seven required labels, on whatever row it sits. */
export function findSalesHeader(grid: readonly Cell[][]): SalesHeader | null {
  for (let row = 0; row < grid.length; row++) {
    const { required, companyCol } = locate(grid[row] ?? []);
    if (required.some((col) => col === -1)) {
      continue;
    }
    const [dateCol, insurerCol, typeCol, codeCol, nameCol, amountCol, vendorCol] = required;
    return {
      row,
      dateCol,
      insurerCol,
      typeCol,
      codeCol,
      nameCol,
      amountCol,
      vendorCol,
      companyCol,
    };
  }
  return null;
}

/** A line, plus the date it is filed by. */
export interface SalesRow {
  year: number;
  monthIndex: number;
  day: number;
  seguro: string;
  tipo: string;
  articleCode: string;
  articleName: string;
  vendor: string;
  amount: number;
  companyCode: string;
}

/**
 * What a row says.
 *
 *   - `null` — not a line: neither a numeric amount nor a readable date (blank row, stray label).
 *   - `{ undated: true }` — a line whose date cannot be read; the caller counts and declares it.
 *   - `{ unreadable: true }` — a line whose NETO is written but cannot be read as an amount. It is
 *     counted and declared too: reading it as zero would lose its dollars in silence.
 *
 * A line with no amount reads as zero and is kept: lines at $0 are real.
 */
export function readSalesRow(
  row: readonly Cell[],
  header: SalesHeader,
): SalesRow | { undated: true } | { unreadable: true } | null {
  const amount = toSalesNumber(row[header.amountCol]);
  const date = toSalesDate(row[header.dateCol]);
  if (amount === null && date === null) {
    return null;
  }
  if (!date) {
    return { undated: true };
  }
  if (amount === null && salesText(row[header.amountCol]) !== "") {
    return { unreadable: true };
  }
  return {
    year: date.year,
    monthIndex: date.monthIndex,
    day: date.day,
    seguro: salesText(row[header.insurerCol]),
    tipo: salesText(row[header.typeCol]),
    articleCode: salesText(row[header.codeCol]),
    articleName: salesText(row[header.nameCol]),
    vendor: salesText(row[header.vendorCol]),
    amount: amount ?? 0,
    companyCode: header.companyCol === -1 ? "" : salesText(row[header.companyCol]),
  };
}
