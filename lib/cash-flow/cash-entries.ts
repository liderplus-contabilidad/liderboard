/**
 * «Cargas cash», DERIVED. The book's sheet is three matrices with the same columns — one per
 * center (HA · HC · HK) and one per LOAN between two of them (HA-HC · HC-HA) — where the contador
 * writes what is paid from the TILL and is pending approval. The first two (MOVIMIENTO INICIAL ·
 * VARIOS) are typed by hand and stored as `CashEntry` rows; the third (PROVEEDORES) is what the
 * book pointed at with a formula per supplier, and here it is READ off the cartera: the open
 * documents carrying the `cash` label, one row per supplier, `markedAmount` under the center their label
 * resolves to. Nothing of this is stored — the column totals, the loan columns and the third
 * matrix are all computed on every render, so the screen and the Excel cannot disagree.
 *
 * The columns are ONE answer for the three sections (`columnsFor`): a center column per center of
 * the empresa in its order —or the lone «Monto» column when it declares none—, a loan column for
 * each (from → to) pair that some row of THAT section uses (never the empty combinations: with
 * three centers that would be six blank columns), and «Sin centro» only in PROVEEDORES and only
 * when a document's label resolves to no center. A key of `amounts` or an end of a loan that is no
 * longer a center is ignored, so deleting a center never breaks a row.
 */
import { groupBySupplier, markedAmount } from "./derive";
import { resolveCenterId } from "./filters";
import type { CashEntry, CashFlowCenter, CashLoan, CashSectionId, Payable } from "./types";

export type CashMatrixSectionId = CashSectionId | "suppliers";

export const CASH_SECTION_TITLES: Record<CashMatrixSectionId, string> = {
  initial: "Movimiento inicial",
  misc: "Varios",
  suppliers: "Proveedores",
};

/** The hand-written sections, in the order the sheet stacks them. */
export const CASH_MANUAL_SECTIONS: readonly CashSectionId[] = ["initial", "misc"];

/** The lone column of an empresa without centers, and the key its `amounts` are stored under. */
export const CASH_AMOUNT_KEY = "";
const UNASSIGNED_KEY = "unassigned";

export interface CashColumn {
  /** A center id, `CASH_AMOUNT_KEY`, `${from}→${to}` for a loan, or `"unassigned"`. */
  id: string;
  kind: "center" | "amount" | "loan" | "unassigned";
  /** «HC» · «Monto» · «HA-HC» · «Sin centro». */
  label: string;
}

export interface CashRow {
  id: string;
  date: string;
  detail: string;
  /** Column id → amount; a column with nothing on this row is absent. */
  cells: Record<string, number>;
  observation: string;
  /** The stored row behind a manual line — what the grid edits. */
  entry?: CashEntry;
  /** The documents behind a PROVEEDORES line — what the grid opens. */
  payableIds?: string[];
}

export interface CashSection {
  id: CashMatrixSectionId;
  title: string;
  columns: CashColumn[];
  rows: CashRow[];
  /** Column id → sum of that column, every column present (zero when empty). */
  totals: Record<string, number>;
}

