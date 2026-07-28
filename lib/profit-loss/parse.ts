/**
 * Parses a PyG accounting-system export into a `PygDataset`. Generic by design: the
 * skeleton (preamble → header row → [code, name, …values] rows → trailing result row)
 * is the contract — never a specific chart of accounts. See the spec's
 * "Source format contract" section for the sample-derived facts encoded here.
 *
 * This module imports SheetJS statically; UI code must load it via dynamic `import()`
 * so the library stays out of the initial bundle.
 */
import * as XLSX from "xlsx";
import { MONTHS_FULL_ES, MONTHS_SHORT_ES } from "@/lib/date";
import { buildAccountTree, computeResult, computeRollups } from "./derive";
import { PygParseError } from "./errors";
import { META_SHEET_NAME, metaRowsToComments } from "./excel-metadata";
import type { AccountRow, Frequency, ImportedComment, PygDataset, PygParseResult } from "./types";

type Cell = string | number | null;

const ACCOUNT_CODE = /^\d+(\.\d+)*$/;
const RESULT_NAME = /utilidad|p[ée]rdida/i;
const DATE_RANGE = /Desde el (\d{2})\/(\d{2})\/(\d{4}) hasta el (\d{2})\/(\d{2})\/(\d{4})/i;
const COST_CENTER_LINE = /^Centro de Costo:\s*(.+)$/i;
/** Tolerance for float drift when validating file sums (one cent). */
const SUM_TOLERANCE = 0.011;

interface StatementColumns {
  kind: "statement";
  baseFrequency: Frequency;
  /** sheet column index → month index 0–11 (monthly base) or 0 (annual base). */
  valueColumns: { sheetCol: number; targetIndex: number }[];
  width: 12 | 1;
}
interface ConsolidatedColumns {
  kind: "consolidated";
  columns: { sheetCol: number; name: string }[];
}
type ColumnClassification = StatementColumns | ConsolidatedColumns;

export function parsePygWorkbook(data: ArrayBuffer, fileName: string): PygParseResult {
  const workbook = readWorkbook(data);
  const grid = readGrid(workbook, workbook.SheetNames[0]);
  const firstDataRow = findFirstDataRow(grid);
  if (firstDataRow === -1) {
    throw new PygParseError("no-accounts");
  }
  const headerRow = findHeaderRow(grid, firstDataRow);
  if (headerRow === -1) {
    throw new PygParseError("no-header");
  }

  const warnings: string[] = [];
  const columns = classifyColumns(grid[headerRow], warnings);
  if (columns.kind === "consolidated") {
    throw new PygParseError("consolidated-unsupported");
  }
  const meta = parsePreamble(grid.slice(0, headerRow));
  const { accounts, resultFromFile } = parseBody(grid, firstDataRow, columns);
  if (accounts.length === 0) {
    throw new PygParseError("no-accounts");
  }
  warnings.push(...validateAgainstFile(accounts, resultFromFile, columns));

  const dataset: PygDataset = {
    id: crypto.randomUUID(),
    fileName,
    uploadedAt: Date.now(),
    companyName: meta.companyName,
    periodLabel: meta.periodLabel,
    year: meta.year,
    baseFrequency: columns.baseFrequency,
    role: "single",
    ...(meta.costCenterName ? { costCenterName: meta.costCenterName } : {}),
    accounts,
    resultFromFile,
    warnings,
  };
  return { dataset, comments: readComments(workbook, accounts, columns.width) };
}

function readWorkbook(data: ArrayBuffer): XLSX.WorkBook {
  try {
    return XLSX.read(data);
  } catch {
    throw new PygParseError("invalid-file");
  }
}

