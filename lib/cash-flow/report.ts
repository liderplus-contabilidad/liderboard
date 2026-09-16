/**
 * The printed flow, described as DATA: a header and a list of sections, each a `ChartTable` the
 * report (`ReportTable`) and the Excel (`export/flow-workbook.ts`) both read. It is built from
 * `DerivedFlow` and nothing else — the paper cannot say a figure the screen does not.
 */
import type { ChartTable } from "@/lib/charts/types";
import { formatDayMonthYear, formatTimestampEs } from "@/lib/date";
import type { EntityLogo } from "@/lib/logos";
import { pluralize } from "@/lib/format";
import { documentLabel, money, payableDetail } from "./derive";
import { accountLabel, centerName, type DerivedFlow } from "./flow";
import type { BankAccount, CashFlowCenter, FlowIncome } from "./types";

export interface FlowReportHeader {
  clientName: string;
  logo?: EntityLogo;
  dateLabel: string;
  generatedAt: string;
  accountCount: number;
  lineCount: number;
}

export interface FlowReportSection {
  id: "accounts" | "remaining" | "incomes" | "payments" | "settled" | "loans";
  title: string;
  table: ChartTable;
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
  generatedAt: Date;
}): FlowReport {
  const { derived, centers, accounts, incomes } = input;
  const label = (accountId: string | null) => {
    const account = accounts.find((candidate) => candidate.id === accountId);
    return account ? accountLabel(account, centers) : "Sin cuenta";
  };

  const accountsTable: ChartTable = {
    columns: [
      "Saldo",
      "Sobregiro",
      "Disponible",
      "Ingresos",
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
          row.available,
          row.incomes,
          row.outstanding,
          row.urgent,
          row.pending,
          row.remaining,
        ].map(money),
      })),
      {
        id: "total",
        label: "Total bancos",
        emphasis: true,
        values: [
          derived.totals.balance,
          derived.totals.incomes,
          derived.totals.overdraft,
          derived.totals.bankTotal,
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
        label: income.concept || "Ingreso",
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

  const sections: FlowReportSection[] = [
    { id: "accounts", title: "Flujo de bancos", table: accountsTable },
    { id: "remaining", title: "Saldo faltante o sobrante", table: remainingTable },
    ...(incomes.length > 0
      ? [{ id: "incomes" as const, title: "Ingresos proyectados", table: incomesTable }]
      : []),
    { id: "payments", title: "Pagos marcados por proveedor", table: paymentsTable },
    ...(derived.settled.length > 0
      ? [{ id: "settled" as const, title: "Pagado en esta fecha", table: settledTable }]
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
  return `${pluralize(header.accountCount, "cuenta")} · ${pluralize(header.lineCount, "pago marcado")}`;
}
