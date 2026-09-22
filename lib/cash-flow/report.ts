/**
 * The printed flow, described as DATA: a header and a list of sections, each a `ChartTable` the
 * report (`ReportTable`) and the Excel (`export/flow-workbook.ts`) both read. It is built from
 * `DerivedFlow` and nothing else — the paper cannot say a figure the screen does not.
 */
import type { ChartTable } from "@/lib/charts/types";
import { formatDayMonthYear, formatTimestampEs } from "@/lib/date";
import type { EntityLogo } from "@/lib/logos";
import { pluralize } from "@/lib/format";
import { balanceNoteKey, overdraftNoteKey, payableNoteKey } from "./cell-notes";
import { documentLabel, money, payableDetail } from "./derive";
import { accountLabel, centerName, type DerivedFlow, incomeLabel } from "./flow";
import { derivePaymentMatrix, matrixTable } from "./matrix";
import type { BankAccount, CashFlowCenter, FlowIncome } from "./types";

export interface FlowReportHeader {
  clientName: string;
  logo?: EntityLogo;
  dateLabel: string;
  generatedAt: string;
  accountCount: number;
  lineCount: number;
}

/** A cell note, placed on the row the Excel writes: `column` 0 is the row's label, 1…n its values. */
export interface FlowCellNote {
  rowId: string;
  column: number;
  text: string;
}

/**
 * What a printed cell IS, so the paper can wear the screen's colours without the pure layer naming
 * one: `urgent` is what must leave first (the screen's amber), `pending` what can wait (a quiet
 * ground of its own, so the two columns are told apart at a glance), `outstanding` the checks already
 * written (the screen's check ink), `signed` a figure whose SIGN is the reading (a faltante is red,
 * with its ▼). The view translates each to a token; the Excel reads none.
 */
export type FlowCellTone = "urgent" | "pending" | "outstanding" | "signed";
/** What a printed row IS: a supplier's heading over its documents, or the table's closing sum. */
export type FlowRowTone = "group" | "total";

/** How a printed cell is PAINTED — the tone once the figure is read. The two marks of payment paint
 *  their WHOLE column, zeros included, so urgent and pending read as two columns even on a flow
 *  with nothing urgent; any other tone leaves a zero or an empty cell plain, and a signed figure is
 *  painted by its sign. */
export type FlowCellPaint = "urgent" | "pending" | "outstanding" | "negative" | "positive";

/** The glyph a signed figure always carries: the colour never travels alone. */
export const SIGN_GLYPH: Record<"negative" | "positive", string> = {
  negative: "▼",
  positive: "▲",
};

/** Whether a formatted figure says something: an empty cell or a zero does not. */
export function hasFigure(value: string | null): value is string {
  return value !== null && /[1-9]/.test(value);
}

/**
 * The ONE rule of which printed cell is painted and how — the PDF and the Excel both ask it, so the
 * two papers cannot colour different cells. The total row wins over its cells; a heading wins over
 * every cell but the two marks of payment.
 */
export function cellPaint(
  section: FlowReportSection,
  rowId: string,
  column: string,
  value: string | null,
): FlowCellPaint | null {
  const tone = section.columnTones?.[column];
  const rowTone = section.rowTones?.[rowId];
  // The TOTAL row is painted whole. A supplier's heading keeps the two marks' columns in their own
  // ground and ink, so the columns run unbroken and a heading's zero never reads in brand blue.
  if (!tone || rowTone === "total") {
    return null;
  }
  if (tone === "urgent" || tone === "pending") {
    return tone;
  }
  if (rowTone) {
    return null;
  }
  if (!hasFigure(value)) {
    return null;
  }
  if (tone === "signed") {
    return value.trim().startsWith("-") ? "negative" : "positive";
  }
  return tone;
}

export interface FlowReportSection {
  id: "accounts" | "remaining" | "incomes" | "payments" | "matrix" | "settled" | "loans";
  title: string;
  table: ChartTable;
  /** The screen's cell notes that fall in this table — the Excel writes them as comments, the
   *  printed report ignores them (on paper there is nothing to hover). */
  notes?: FlowCellNote[];
  /** Column name → tone, for the columns that mean something beyond a figure. */
  columnTones?: Record<string, FlowCellTone>;
  /** Row id → tone; a row absent here is an ordinary line. */
  rowTones?: Record<string, FlowRowTone>;
}

export interface FlowReport {
  header: FlowReportHeader;
  sections: FlowReportSection[];
}

