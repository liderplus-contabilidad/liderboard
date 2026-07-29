/**
 * The MicroPlus strategy: reads that system's `BALANCE DE PERDIDAS Y GANANCIAS` and reduces it
 * to the SAME `month-slice` in `single` mode every other strategy produces — MicroPlus has no
 * cost centers, so it is a workspace of one nameless slice and nothing downstream (the merge,
 * `loadedMonths`, the persistence, the engine) learns it exists.
 *
 * What this strategy OWNS, all of it format-specific (see `upload/types.ts`):
 * - the sheet: the first one, whatever it is called (the sample calls it `Sheet1`);
 * - the preamble: located by label, in `microplus-grid.ts`;
 * - the header: `CODIGO` + `NOMBRE DE LA CUENTA`, which is also the whole of `detect`;
 * - the account code: it carries a TRAILING DOT when the account has children, stripped here;
 * - the sign: MicroPlus keeps expenses NEGATIVE and adds (`RESULTADO = 4 + 5`), the app keeps
 *   them positive and subtracts, so branch 5 is negated at import (design.md decision 4);
 * - the period: the `Desde:`/`Hasta:` range, held to the same exact-calendar-month rule as the
 *   other monthly formats — no accumulated subtraction, no per-vendor exception.
 *
 * Read-only: `writesOwnFormat` is deliberately absent (design.md decision 6).
 */
import { buildAccountTree, computeResult, computeRollups } from "../derive";
import { PygParseError } from "../errors";
import type { AccountRow } from "../types";
import { toCalendarMonth } from "./date-range";
import { readGrid } from "./grid";
import type { Cell } from "./grid";
import {
  findMicroplusCompany,
  findMicroplusHeader,
  findMicroplusRange,
  findMicroplusResult,
  readMicroplusAccounts,
  type MicroplusHeader,
} from "./microplus-grid";
import { MICROPLUS_SYSTEM } from "./systems";
import type { StagedUpload, UploadCandidate, UploadStrategy } from "./types";

/** Owned by this strategy: MicroPlus writes `4.1.01.` for a parent and `4.1.01.01.01` for a
 * movement account, so the trailing dot is part of the shape it accepts. */
const ACCOUNT_CODE = /^\d+(\.\d+)*\.?$/;
/** Tolerance for float drift when validating the file's `RESULTADO:` row (one cent). */
const SUM_TOLERANCE = 0.011;

interface Located {
  grid: Cell[][];
  header: MicroplusHeader;
}

function locate(candidate: UploadCandidate): Located | null {
  let grid: Cell[][];
  try {
    grid = readGrid(candidate.workbook, candidate.workbook.SheetNames[0]);
  } catch {
    return null;
  }
  const header = findMicroplusHeader(grid);
  return header ? { grid, header } : null;
}

/**
 * The header row AND the `Desde:`/`Hasta:` range row. The header alone is NOT enough: label
 * comparison ignores case and accents, so Dingoo's `Código · Nombre de la cuenta · Saldo` row
 * normalizes to exactly this signature and MicroPlus used to claim its files — verified against
 * `.context/bongoo/RptEstadoResultados.xlsx`, where `detect` matched and `parse` then died asking
 * for a range that format never carries.
 *
 * The range row is what no other registered format produces, and `parse` already required it: a
 * strategy must not claim a file it cannot parse (`pyg-upload-strategies` › «Resolución ordenada,
 * primer acierto»). With this, telling the two formats apart no longer rests on the registry's
 * order.
 *
 * Never the file name (the sample is `mayo.xls`) nor the sheet name (`Sheet1`); neither is
 * contract.
 */
function detect(candidate: UploadCandidate): boolean {
  const located = locate(candidate);
  return located !== null && findMicroplusRange(located.grid) !== null;
}

/** Strips the trailing dot MicroPlus uses to mark a parent account. Segments keep their leading
 * zeros (`4.1.01`): they are part of the code, and the ordering reads segments as numbers. */
export function normalizeMicroplusCode(rawCode: string): string {
  return rawCode.endsWith(".") ? rawCode.slice(0, -1) : rawCode;
}

