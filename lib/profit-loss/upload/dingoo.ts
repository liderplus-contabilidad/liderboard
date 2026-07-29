/**
 * The Dingoo strategy: reads that system's `ESTADO DE RESULTADOS` and reduces it to the SAME
 * `month-slice` in `single` mode every other strategy produces — Dingoo has no cost centers, so
 * it is a workspace of one nameless slice and nothing downstream (the merge, `loadedMonths`, the
 * persistence, the engine) learns it exists.
 *
 * What this strategy OWNS, all of it format-specific (see `upload/types.ts`):
 * - the sheet: the first one, whatever it is called (the sample calls it `RptEstadoResultados`);
 * - the preamble: located by label, in `dingoo-grid.ts`;
 * - the header: `Código` + `Nombre de la cuenta` + `Saldo` — and here `Saldo` really IS the
 *   value column, every level of the tree values in it, the opposite of MicroPlus's homonym;
 * - the account code: two-digit segments (`5.02.01.01.01`), kept VERBATIM — the leading zeros
 *   are what the accountant checks against their own file (design.md decision 4);
 * - the sign: Dingoo keeps INCOME negative and adds (`Resultado = 4 + 5`), the app keeps it
 *   positive and subtracts expenses, so branch 4 is negated at import (design.md decision 3).
 *   MicroPlus negates branch 5 — opposite directions over the same untouched core;
 * - the period: its own one-line `Desde el … al …` range, held to the same exact-calendar-month
 *   rule as the other monthly formats — no per-vendor exception.
 *
 * Read-only: `writesOwnFormat` is deliberately absent (design.md decision 7).
 */
import { buildAccountTree, computeResult, computeRollups } from "../derive";
import { PygParseError } from "../errors";
import type { AccountRow } from "../types";
import { toCalendarMonth } from "./date-range";
import {
  findDingooCompany,
  findDingooHeader,
  findDingooRange,
  findDingooResult,
  readDingooAccounts,
} from "./dingoo-grid";
import { readGrid } from "./grid";
import type { Cell } from "./grid";
import { DINGOO_SYSTEM } from "./systems";
import type { StagedUpload, UploadCandidate, UploadStrategy } from "./types";

/** Owned by this strategy: no trailing dot (unlike MicroPlus), segments free to carry leading
 * zeros, which are preserved rather than normalized away. */
const ACCOUNT_CODE = /^\d+(\.\d+)*$/;
/** The branch the file stores negated. */
const INCOME_ROOT = "4";
/** Tolerance for float drift when validating the file's result row (one cent). */
const SUM_TOLERANCE = 0.011;

function readSheet(candidate: UploadCandidate): Cell[][] | null {
  try {
    return readGrid(candidate.workbook, candidate.workbook.SheetNames[0]);
  } catch {
    return null;
  }
}

/**
 * The header alone is NOT enough. `Código` + `Nombre de la cuenta` normalizes to exactly what
 * MicroPlus writes, so the one-line `Desde el … al …` range is what tells the two formats apart
 * — and `parse` needs it anyway. Detection therefore doesn't lean on the registry's order
 * (design.md decision 7). Never the file name (the sample is `RptEstadoResultados.xlsx`) nor the
 * sheet name; neither is contract.
 */
function detect(candidate: UploadCandidate): boolean {
  const grid = readSheet(candidate);
  return grid !== null && findDingooHeader(grid) !== null && findDingooRange(grid) !== null;
}

/**
 * Branch 4 (income) is negated at the border so the app's `Utilidad = Ingresos − Gastos`
 * reproduces the file's `Resultado = 4 + 5`. The positive counter-accounts inside it
 * (`(-) DEVOLUCIONES EN VENTAS`) are negated like everything else: negative, they subtract
 * income, which is their job. Branch 5 is left alone, so the negative counter-accounts inside
 * IT (`DESCUENTOS EN COMPRAS`) keep subtracting expense.
 */
export function applyDingooSign(code: string, value: number): number {
  return code.split(".")[0] === INCOME_ROOT ? -value : value;
}

function parse(candidate: UploadCandidate): StagedUpload {
  const grid = readSheet(candidate);
  if (!grid) {
    throw new PygParseError("invalid-file");
  }
  const header = findDingooHeader(grid);
  if (!header) {
    throw new PygParseError("no-header");
  }
  const range = findDingooRange(grid);
  if (!range) {
    throw new PygParseError(
      "missing-date-range",
      'El archivo de Dingoo debe declarar su rango de fechas ("Desde el … al …"); no se ' +
        "encontró esa línea.",
    );
  }

  const outcome = toCalendarMonth(range.range);
  if (!outcome.ok) {
    throw new PygParseError("invalid-date-range", outcome.message);
  }

  const read = readDingooAccounts(grid, header, (code) => ACCOUNT_CODE.test(code));
  if (read.length === 0) {
    throw new PygParseError("no-accounts");
  }

  const accounts: AccountRow[] = read.map((account) => ({
    code: account.code,
    name: account.name,
    values: [applyDingooSign(account.code, account.value)],
  }));

  return {
    kind: "month-slice",
    mode: "single",
    system: DINGOO_SYSTEM,
    year: outcome.year,
    month: outcome.month,
    companyName: findDingooCompany(grid, range.row),
    centers: [{ name: "", centerId: null, accounts }],
    warnings: validateResultAgainstFile(accounts, findDingooResult(grid)),
  };
}

/**
 * The file's `Resultado del ejercicio` row is validation input only — recompute it from the
 * file's own accounts (already sign-normalized) and report a mismatch beyond one cent. The row
 * itself belongs to the income convention, so it is negated the same way before comparing.
 */
function validateResultAgainstFile(
  accounts: AccountRow[],
  resultFromFile: number | null,
): string[] {
  const { roots, warnings } = buildAccountTree(accounts);
  const rolled = computeRollups(roots);
  const { values, warnings: resultWarnings } = computeResult(rolled);
  warnings.push(...resultWarnings);
  if (resultFromFile === null) {
    return warnings;
  }
  const declared = -resultFromFile;
  const computed = values[0] ?? 0;
  if (Math.abs(declared - computed) > SUM_TOLERANCE) {
    warnings.push(
      `Descuadre en el Resultado del ejercicio: el archivo trae ${declared}, el cálculo da ${Math.round(computed * 100) / 100}.`,
    );
  }
  return warnings;
}

export const dingooStrategy: UploadStrategy = {
  id: DINGOO_SYSTEM,
  label: "Dingoo (Estado de Resultados)",
  detect,
  parse,
};