export interface CashMatrix {
  sections: CashSection[];
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function loanColumnId(loan: Pick<CashLoan, "fromCenterId" | "toCenterId">): string {
  return `${loan.fromCenterId}→${loan.toCenterId}`;
}

/** A loan is USABLE when both ends are centers of the empresa and differ. */
export function isValidLoan(
  loan: CashLoan | null,
  centers: readonly CashFlowCenter[],
): loan is CashLoan {
  if (!loan || loan.fromCenterId === loan.toCenterId) {
    return false;
  }
  const ids = new Set(centers.map((center) => center.id));
  return ids.has(loan.fromCenterId) && ids.has(loan.toCenterId);
}

/**
 * The columns of one section: the centers (or «Monto»), then the loan pairs the section's rows
 * use, ordered by the centers' own order (every HA-x before any HC-x), then «Sin centro» if asked.
 */
function columnsFor(
  centers: readonly CashFlowCenter[],
  loans: readonly CashLoan[],
  withUnassigned: boolean,
): CashColumn[] {
  if (centers.length === 0) {
    return [{ id: CASH_AMOUNT_KEY, kind: "amount", label: "Monto" }];
  }
  const columns: CashColumn[] = centers.map((center) => ({
    id: center.id,
    kind: "center",
    label: center.name,
  }));
  const index = new Map(centers.map((center, i) => [center.id, i]));
  const name = (id: string) => centers.find((center) => center.id === id)?.name ?? id;
  const pairs = new Map<string, CashLoan>();
  for (const loan of loans) {
    pairs.set(loanColumnId(loan), loan);
  }
  const ordered = [...pairs.values()].sort(
    (a, b) =>
      (index.get(a.fromCenterId) ?? 0) - (index.get(b.fromCenterId) ?? 0) ||
      (index.get(a.toCenterId) ?? 0) - (index.get(b.toCenterId) ?? 0),
  );
  for (const loan of ordered) {
    columns.push({
      id: loanColumnId(loan),
      kind: "loan",
      label: `${name(loan.fromCenterId)}-${name(loan.toCenterId)}`,
    });
  }
  if (withUnassigned) {
    columns.push({ id: UNASSIGNED_KEY, kind: "unassigned", label: "Sin centro" });
  }
  return columns;
}

function totalsOf(
  columns: readonly CashColumn[],
  rows: readonly CashRow[],
): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const column of columns) {
    totals[column.id] = round2(rows.reduce((acc, row) => acc + (row.cells[column.id] ?? 0), 0));
  }
  return totals;
}

function manualSection(
  id: CashSectionId,
  entries: readonly CashEntry[],
  centers: readonly CashFlowCenter[],
): CashSection {
  const own = entries.filter((entry) => entry.section === id);
  const loans = own.map((entry) => entry.loan).filter((loan) => isValidLoan(loan, centers));
  const columns = columnsFor(centers, loans, false);
  const known = new Set(columns.map((column) => column.id));
  const rows: CashRow[] = own.map((entry) => {
    const cells: Record<string, number> = {};
    for (const [key, amount] of Object.entries(entry.amounts)) {
      if (known.has(key) && amount) {
        cells[key] = amount;
      }
    }
    if (isValidLoan(entry.loan, centers) && entry.loan.amount) {
      cells[loanColumnId(entry.loan)] = entry.loan.amount;
    }
    return {
      id: entry.id,
      date: entry.date,
      detail: entry.detail,
      cells,
      observation: entry.observation,
      entry,
    };
  });
  return { id, title: CASH_SECTION_TITLES[id], columns, rows, totals: totalsOf(columns, rows) };
}

/** The open documents carrying the cash label — what PROVEEDORES lists, whatever their priority. */
export function cashPayables(payables: readonly Payable[]): Payable[] {
  return payables.filter((payable) => payable.status === "open" && payable.cash);
}

function suppliersSection(
  payables: readonly Payable[],
  centers: readonly CashFlowCenter[],
): CashSection {
  const groups = groupBySupplier(cashPayables(payables));
  const columnOf = (payable: Payable): string =>
    centers.length === 0
      ? CASH_AMOUNT_KEY
      : (resolveCenterId(payable.centerName, centers) ?? UNASSIGNED_KEY);
  const rows: CashRow[] = groups.map((group) => {
    const cells: Record<string, number> = {};
    let date = "";
    for (const payable of group.payables) {
      const column = columnOf(payable);
      cells[column] = round2((cells[column] ?? 0) + markedAmount(payable));
      if (payable.cutDate > date) {
        date = payable.cutDate;
      }
    }
    return {
      id: group.key,
      date,
      detail: group.label,
      cells,
      observation: "",
      payableIds: group.payables.map((payable) => payable.id),
    };
  });
  const unassigned = rows.some((row) => row.cells[UNASSIGNED_KEY] !== undefined);
  const columns = columnsFor(centers, [], unassigned);
  return {
    id: "suppliers",
    title: CASH_SECTION_TITLES.suppliers,
    columns,
    rows,
    totals: totalsOf(columns, rows),
  };
}

/**
 * The three matrices. `payables` is the bar's scope (the center mark narrows PROVEEDORES as it
 * narrows the flow); the manual rows are never narrowed — they are the empresa's own list.
 */
export function deriveCashMatrix(
  entries: readonly CashEntry[],
  centers: readonly CashFlowCenter[],
  payables: readonly Payable[],
): CashMatrix {
  return {
    sections: [
      manualSection("initial", entries, centers),
      manualSection("misc", entries, centers),
      suppliersSection(payables, centers),
    ],
  };
}
