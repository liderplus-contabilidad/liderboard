/** Account-column presentation shared by the PDF and the flow workbook. */
import { statementFit, type StatementFit } from "@/lib/report/page-fit";
import {
  buildFlowReport,
  type FlowCellTone,
  type FlowReportSection,
  type FlowRowTone,
} from "./report";

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
    notes: section.notes?.flatMap((note) => {
      const accountIndex = section.table.rows.findIndex((row) => row.id === note.rowId);
      if (accountIndex < 0 || note.column === 0) return [];
      return [{ rowId: String(note.column - 1), column: accountIndex + 1, text: note.text }];
    }),
    rowTones: Object.fromEntries(
      section.table.columns.flatMap<[string, FlowRowTone]>((column, index) =>
        column.startsWith("Total")
          ? [[String(index), "total" as const]]
          : column === "Saldo final"
            ? [[String(index), "total" as const]]
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
