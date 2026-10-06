/** PDF presentation of the same derived figures the workbook reads. */
import { formatDayMonthYear } from "@/lib/date";
import { statementFit, type StatementFit } from "@/lib/report/page-fit";
import { documentLabel, money, payableDetail } from "./derive";
import { accountLabel } from "./flow";
import { buildFlowReport, type FlowCellTone, type FlowReportSection } from "./report";

export interface PdfFlowSection extends FlowReportSection {
  /** Transposition moves a figure's meaning from its column to its row. */
  figureRowTones?: Record<string, FlowCellTone>;
  totalColumn?: string;
}

function transpose(section: FlowReportSection): PdfFlowSection {
  return {
    id: section.id,
    title: section.title,
    totalColumn: "Total",
    rowTones: Object.fromEntries(
      section.table.columns.flatMap((column, index) =>
        column.startsWith("Total")
          ? [[String(index), "total" as const]]
          : column === "Saldo final"
            ? [[String(index), "group" as const]]
            : [],
      ),
    ),
    figureRowTones: Object.fromEntries(
      section.table.columns.flatMap((column, index) =>
        section.columnTones?.[column] ? [[String(index), section.columnTones[column]]] : [],
      ),
    ),
    table: {
      columns: section.table.rows.map((row) => row.label),
      rows: section.table.columns.map((column, index) => ({
        id: String(index),
        label: column,
        emphasis: column.startsWith("Total") || column === "Saldo final",
        values: section.table.rows.map((row) => row.values[index] ?? null),
      })),
    },
  };
}

export function buildPdfFlowReport(input: Parameters<typeof buildFlowReport>[0]) {
  const report = buildFlowReport(input);
  const { derived, centers } = input;
  const payments = report.sections.find((section) => section.id === "payments")!;
  const accountIds = new Set(derived.accounts.map((row) => row.account.id));
  const onlyAccount = derived.accounts.length === 1 ? derived.accounts[0].account.id : null;
  const accountOf = (id: string | null) => (id && accountIds.has(id) ? id : onlyAccount);
  const unassigned = derived.lines.some(
    (line) => accountOf(line.payable.payFromAccountId) === null,
  );
  const columns = [
    ...derived.accounts.map((row) => ({
      id: row.account.id,
      label: accountLabel(row.account, centers),
    })),
    ...(unassigned ? [{ id: null, label: "Sin cuenta" }] : []),
  ];
  const rows: PdfFlowSection["table"]["rows"] = [];
  const rowTones: PdfFlowSection["rowTones"] = { total: "total" };
  const lineById = new Map(derived.lines.map((line) => [line.payable.id, line]));
  const valuesOf = (lines: typeof derived.lines) => [
    ...columns.map((column) =>
      money(
        lines.reduce(
          (sum, line) =>
            sum + (accountOf(line.payable.payFromAccountId) === column.id ? line.amount : 0),
          0,
        ),
      ),
    ),
    money(lines.reduce((sum, line) => sum + line.amount, 0)),
  ];
  for (const group of derived.groups) {
    const lines = group.payables.flatMap((payable) => {
      const line = lineById.get(payable.id);
      return line ? [line] : [];
    });
    if (group.payables.some((payable) => payable.source !== "manual")) {
      const id = `g-${group.key}`;
      rows.push({ id, label: group.label, emphasis: true, values: valuesOf(lines) });
      rowTones[id] = "group";
    }
    for (const line of lines) {
      const { payable } = line;
      rows.push({
        id: payable.id,
        label: [
          payable.source === "manual"
            ? payable.supplier
            : documentLabel(payable) || payable.supplier,
          payableDetail(payable, { center: false }),
        ]
          .filter(Boolean)
          .join(" — "),
        sublabel: [
          payable.issuedOn ? `Emisión: ${formatDayMonthYear(payable.issuedOn)}` : "",
          payable.dueOn ? `Vence: ${formatDayMonthYear(payable.dueOn)}` : "",
          payable.payOn ? `Programado: ${formatDayMonthYear(payable.payOn)}` : "",
          `Urgente: ${money(line.urgent)} · Pendiente: ${money(line.pending)}`,
        ]
          .filter(Boolean)
          .join(" · "),
        values: valuesOf([line]),
      });
    }
  }
  rows.push({ id: "total", label: "Total", emphasis: true, values: valuesOf(derived.lines) });
  const paymentSection: PdfFlowSection = {
    id: payments.id,
    title: payments.title,
    rowTones,
    totalColumn: "Total",
    table: { columns: [...columns.map((column) => column.label), "Total"], rows },
  };
  const order: FlowReportSection["id"][] = [
    "accounts",
    "payments",
    "incomes",
    "remaining",
    "matrix",
    "settled",
    "loans",
  ];
  return {
    header: report.header,
    sections: order.flatMap((id): PdfFlowSection[] => {
      const section = report.sections.find((candidate) => candidate.id === id);
      if (!section) return [];
      if (id === "payments") return [paymentSection];
      return [id === "accounts" || id === "matrix" ? transpose(section) : section];
    }),
  };
}

export interface PdfFlowPage {
  section: PdfFlowSection;
  fit: StatementFit;
  panel: number;
  panels: number;
}

/** Repeat the detail and total on each account panel; never squeeze figures past the paper. */
export function pdfFlowPages(sections: readonly PdfFlowSection[]): PdfFlowPage[] {
  return sections.flatMap((section) => {
    const chars = Math.max(
      13,
      ...section.table.rows.flatMap((row) => row.values.map((value) => value?.length ?? 0)),
    );
    const totalIndex = section.totalColumn
      ? section.table.columns.lastIndexOf(section.totalColumn)
      : -1;
    const indices = section.table.columns
      .map((_, index) => index)
      .filter((index) => index !== totalIndex);
    let capacity = section.table.columns.length;
    while (capacity > 1 && !statementFit(capacity, chars, "landscape").fits) capacity--;
    const count = Math.max(1, capacity - (totalIndex >= 0 ? 1 : 0));
    const panels = Math.max(1, Math.ceil(indices.length / count));
    return Array.from({ length: panels }, (_, panel) => {
      const selected = indices.slice(panel * count, (panel + 1) * count);
      if (totalIndex >= 0) selected.push(totalIndex);
      return {
        section: {
          ...section,
          table: {
            columns: selected.map((index) => section.table.columns[index]),
            rows: section.table.rows.map((row) => ({
              ...row,
              values: selected.map((index) => row.values[index] ?? null),
            })),
          },
        },
        fit: statementFit(selected.length, chars, "landscape"),
        panel: panel + 1,
        panels,
      };
    });
  });
}
