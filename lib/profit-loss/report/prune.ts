/**
 * Drops the accounts that did not move, so the printed statement is the chart of accounts that
 * was USED and not the one that was declared.
 *
 * A real plan declares hundreds of accounts and a close moves a few dozen; printing the rest
 * spends pages on zeros and buries the rows that say something. On screen the cost of an idle
 * row is a bit of scroll, which is why Datos keeps showing them — there, seeing that an account
 * exists and is at zero is sometimes the answer. On paper it is a page.
 *
 * **`null` and `0` are treated the same HERE and nowhere else.** For the question this module
 * asks — «¿vale la pena imprimir esta fila?» — a month never loaded and a month loaded at zero
 * are both "nothing to read". Everywhere else in the engine the distinction is load-bearing and
 * stays intact: in the rows that DO get printed, an uncovered period still renders empty and
 * never as `$0`.
 */
import type { VerticalAnalysis } from "../charts/vertical";
import { sliceColumns } from "../datos-columns";
import type { DatosGrid, DatosRow } from "../datos-types";

/**
 * The grid with every movement-less account removed, its subtree along with it.
 *
 * A parent survives if any descendant moved — otherwise its surviving descendants would be left
 * hanging off nothing. Summary rows (`isResult`) always survive: a result of zero is still the
 * result, and a statement that closes without its «Utilidad o Pérdida» is not a statement.
 *
 * `columns` is left untouched HERE: this answers which ROWS are worth printing. The columns are
 * `pruneEmptyColumns`'s question, asked separately so neither prune can hide the other's evidence
 * — a cell that saves its row saves its column too.
 */
export function pruneEmptyRows(grid: DatosGrid): DatosGrid {
  return { ...grid, rows: pruneRows(grid.rows) };
}

function pruneRows(rows: readonly DatosRow[]): DatosRow[] {
  const kept: DatosRow[] = [];
  for (const row of rows) {
    if (row.isResult) {
      kept.push(row);
      continue;
    }
    const children = row.children ? pruneRows(row.children) : undefined;
    // Either the account itself moved, or something under it did and needs a parent to hang off.
    if (!hasMovement(row) && (children === undefined || children.length === 0)) {
      continue;
    }
    kept.push(children === undefined ? row : { ...row, children });
  }
  return kept;
}

/** Whether a row has a single cell worth reading: not null, and not zero. */
function hasMovement(row: DatosRow): boolean {
  return row.cells.some((cell) => cell.value !== null && cell.value !== 0);
}

/**
 * Removes columns with no activity in any account. Each table is processed independently.
 * The Total column is retained if it reflects any activity; otherwise, it is removed.
 */
export function pruneEmptyColumns(grid: DatosGrid): DatosGrid {
  const positions: number[] = [];
  for (let position = 0; position < grid.columns.length; position++) {
    if (columnHasMovement(grid.rows, position)) {
      positions.push(position);
    }
  }
  return sliceColumns(grid, positions);
}

function columnHasMovement(rows: readonly DatosRow[], position: number): boolean {
  return rows.some((row) => {
    const cell = row.cells[position];
    return (
      (cell !== undefined && cell.value !== null && cell.value !== 0) ||
      (row.children !== undefined && columnHasMovement(row.children, position))
    );
  });
}

/**
 * The same idea over the vertical analysis: a row whose share is nil in every period says
 * nothing, and printed at the scale of a real chart of accounts it says nothing over several
 * pages. The base account is always kept — every other row is read against it, so a table
 * without it stops being a vertical analysis.
 *
 * Unlike the statement, this list is FLAT, so there is no subtree to carry along: a parent whose
 * share is nil while a descendant's is not simply survives on its own row.
 */
export function pruneVerticalRows(table: VerticalAnalysis): VerticalAnalysis {
  const baseCode = table.base?.code;
  return {
    ...table,
    rows: table.rows.filter(
      (row) => row.code === baseCode || isSignificant(row.total) || row.values.some(isSignificant),
    ),
  };
}

function isSignificant(value: number | null): boolean {
  return value !== null && value !== 0;
}