function readGrid(workbook: XLSX.WorkBook, sheetName: string | undefined): Cell[][] {
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

/**
 * Reads back the comments an app-exported workbook stashed in its hidden metadata sheet
 * (absent in system exports → none), keeping only those that still resolve to a real
 * account and an in-range column. Value edits are not restored — they are baked into the
 * re-uploaded values already.
 */
function readComments(
  workbook: XLSX.WorkBook,
  accounts: AccountRow[],
  width: number,
): ImportedComment[] {
  const sheet = workbook.Sheets[META_SHEET_NAME];
  if (!sheet) {
    return [];
  }
  let rows: unknown[][];
  try {
    rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, defval: null });
  } catch {
    return [];
  }
  const codes = new Set(accounts.map((account) => account.code));
  return metaRowsToComments(rows).filter(
    (comment) => codes.has(comment.code) && comment.monthIndex >= 0 && comment.monthIndex < width,
  );
}

/** First row whose col A is a dot-separated account code with a non-empty col B. */
function findFirstDataRow(grid: Cell[][]): number {
  return grid.findIndex(
    (row) => typeof row[0] === "string" && ACCOUNT_CODE.test(row[0].trim()) && Boolean(row[1]),
  );
}

/** Nearest row above the data with any non-empty cell at column index ≥ 2. */
function findHeaderRow(grid: Cell[][], firstDataRow: number): number {
  for (let i = firstDataRow - 1; i >= 0; i--) {
    if (grid[i]?.some((cell, col) => col >= 2 && cell !== null && cell !== "")) {
      return i;
    }
  }
  return -1;
}