/**
 * Cross-checks the trailing-dot marker against the tree the app derives from the codes. The
 * marker is a perfect leaf/parent flag in the sample (70 dotted, all with children; 145
 * undotted, none with children), but it stays a CHECK and never becomes a "declared leaf" in
 * the domain model — no other format could supply it, and `derive.ts`, the cell edit rule and
 * the account ficha would then have to pick which one to believe (design.md decision 3). When
 * the two disagree, this says so and the derived tree wins.
 */
export function checkParentMarkers(
  entries: readonly { rawCode: string; code: string }[],
): string[] {
  const warnings: string[] = [];
  for (const entry of entries) {
    const declaredParent = entry.rawCode.endsWith(".");
    const prefix = `${entry.code}.`;
    const hasChildren = entries.some(
      (other) => other.code !== entry.code && other.code.startsWith(prefix),
    );
    if (declaredParent && !hasChildren) {
      warnings.push(
        `La cuenta ${entry.code} viene marcada como cuenta padre pero no tiene cuentas anidadas ` +
          "en el archivo; se conserva el árbol derivado de los códigos.",
      );
    } else if (!declaredParent && hasChildren) {
      warnings.push(
        `La cuenta ${entry.code} no viene marcada como cuenta padre pero tiene cuentas anidadas ` +
          "en el archivo; se conserva el árbol derivado de los códigos.",
      );
    }
  }
  return warnings;
}

/** Branch 5 (costs and expenses) is negated at the border so the app's `Utilidad = Ingresos −
 * Gastos` reproduces the file's `RESULTADO = 4 + 5`. The positive counter-accounts inside it
 * (`(-) DESCUENTO EN COMPRAS`) are negated like everything else: negative, they subtract
 * expense, which is their job. */
export function applyMicroplusSign(code: string, value: number): number {
  return code.split(".")[0] === "5" ? -value : value;
}

function parse(candidate: UploadCandidate): StagedUpload {
  const located = locate(candidate);
  if (!located) {
    throw new PygParseError("no-header");
  }
  const { grid, header } = located;

  const found = findMicroplusRange(grid);
  if (!found) {
    throw new PygParseError(
      "missing-date-range",
      'El archivo de MicroPlus debe declarar su rango de fechas ("Desde:" y "Hasta:"); no se ' +
        "encontró esa línea.",
    );
  }
  const outcome = toCalendarMonth(found.range);
  if (!outcome.ok) {
    throw new PygParseError("invalid-date-range", outcome.message);
  }

  const reading = readMicroplusAccounts(grid, header, (code) => ACCOUNT_CODE.test(code));
  if (reading.accounts.length === 0) {
    throw new PygParseError("no-accounts");
  }

  const normalized = reading.accounts.map((account) => ({
    rawCode: account.rawCode,
    code: normalizeMicroplusCode(account.rawCode),
    name: account.name,
    value: account.value,
  }));
  const accounts: AccountRow[] = normalized.map((account) => ({
    code: account.code,
    name: account.name,
    values: [applyMicroplusSign(account.code, account.value)],
  }));

  const warnings = [
    ...reading.warnings,
    ...checkParentMarkers(normalized),
    ...validateResultAgainstFile(accounts, findMicroplusResult(grid)),
  ];

  return {
    kind: "month-slice",
    mode: "single",
    system: MICROPLUS_SYSTEM,
    year: outcome.year,
    month: outcome.month,
    companyName: findMicroplusCompany(grid, found.row),
    centers: [{ name: "", centerId: null, accounts }],
    warnings,
  };
}

/** The file's `RESULTADO:` row is validation input only — recompute it from the file's own
 * accounts (already sign-normalized) and report a mismatch beyond one cent. */
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
  const computed = values[0] ?? 0;
  if (Math.abs(resultFromFile - computed) > SUM_TOLERANCE) {
    warnings.push(
      `Descuadre en el RESULTADO del archivo: trae ${resultFromFile}, el cálculo da ${Math.round(computed * 100) / 100}.`,
    );
  }
  return warnings;
}

export const microplusStrategy: UploadStrategy = {
  id: MICROPLUS_SYSTEM,
  label: "MicroPlus (Balance de Pérdidas y Ganancias)",
  detect,
  parse,
};
