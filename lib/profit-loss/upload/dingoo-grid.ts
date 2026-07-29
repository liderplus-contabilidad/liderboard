/**
 * Reading an Dingoo `ESTADO DE RESULTADOS` grid: WHERE each element sits. Everything is
 * located by the labels the report itself writes (`Código`, `Nombre de la cuenta`, `Saldo`,
 * `Desde el … al …`, `Resultado del ejercicio`), never by a fixed row or column.
 *
 * The reason is sharper here than a general preference: the sample's sheet range starts at
 * column `B`, and `readGrid` reindexes from the range, so the grid's index 0 is the file's
 * column `B` and its index 6 is the file's column `H`. A coordinate copied from what the
 * accountant sees when opening the file would read a different column, and would do it without
 * an error (design.md, decision 1).
 *
 * Split from the strategy so label location is testable over bare grids, with no workbook
 * fixtures in the way — same shape as `microplus-grid.ts`. Kept convention-free the same way
 * `grid.ts` is: the account-code shape arrives as a predicate, and the sign rule lives in the
 * strategy, which owns it.
 */
import type { DateRange } from "./date-range";
import { compactLabel, toNumber, type Cell } from "./grid";

const CODE_LABEL = "codigo";
const NAME_LABEL = "nombre de la cuenta";
const VALUE_LABEL = "saldo";

/** The labels that name the REPORT, not the client. Skipped wherever the preamble is read: they
 * head the preamble, so "the first non-empty line" would hand back `REPORTE` as the company. */
const REPORT_LABELS = new Set(["reporte", "estado de resultados"]);

/** The result line's opening words. Matched as a PREFIX because the rest of the sentence —
 * `(Utilidad o pérdida):` — is prose the report is free to reword. */
const RESULT_LABEL = "resultado del ejercicio";

/** One line, `al` as the connector, and a free tail after the final date (`. Estado: Aprobados`
 * in the sample) that is deliberately not anchored: a different tail must not break the read. */
const RANGE_LINE = /desde el (\d{1,2})\/(\d{1,2})\/(\d{4}) al (\d{1,2})\/(\d{1,2})\/(\d{4})/i;

function text(cell: Cell): string {
  return typeof cell === "string" ? cell.trim() : "";
}

export interface DingooHeader {
  row: number;
  codeCol: number;
  nameCol: number;
  valueCol: number;
}

/**
 * The header row is the one carrying `Código` AND `Nombre de la cuenta`; the three columns come
 * from where those labels are. `Saldo` is looked for in that same row and, unlike MicroPlus's
 * homonym, it really is the value column — every level of the tree values in it — so a row
 * without it is not a header this format can be read from.
 */
export function findDingooHeader(grid: readonly Cell[][]): DingooHeader | null {
  for (let row = 0; row < grid.length; row++) {
    const cells = grid[row] ?? [];
    let codeCol = -1;
    let nameCol = -1;
    let valueCol = -1;
    for (let col = 0; col < cells.length; col++) {
      const label = compactLabel(cells[col]);
      if (label === CODE_LABEL && codeCol === -1) {
        codeCol = col;
      } else if (label === NAME_LABEL && nameCol === -1) {
        nameCol = col;
      } else if (label === VALUE_LABEL && valueCol === -1) {
        valueCol = col;
      }
    }
    if (codeCol !== -1 && nameCol !== -1 && valueCol !== -1) {
      return { row, codeCol, nameCol, valueCol };
    }
  }
  return null;
}

export interface DingooRange {
  range: DateRange;
  /** Row the range was read from — the boundary the company name is searched above. */
  row: number;
}

/** The range is a single string; it is searched across EVERY cell of every row, not just the
 * first, because which column holds it is not contract. */
export function findDingooRange(grid: readonly Cell[][]): DingooRange | null {
  for (let i = 0; i < grid.length; i++) {
    for (const cell of grid[i] ?? []) {
      const match = RANGE_LINE.exec(text(cell));
      if (match) {
        return {
          row: i,
          range: {
            fromDay: Number(match[1]),
            fromMonth: Number(match[2]) - 1,
            fromYear: Number(match[3]),
            toDay: Number(match[4]),
            toMonth: Number(match[5]) - 1,
            toYear: Number(match[6]),
          },
        };
      }
    }
  }
  return null;
}

/**
 * The company is the first non-empty text cell above the range row, reading left to right,
 * skipping the report's own titles. The sample's next two lines are the razón social and the
 * nombre comercial, differing only in a trailing dot; the FIRST wins. Which of the two is "the
 * right one" does not matter as long as the choice is stable — the company is only ever compared
 * against itself inside the workspace identity, and alternating would make one client look like
 * two (design.md, decision 6).
 */
export function findDingooCompany(grid: readonly Cell[][], beforeRow: number): string {
  for (let i = 0; i < Math.min(beforeRow, grid.length); i++) {
    for (const cell of grid[i] ?? []) {
      const value = text(cell);
      if (value === "" || REPORT_LABELS.has(compactLabel(cell))) {
        continue;
      }
      return value;
    }
  }
  return "";
}

/** The file's own bottom line: the row carrying `Resultado del ejercicio…`, valued by the next
 * non-empty cell to its right. `null` when the file carries no such row — which is not an error,
 * only the absence of something to cross-check against. */
export function findDingooResult(grid: readonly Cell[][]): number | null {
  for (const row of grid ?? []) {
    const labelCol = (row ?? []).findIndex((cell) => compactLabel(cell).startsWith(RESULT_LABEL));
    if (labelCol === -1) {
      continue;
    }
    for (let col = labelCol + 1; col < row.length; col++) {
      if (row[col] !== null && row[col] !== "") {
        return toNumber(row[col]);
      }
    }
    return 0;
  }
  return null;
}

/** One account row as the grid holds it. */
export interface DingooAccountCell {
  code: string;
  name: string;
  value: number;
}

/**
 * The body: every row below the header whose code column holds an account code and whose name
 * column is non-empty. Blank rows and the result line fall out on their own, without a rule of
 * their own.
 *
 * A value is the cell in the `Saldo` column and nowhere else. An empty one is a ZERO: in this
 * format every level values in that same column, so a blank means nothing was posted, and going
 * looking would return the number of something else (design.md, decision 2).
 */
export function readDingooAccounts(
  grid: readonly Cell[][],
  header: DingooHeader,
  isAccountCode: (code: string) => boolean,
): DingooAccountCell[] {
  const accounts: DingooAccountCell[] = [];
  for (let i = header.row + 1; i < grid.length; i++) {
    const row = grid[i] ?? [];
    const code = text(row[header.codeCol]);
    const name = text(row[header.nameCol]);
    if (!code || !name || !isAccountCode(code)) {
      continue;
    }
    accounts.push({ code, name, value: toNumber(row[header.valueCol]) });
  }
  return accounts;
}