function normalizeLabel(cell: Cell): string {
  return String(cell ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip combining accents: "Márzo" → "marzo"
    .trim()
    .toLowerCase();
}

/**
 * Month-name labels → monthly statement; a lone "Total" → annual statement; any other text
 * labels (GENERAL, center names…) → the consolidated-by-cost-center format.
 */
function classifyColumns(headerRow: Cell[], warnings: string[]): ColumnClassification {
  const monthColumns: { sheetCol: number; targetIndex: number }[] = [];
  const textColumns: { sheetCol: number; name: string }[] = [];
  let sawTotal = false;

  for (let col = 2; col < headerRow.length; col++) {
    const raw = String(headerRow[col] ?? "").trim();
    const label = normalizeLabel(headerRow[col]);
    if (label === "") {
      continue;
    }
    const monthIndex = MONTHS_FULL_ES.findIndex((name) => normalizeLabel(name) === label);
    if (monthIndex !== -1) {
      monthColumns.push({ sheetCol: col, targetIndex: monthIndex });
    } else if (label === "total") {
      sawTotal = true;
    } else {
      textColumns.push({ sheetCol: col, name: raw });
    }
  }

  if (textColumns.length > 0) {
    return { kind: "consolidated", columns: textColumns };
  }
  if (monthColumns.length > 0) {
    if (monthColumns.length < 12) {
      warnings.push(
        `El archivo trae ${monthColumns.length} de 12 meses; los meses faltantes se rellenan con 0.`,
      );
    }
    return { kind: "statement", baseFrequency: "mensual", valueColumns: monthColumns, width: 12 };
  }
  if (sawTotal) {
    return { kind: "statement", baseFrequency: "anual", valueColumns: [], width: 1 };
  }
  throw new PygParseError("no-header");
}

function parsePreamble(rows: Cell[][]): {
  companyName: string;
  periodLabel: string;
  year: number | null;
  costCenterName?: string;
} {
  let companyName = "";
  let periodLabel = "—";
  let year: number | null = null;
  let costCenterName: string | undefined;

  for (const row of rows) {
    const text = typeof row[0] === "string" ? row[0].trim() : "";
    if (!text) {
      continue;
    }
    if (!companyName) {
      companyName = text;
    }
    const center = COST_CENTER_LINE.exec(text);
    if (center) {
      costCenterName = center[1].trim();
    }
    const range = DATE_RANGE.exec(text);
    if (range) {
      const fromMonth = Number(range[2]) - 1;
      const toMonth = Number(range[5]) - 1;
      year = Number(range[6]);
      periodLabel = `${MONTHS_SHORT_ES[fromMonth]}–${MONTHS_SHORT_ES[toMonth]} ${year}`;
    }
  }
  return { companyName, periodLabel, year, ...(costCenterName ? { costCenterName } : {}) };
}

function parseBody(
  grid: Cell[][],
  firstDataRow: number,
  columns: StatementColumns,
): { accounts: AccountRow[]; resultFromFile: number[] } {
  const accounts: AccountRow[] = [];
  let resultFromFile: number[] = Array.from({ length: columns.width }, () => 0);

  for (let i = firstDataRow; i < grid.length; i++) {
    const row = grid[i];
    const code = typeof row[0] === "string" ? row[0].trim() : "";
    const name = typeof row[1] === "string" ? row[1].trim() : "";

    if (code && ACCOUNT_CODE.test(code) && name) {
      accounts.push({ code, name, values: readValues(row, columns) });
    } else if (!code && RESULT_NAME.test(name)) {
      resultFromFile = readValues(row, columns);
    }
  }
  return { accounts, resultFromFile };
}

function readValues(row: Cell[], columns: StatementColumns): number[] {
  if (columns.baseFrequency === "anual") {
    // Annual base: the single value column is the first non-label cell (col 2).
    return [toNumber(row[2])];
  }
  const values = Array.from({ length: 12 }, () => 0);
  for (const { sheetCol, targetIndex } of columns.valueColumns) {
    values[targetIndex] = toNumber(row[sheetCol]);
  }
  return values;
}

function toNumber(cell: Cell): number {
  if (typeof cell === "number" && Number.isFinite(cell)) {
    return cell;
  }
  const parsed = Number(cell ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * The file's parent and result values are validation input only: recompute everything
 * from leaves and report any cell that drifts beyond one cent. Computed values win in
 * the UI regardless — these warnings just surface source inconsistencies.
 */
function validateAgainstFile(
  accounts: AccountRow[],
  resultFromFile: number[],
  columns: StatementColumns,
): string[] {
  const warnings: string[] = [];
  const { roots, warnings: treeWarnings } = buildAccountTree(accounts);
  warnings.push(...treeWarnings);
  const rolled = computeRollups(roots);
  const { values: result, warnings: resultWarnings } = computeResult(rolled);
  warnings.push(...resultWarnings);

  const computedByCode = new Map<string, number[]>();
  const collect = (nodes: typeof rolled) => {
    for (const node of nodes) {
      computedByCode.set(node.code, node.values);
      collect(node.children);
    }
  };
  collect(rolled);

  for (const account of accounts) {
    const computed = computedByCode.get(account.code);
    const mismatchCol = computed
      ? account.values.findIndex((v, col) => Math.abs(v - (computed[col] ?? 0)) > SUM_TOLERANCE)
      : -1;
    if (computed && mismatchCol !== -1) {
      warnings.push(
        `Descuadre en la cuenta ${account.code} (${columnLabel(mismatchCol, columns)}): ` +
          `el archivo trae ${account.values[mismatchCol]}, la suma de sus movimientos da ${round2(computed[mismatchCol] ?? 0)}.`,
      );
    }
  }

  const resultMismatch = resultFromFile.findIndex(
    (v, col) => Math.abs(v - (result[col] ?? 0)) > SUM_TOLERANCE,
  );
  if (resultMismatch !== -1) {
    warnings.push(
      `Descuadre en Utilidad o Pérdida (${columnLabel(resultMismatch, columns)}): ` +
        `el archivo trae ${resultFromFile[resultMismatch]}, el cálculo da ${round2(result[resultMismatch] ?? 0)}.`,
    );
  }
  return warnings;
}

function columnLabel(col: number, columns: StatementColumns): string {
  return columns.baseFrequency === "anual" ? "Total" : MONTHS_SHORT_ES[col];
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