export function buildFlowReport(input: {
  clientName: string;
  logo?: EntityLogo;
  derived: DerivedFlow;
  incomes: readonly FlowIncome[];
  accounts: readonly BankAccount[];
  centers: readonly CashFlowCenter[];
  /** Whether the empresa keeps a check register: the matrix's «Cheques no cobrados» column. */
  hasChecks?: boolean;
  /** The flow's cell notes (`PaymentFlow.notes`). */
  notes?: Readonly<Record<string, string>>;
  generatedAt: Date;
}): FlowReport {
  const { derived, centers, accounts, incomes } = input;
  const notes = input.notes ?? {};
  /** The notes of one table: each `[rowId, column name — null for the label —, key]` that has a
   *  note becomes a cell. The column is FOUND by its name, so a table that gains a column (one per
   *  income label) still puts every note in its place; a row the table does not write has none. */
  const notesIn = (
    table: ChartTable,
    cells: readonly (readonly [rowId: string, column: string | null, key: string])[],
  ): FlowCellNote[] => {
    const rows = new Set(table.rows.map((row) => row.id));
    return cells.flatMap(([rowId, column, key]) => {
      const text = notes[key];
      // + 1: `column` counts from the row's label (0); a column the table lacks lands on 0 too,
      // which only the label may use.
      const index = column === null ? 0 : table.columns.indexOf(column) + 1;
      if (!text || !rows.has(rowId) || (column !== null && index === 0)) {
        return [];
      }
      return [{ rowId, column: index, text }];
    });
  };
  const label = (accountId: string | null) => {
    const account = accounts.find((candidate) => candidate.id === accountId);
    return account ? accountLabel(account, centers) : "Sin cuenta";
  };

  const hasIncomes = derived.incomeColumns.length > 0;
  const accountsTable: ChartTable = {
    columns: [
      "Saldo",
      "Sobregiro",
      "Total bancos",
      ...derived.incomeColumns.map((column) => column.label),
      ...(hasIncomes ? ["Total ingresos"] : []),
      "Cheques no cobrados",
      "Urgente",
      "Pendiente",
      "Saldo final",
    ],
    rows: [
      ...derived.accounts.map((row) => ({
        id: row.account.id,
        label: accountLabel(row.account, centers),
        values: [
          row.balance,
          row.account.overdraft,
          row.bankTotal,
          ...derived.incomeColumns.map((column) => column.byAccount[row.account.id] ?? 0),
          ...(hasIncomes ? [row.incomes] : []),
          row.outstanding,
          row.urgent,
          row.pending,
          row.remaining,
        ].map(money),
      })),
      {
        id: "total",
        label: "Total",
        emphasis: true,
        // The same order as the rows above — the printed total is read column by column.
        values: [
          derived.totals.balance,
          derived.totals.overdraft,
          derived.totals.bankTotal,
          ...derived.incomeColumns.map((column) => column.total),
          ...(hasIncomes ? [derived.totals.incomes] : []),
          derived.totals.outstanding,
          derived.totals.urgent,
          derived.totals.pending,
          derived.totals.remaining,
        ].map(money),
      },
    ],
  };

  const incomesTable: ChartTable = {
    columns: ["Cuenta", "Monto"],
    rows: [
      ...incomes.map((income) => ({
        id: income.id,
        label: incomeLabel(income),
        values: [label(income.accountId), money(income.amount)],
      })),
      {
        id: "total",
        label: "Total ingresos",
        emphasis: true,
        values: ["", money(derived.totals.incomes)],
      },
    ],
  };

  const paymentRows: ChartTable["rows"] = [];
  const lineOf = (id: string) => derived.lines.find((line) => line.payable.id === id);
  for (const group of derived.groups) {
    const urgent = group.payables.reduce((acc, p) => acc + (lineOf(p.id)?.urgent ?? 0), 0);
    const pending = group.payables.reduce((acc, p) => acc + (lineOf(p.id)?.pending ?? 0), 0);
    paymentRows.push({
      id: `g-${group.key}`,
      label: group.label,
      emphasis: true,
      values: ["", "", "", "", money(urgent + pending), money(urgent), money(pending)],
    });
    for (const payable of group.payables) {
      const line = lineOf(payable.id);
      const detail = payableDetail(payable, { center: false });
      paymentRows.push({
        id: payable.id,
        label: [documentLabel(payable) || payable.supplier, detail].filter(Boolean).join(" — "),
        values: [
          formatDayMonthYear(payable.issuedOn) ?? "",
          formatDayMonthYear(payable.dueOn) ?? "",
          label(payable.payFromAccountId),
          formatDayMonthYear(payable.payOn) ?? "",
          money(line?.amount ?? 0),
          line && line.urgent > 0 ? money(line.urgent) : "",
          line && line.pending > 0 ? money(line.pending) : "",
        ],
      });
    }
  }
  paymentRows.push({
    id: "total",
    label: "Total",
    emphasis: true,
    values: [
      "",
      "",
      "",
      "",
      money(derived.totals.urgent + derived.totals.pending),
      money(derived.totals.urgent),
      money(derived.totals.pending),
    ],
  });
  const paymentsTable: ChartTable = {
    columns: ["Emisión", "Vence", "Cuenta", "Programado", "Saldo", "Urgente", "Pendiente"],
    rows: paymentRows,
  };

  const settledTable: ChartTable = {
    columns: ["Pagado el", "Monto"],
    rows: [
      ...derived.settled.map(({ payable, settledOn }) => ({
        id: payable.id,
        label: [payable.supplier, documentLabel(payable)].filter(Boolean).join(" — "),
        values: [formatDayMonthYear(settledOn) ?? settledOn, money(payable.balance)],
      })),
      {
        id: "total",
        label: "Total pagado",
        emphasis: true,
        values: ["", money(derived.settledTotal)],
      },
    ],
  };

  // The sheet's «SALDO FALTANTE» row, its three figures.
  const remainingTable: ChartTable = {
    columns: ["Saldo"],
    rows: [
      {
        id: "all",
        label: "Tras todo lo marcado",
        emphasis: true,
        values: [money(derived.totals.remaining)],
      },
      {
        id: "urgent",
        label: "Pagando solo lo urgente",
        values: [money(derived.totals.remainingUrgentOnly)],
      },
      {
        id: "pending",
        label: "Pagando solo lo pendiente",
        values: [money(derived.totals.remainingPendingOnly)],
      },
    ],
  };

  const loansTable: ChartTable = {
    columns: ["Monto"],
    rows: derived.loans.map((loan) => ({
      id: `${loan.fromCenterId}-${loan.toCenterId}`,
      label: `${centerName(loan.fromCenterId, centers)} → ${centerName(loan.toCenterId, centers)}`,
      values: [money(loan.amount)],
    })),
  };

  const accountNotes = notesIn(
    accountsTable,
    derived.accounts.flatMap((row) => [
      [row.account.id, "Saldo", balanceNoteKey(row.account.id)] as const,
      [row.account.id, "Sobregiro", overdraftNoteKey(row.account.id)] as const,
    ]),
  );
  // The report has no «Estado» column: the state's note goes on the document's own name.
  const paymentNotes = notesIn(
    paymentsTable,
    derived.lines.flatMap(({ payable }) => [
      [payable.id, null, payableNoteKey(payable.id, "priority")] as const,
      [payable.id, "Cuenta", payableNoteKey(payable.id, "account")] as const,
      [payable.id, "Programado", payableNoteKey(payable.id, "payOn")] as const,
      [payable.id, "Urgente", payableNoteKey(payable.id, "urgent")] as const,
      [payable.id, "Pendiente", payableNoteKey(payable.id, "pending")] as const,
    ]),
  );
  const withNotes = (found: FlowCellNote[]) => (found.length > 0 ? { notes: found } : {});
  // The same readings the screen colours: the urgent in amber, the checks in their ink, what is left
  // by its sign — and the closing row of every table, and each supplier's heading, as rows apart.
  const TOTAL: Record<string, FlowRowTone> = { total: "total" };
  const bankTones: Record<string, FlowCellTone> = {
    Urgente: "urgent",
    Pendiente: "pending",
    "Cheques no cobrados": "outstanding",
    "Saldo final": "signed",
  };

  const sections: FlowReportSection[] = [
    {
      id: "accounts",
      title: "Flujo de bancos",
      table: accountsTable,
      ...withNotes(accountNotes),
      columnTones: bankTones,
      rowTones: TOTAL,
    },
    {
      id: "remaining",
      title: "Saldo faltante o sobrante",
      table: remainingTable,
      columnTones: { Saldo: "signed" },
    },
    ...(incomes.length > 0
      ? [
          {
            id: "incomes" as const,
            title: "Ingresos",
            table: incomesTable,
            rowTones: TOTAL,
          },
        ]
      : []),
    {
      id: "payments",
      title: "Pagos marcados por proveedor",
      table: paymentsTable,
      ...withNotes(paymentNotes),
      columnTones: { Urgente: "urgent", Pendiente: "pending" },
      rowTones: {
        ...Object.fromEntries(derived.groups.map((group) => [`g-${group.key}`, "group" as const])),
        ...TOTAL,
      },
    },
    // The flow's other shape, printed ALWAYS there is something marked: on paper there are no
    // controls, so the screen's «Ver como» decides nothing here.
    ...(derived.lines.length > 0
      ? [
          {
            id: "matrix" as const,
            title: "Matriz de pagos",
            table: matrixTable(derivePaymentMatrix(derived, centers, input.hasChecks ?? false)),
            columnTones: bankTones,
            rowTones: TOTAL,
          },
        ]
      : []),
    ...(derived.settled.length > 0
      ? [
          {
            id: "settled" as const,
            title: "Pagado en esta fecha",
            table: settledTable,
            rowTones: TOTAL,
          },
        ]
      : []),
    ...(derived.loans.length > 0
      ? [{ id: "loans" as const, title: "Préstamos entre centros", table: loansTable }]
      : []),
  ];

  return {
    header: {
      clientName: input.clientName,
      ...(input.logo ? { logo: input.logo } : {}),
      dateLabel: formatDayMonthYear(derived.date) ?? derived.date,
      generatedAt: formatTimestampEs(input.generatedAt),
      accountCount: derived.accounts.length,
      lineCount: derived.lines.length,
    },
    sections,
  };
}

export function flowReportSubtitle(header: FlowReportHeader): string {
  return `${pluralize(header.accountCount, "cuenta")} · ${pluralize(header.lineCount, "pago marcado", "pagos marcados")}`;
}
