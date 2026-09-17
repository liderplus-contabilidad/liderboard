/**
 * The flow's OTHER shape: COMISERSA's `FLUJO MATRIZ`. One row per bank account, the bank figures
 * first (saldo · sobregiro · ingresos · total bancos · cheques no cobrados), then ONE COLUMN PER
 * BENEFICIARIO with marked documents, then what the account pays in all and what is left. A cell
 * answers «how much of whom from where»: the sum of urgente + pendiente of that beneficiario's
 * marked documents whose paying account is that row's. The split between urgente and pendiente is
 * the list's job (`markedSplit`), never repeated here.
 *
 * It is DERIVED from `DerivedFlow` and never stored — the same `deriveFlow` the bank table, the
 * tiles, the report and the Excel read, so every account row here equals the bank table's row to
 * the centavo (the test says so). And it is READ-ONLY on purpose: a document has ONE paying account
 * and a cell can add several documents (the sheet's SRI column holds HA's and HC's SRI on two rows),
 * so a typed cell would have to invent which document moves. The place to edit is the list.
 *
 * Beneficiarios are keyed as `groupBySupplier` keys them (the trimmed, lowercased supplier) and
 * ordered by marked total descending, ties by label: the biggest payments on the left, where the
 * eye starts. A «Sin cuenta» row exists only with several accounts and something marked without
 * one — with ONE account `deriveFlow` already counts the unassigned in it, and this reads the same
 * rule off `derived.accounts` rather than restating it.
 */
import type { ChartTable } from "@/lib/charts/types";
import { money } from "./derive";
import { accountLabel, type DerivedFlow } from "./flow";
import type { CashFlowCenter } from "./types";

export interface MatrixBeneficiary {
  key: string;
  label: string;
  /** Everything marked for this beneficiario, whatever the account. */
  total: number;
}

export interface MatrixBankFigures {
  balance: number;
  overdraft: number;
  incomes: number;
  bankTotal: number;
  outstanding: number;
}

export interface MatrixRow {
  id: string;
  kind: "account" | "unassigned" | "total";
  label: string;
  bank: MatrixBankFigures;
  /** Beneficiario key → what this row pays them. Absent means 0. */
  cells: Record<string, number>;
  /** Σ cells — the sheet's «TOTAL GASTOS». */
  marked: number;
  /** The sheet's «SALDO»; `null` on the unassigned row, which has no bank to be left with. */
  remaining: number | null;
}

export interface PaymentMatrix {
  beneficiaries: MatrixBeneficiary[];
  rows: MatrixRow[];
  /** Whether the empresa has a check register: decides the «Cheques no cobrados» column. */
  hasChecks: boolean;
}

const UNASSIGNED_ID = "unassigned";

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function derivePaymentMatrix(
  derived: DerivedFlow,
  centers: readonly CashFlowCenter[],
  hasChecks: boolean,
): PaymentMatrix {
  const accountIds = new Set(derived.accounts.map((row) => row.account.id));
  // The same choice `deriveFlow` makes: with ONE account nothing is unassigned.
  const onlyAccount = derived.accounts.length === 1 ? derived.accounts[0].account.id : null;

  const beneficiaries = new Map<string, MatrixBeneficiary>();
  const cellsByRow = new Map<string, Record<string, number>>();
  for (const line of derived.lines) {
    const key = line.payable.supplier.trim().toLowerCase();
    const beneficiary = beneficiaries.get(key) ?? {
      key,
      label: line.payable.supplier,
      total: 0,
    };
    beneficiary.total = round2(beneficiary.total + line.amount);
    beneficiaries.set(key, beneficiary);

    const chosen =
      line.payable.payFromAccountId !== null && accountIds.has(line.payable.payFromAccountId)
        ? line.payable.payFromAccountId
        : (onlyAccount ?? UNASSIGNED_ID);
    const cells = cellsByRow.get(chosen) ?? {};
    cells[key] = round2((cells[key] ?? 0) + line.amount);
    cellsByRow.set(chosen, cells);
  }

  const columns = [...beneficiaries.values()].sort(
    (a, b) => b.total - a.total || a.label.localeCompare(b.label),
  );
  const sumOf = (cells: Record<string, number>) =>
    round2(Object.values(cells).reduce((acc, value) => acc + value, 0));

  const rows: MatrixRow[] = derived.accounts.map((row) => {
    const cells = cellsByRow.get(row.account.id) ?? {};
    return {
      id: row.account.id,
      kind: "account",
      label: accountLabel(row.account, centers),
      bank: {
        balance: row.balance,
        overdraft: row.account.overdraft,
        incomes: row.incomes,
        bankTotal: row.bankTotal,
        outstanding: row.outstanding,
      },
      cells,
      marked: round2(row.urgent + row.pending),
      remaining: row.remaining,
    };
  });

  const unassigned = cellsByRow.get(UNASSIGNED_ID);
  if (unassigned && derived.accounts.length > 1) {
    rows.push({
      id: UNASSIGNED_ID,
      kind: "unassigned",
      label: "Sin cuenta",
      bank: {
        balance: 0,
        overdraft: 0,
        incomes: derived.unassignedIncomes,
        bankTotal: derived.unassignedIncomes,
        outstanding: 0,
      },
      cells: unassigned,
      marked: sumOf(unassigned),
      remaining: null,
    });
  }

  const totalCells: Record<string, number> = {};
  for (const column of columns) {
    totalCells[column.key] = round2(
      rows.reduce((acc, row) => acc + (row.cells[column.key] ?? 0), 0),
    );
  }
  rows.push({
    id: "total",
    kind: "total",
    label: "Total",
    bank: {
      balance: derived.totals.balance,
      overdraft: derived.totals.overdraft,
      incomes: derived.totals.incomes,
      bankTotal: derived.totals.bankTotal,
      outstanding: derived.totals.outstanding,
    },
    cells: totalCells,
    marked: round2(derived.totals.urgent + derived.totals.pending),
    remaining: derived.totals.remaining,
  });

  return { beneficiaries: columns, rows, hasChecks };
}

/** The matrix as the report and the Excel read it: the sheet's columns, money formatted. */
export function matrixTable(matrix: PaymentMatrix): ChartTable {
  return {
    columns: [
      "Saldo",
      "Sobregiro",
      "Ingresos",
      "Total bancos",
      ...(matrix.hasChecks ? ["Cheques no cobrados"] : []),
      ...matrix.beneficiaries.map((column) => column.label),
      "Total marcado",
      "Saldo final",
    ],
    rows: matrix.rows.map((row) => {
      const bank = row.kind === "unassigned";
      return {
        id: row.id,
        label: row.label,
        ...(row.kind === "total" ? { emphasis: true } : {}),
        values: [
          bank ? "" : money(row.bank.balance),
          bank ? "" : money(row.bank.overdraft),
          money(row.bank.incomes),
          bank ? "" : money(row.bank.bankTotal),
          ...(matrix.hasChecks ? [bank ? "" : money(row.bank.outstanding)] : []),
          ...matrix.beneficiaries.map((column) => money(row.cells[column.key] ?? 0)),
          money(row.marked),
          row.remaining === null ? "" : money(row.remaining),
        ],
      };
    }),
  };
}
