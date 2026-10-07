/** Excel's document fields are separate columns; the PDF keeps its compact document label. */
import { documentLabel, hasPaymentSubtotal, payableDetail } from "../derive";
import { buildPdfFlowReport, type PdfFlowSection } from "../pdf-report";

export function buildExcelFlowReport(input: Parameters<typeof buildPdfFlowReport>[0]) {
  const report = buildPdfFlowReport(input);
  const source = report.sections.find((section) => section.id === "payments")!;
  const columns = [
    "Fecha",
    "Factura",
    "Detalle",
    "Saldo",
    "Vence",
    "Cuenta",
    "Programado",
    "Urgente",
    "Pendiente",
  ];
  const lineById = new Map(input.derived.lines.map((line) => [line.payable.id, line]));
  const groupedIds = new Set(
    input.derived.groups
      .filter((group) => hasPaymentSubtotal(group.payables))
      .flatMap((group) => group.payables.map((payable) => payable.id)),
  );
  const payments: PdfFlowSection = {
    ...source,
    table: {
      columns,
      rows: source.table.rows.map((row) => {
        const line = lineById.get(row.id);
        if (!line) {
          // Group and closing sums come from the same report, only their columns move.
          return {
            ...row,
            values: ["", "", "", row.values[4], "", "", "", row.values[5], row.values[6]],
          };
        }
        const { payable } = line;
        return {
          ...row,
          label: groupedIds.has(payable.id) ? "" : payable.supplier,
          values: [
            row.values[0],
            documentLabel(payable),
            payableDetail(payable, { center: false }),
            row.values[4],
            row.values[1],
            row.values[2],
            row.values[3],
            row.values[5],
            row.values[6],
          ],
        };
      }),
    },
    notes: source.notes?.map((note) => ({
      ...note,
      // Priority belongs to the document; the rest follows its named field.
      column:
        note.column === 0
          ? 2
          : columns.indexOf(
              source.table.columns[note.column - 1] === "Emisión"
                ? "Fecha"
                : source.table.columns[note.column - 1],
            ) + 1,
    })),
  };
  return {
    ...report,
    sections: report.sections.map((section) => (section.id === "payments" ? payments : section)),
  };
}
