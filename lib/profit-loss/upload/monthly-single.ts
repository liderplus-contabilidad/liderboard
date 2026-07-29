/**
 * The monthly single-statement strategy: a state-with-no-cost-centers export that (unlike the
 * by-centers format) DOES declare its own period, in a `Desde el DD/MM/AAAA hasta el DD/MM/AAAA`
 * preamble line (`upload/date-range.ts`) — no filename convention, no sheet-name convention (the
 * real exports call the sheet "Consulta Personas", never a contract). `detect` decides purely by
 * grid shape: exactly one value column, labeled `Total`.
 *
 * Reduces to the SAME `month-slice` the by-centers strategy produces (design.md decision 2): one
 * nameless slice (`centerId: null`), `mode: "single"`, no `general` — a single statement is a
 * workspace with one unnamed center, so `merge-month.ts` and the persistence layer need no
 * branch for it.
 */
import { buildAccountTree, computeResult, computeRollups } from "../derive";
import { PygParseError } from "../errors";
import type { AccountRow } from "../types";
import { findDateRange, toCalendarMonth } from "./date-range";
import { findFirstDataRow, findHeaderRow, normalizeLabel, readGrid, toNumber } from "./grid";
import type { Cell } from "./grid";
import { MONTHLY_SINGLE_SYSTEM } from "./systems";
import type { StagedUpload, UploadCandidate, UploadStrategy } from "./types";

/** Owned by this strategy: the source's own account-code shape (see `upload/types.ts`). */
const ACCOUNT_CODE = /^\d+(\.\d+)*$/;
const RESULT_NAME = /utilidad|p[ée]rdida/i;
/** Tolerance for float drift when validating the file's result row (one cent). */
const SUM_TOLERANCE = 0.011;

interface Located {
  grid: Cell[][];
  firstDataRow: number;
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
  return { grid, firstDataRow, headerRow };
}

/** The sheet column of the lone `Total` value column, or `null` when the header carries any
 * OTHER free-text column (a center name, a month name — anything but exactly one "Total"). */
function totalColumn(headerRow: Cell[]): number | null {
  const columns: { sheetCol: number; label: string }[] = [];
  for (let col = 2; col < headerRow.length; col++) {
    const label = normalizeLabel(headerRow[col]);
    if (label !== "") {
      columns.push({ sheetCol: col, label });
    }
  }
  if (columns.length !== 1) {
    return null;
  }
  return columns[0].label === "total" ? columns[0].sheetCol : null;
}

function detect(candidate: UploadCandidate): boolean {
  const located = locate(candidate);
  if (!located) {
    return false;
  }
  return totalColumn(located.grid[located.headerRow]) !== null;
}

function readCompanyName(grid: Cell[][], headerRow: number): string {
  for (const row of grid.slice(0, headerRow)) {
    const text = typeof row[0] === "string" ? row[0].trim() : "";
    if (text) {
      return text;
    }
  }
  return "";
}

function parse(candidate: UploadCandidate): StagedUpload {
  const located = locate(candidate);
  if (!located) {
    throw new PygParseError("no-accounts");
  }
  const { grid, firstDataRow, headerRow } = located;
  const totalCol = totalColumn(grid[headerRow]);
  if (totalCol === null) {
    throw new PygParseError("no-header");
  }

  const range = findDateRange(grid.slice(0, headerRow));
  if (!range) {
    throw new PygParseError("missing-date-range");
  }
  const outcome = toCalendarMonth(range);
  if (!outcome.ok) {
    throw new PygParseError("invalid-date-range", outcome.message);
  }

  const companyName = readCompanyName(grid, headerRow);

  const accounts: AccountRow[] = [];
  let resultFromFile = 0;
  for (let i = firstDataRow; i < grid.length; i++) {
    const row = grid[i];
    const code = typeof row[0] === "string" ? row[0].trim() : "";
    const name = typeof row[1] === "string" ? row[1].trim() : "";
    if (code && ACCOUNT_CODE.test(code) && name) {
      accounts.push({ code, name, values: [toNumber(row[totalCol])] });
    } else if (!code && RESULT_NAME.test(name)) {
      resultFromFile = toNumber(row[totalCol]);
    }
  }
  if (accounts.length === 0) {
    throw new PygParseError("no-accounts");
  }

  const warnings = validateResultAgainstFile(accounts, resultFromFile);

  return {
    kind: "month-slice",
    mode: "single",
    system: MONTHLY_SINGLE_SYSTEM,
    year: outcome.year,
    month: outcome.month,
    companyName,
    centers: [{ name: "", centerId: null, accounts }],
    warnings,
  };
}

/** The file's "Utilidad o Pérdida" row is validation input only — recompute it from the file's
 * own accounts and report a mismatch beyond one cent (see `pyg-single-monthly-upload`'s "El
 * estado único se reduce al mismo month-slice"). */
function validateResultAgainstFile(accounts: AccountRow[], resultFromFile: number): string[] {
  const { roots, warnings } = buildAccountTree(accounts);
  const rolled = computeRollups(roots);
  const { values, warnings: resultWarnings } = computeResult(rolled);
  const computed = values[0] ?? 0;
  warnings.push(...resultWarnings);
  if (Math.abs(resultFromFile - computed) > SUM_TOLERANCE) {
    warnings.push(
      `Descuadre en Utilidad o Pérdida: el archivo trae ${resultFromFile}, el cálculo da ${Math.round(computed * 100) / 100}.`,
    );
  }
  return warnings;
}

export const monthlySingleStrategy: UploadStrategy = {
  id: MONTHLY_SINGLE_SYSTEM,
  label: "Estado único mensual",
  detect,
  parse,
  // `buildSingleMonthSliceWorkbook` writes this very grid back — hence "Un mes en crudo".
  writesOwnFormat: true,
};
