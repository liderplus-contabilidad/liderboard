/**
 * The monthly-by-cost-centers strategy: one file = one month = every center, in the same
 * grid the old (retired) annual consolidated export used — GENERAL, a column per center,
 * SIN CENTRO DE COSTO — but read as a single month's values instead of annual totals. The
 * file never carries a date line (verified against `.context/centros/2026/`, see design.md),
 * so the period comes from the filename (`upload/filename.ts`).
 *
 * `Sin centro de costo` is folded straight into `centers` as one more slice, positioned last
 * — the design retires its old "annual read-only dataset" special case (see design.md
 * decision 6): under this strategy it is a center like any other.
 */
import { PygParseError } from "../errors";
import type { AccountRow } from "../types";
import { parseMonthlyFilename } from "./filename";
import { findFirstDataRow, findHeaderRow, normalizeLabel, readGrid, toNumber } from "./grid";
import type { Cell } from "./grid";
import type { CenterSlice, StagedUpload, UploadCandidate, UploadStrategy } from "./types";

/** Owned by this strategy: the source's own account-code shape (see `upload/types.ts`). */
const ACCOUNT_CODE = /^\d+(\.\d+)*$/;
const RESULT_NAME = /utilidad|p[ée]rdida/i;

const MONTH_OR_TOTAL_LABELS = new Set([
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
  "total",
]);

interface HeaderColumn {
  sheetCol: number;
  label: string;
}

interface Located {
  grid: Cell[][];
  firstDataRow: number;
  headerRow: number;
}

/** Reads the sheet and locates the data/header rows; `null` on anything unreadable or
 * shapeless — `detect` turns that into `false`, `parse` turns it into a named error. */
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
  return { grid, firstDataRow, headerRow };
}

/** The header's free-text columns (index ≥ 2), or `null` when nothing is there at all. */
function freeTextColumns(headerRow: Cell[]): HeaderColumn[] | null {
  const columns: HeaderColumn[] = [];
  for (let col = 2; col < headerRow.length; col++) {
    const raw = String(headerRow[col] ?? "").trim();
    if (raw !== "") {
      columns.push({ sheetCol: col, label: raw });
    }
  }
  return columns.length > 0 ? columns : null;
}

function isMonthOrTotalLabel(label: string): boolean {
  return MONTH_OR_TOTAL_LABELS.has(normalizeLabel(label));
}

function detect(candidate: UploadCandidate): boolean {
  const located = locate(candidate);
  if (!located) {
    return false;
  }
  const columns = freeTextColumns(located.grid[located.headerRow]);
  if (!columns) {
    return false;
  }
  // Month-name / Total columns belong to `single-statement`; any OTHER free-text shape here is
  // this strategy's, even a malformed one (missing GENERAL) — `parse` names the exact problem
  // instead of the registry falling through to a generic "unrecognized format".
  return columns.every((column) => !isMonthOrTotalLabel(column.label));
}

function parse(candidate: UploadCandidate): StagedUpload {
  const period = parseMonthlyFilename(candidate.fileName);

  const located = locate(candidate);
  if (!located) {
    throw new PygParseError("no-accounts");
  }
  const { grid, firstDataRow, headerRow } = located;

  const columns = freeTextColumns(grid[headerRow]);
  if (!columns) {
    throw new PygParseError("no-header");
  }
  const generalColumn = columns.find((column) => normalizeLabel(column.label) === "general");
  if (!generalColumn) {
    throw new PygParseError("general-missing");
  }
  // Everything besides GENERAL is a center — the last one is "Sin centro de costo" (positional,
  // per the source contract), folded in as a center like any other.
  const centerColumns = columns.filter((column) => column.sheetCol !== generalColumn.sheetCol);

  const generalAccounts: AccountRow[] = [];
  const centerAccounts: AccountRow[][] = centerColumns.map(() => []);
  let companyName = "";
  for (const row of grid.slice(0, headerRow)) {
    const text = typeof row[0] === "string" ? row[0].trim() : "";
    if (text && !companyName) {
      companyName = text;
    }
  }

  for (let i = firstDataRow; i < grid.length; i++) {
    const row = grid[i];
    const code = typeof row[0] === "string" ? row[0].trim() : "";
    const name = typeof row[1] === "string" ? row[1].trim() : "";
    const isAccount = Boolean(code && ACCOUNT_CODE.test(code) && name);
    const isResult = !code && RESULT_NAME.test(name);
    if (!isAccount && !isResult) {
      continue;
    }
    if (isAccount) {
      generalAccounts.push({ code, name, values: [toNumber(row[generalColumn.sheetCol])] });
      centerColumns.forEach((column, ci) => {
        centerAccounts[ci].push({ code, name, values: [toNumber(row[column.sheetCol])] });
      });
    }
  }

  if (generalAccounts.length === 0) {
    throw new PygParseError("no-accounts");
  }

  const centers: CenterSlice[] = centerColumns.map((column, ci) => ({
    name: column.label,
    accounts: centerAccounts[ci],
  }));

  return {
    kind: "month-slice",
    year: period.year,
    month: period.month,
    companyName,
    centers,
    general: generalAccounts,
    warnings: [],
  };
}

export const monthlyCentersStrategy: UploadStrategy = {
  id: "monthly-centers",
  label: "Mensual por centros de costo",
  detect,
  parse,
};
