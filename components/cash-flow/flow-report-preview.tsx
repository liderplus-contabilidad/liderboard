"use client";

import { useMemo, useState } from "react";
import { ReportBand, ReportLayer, ReportSheet } from "@/components/ui/report-layer";
import {
  type ReportCellStyle,
  type ReportRowStyle,
  ReportTable,
} from "@/components/ui/report-table";
import type { ChartTableRow } from "@/lib/charts/types";
import {
  cellPaint,
  hasFigure,
  type FlowCellPaint,
  type FlowRowTone,
  flowReportSubtitle,
} from "@/lib/cash-flow/report";
import { buildPdfFlowReport, pdfFlowPages, type PdfFlowSection } from "@/lib/cash-flow/pdf-report";
import { useCashFlowData } from "./cash-flow-data-provider";

/**
 * The printed flow, over the app's report shell: the letterhead, the date, and one table per
 * section of `buildPdfFlowReport`, with accounts across the top. The Excel keeps its original
 * layout; both read the same derived figures. On paper the whole flow is printed.
 */
export function FlowReportPreview({ onClose }: { onClose: () => void }) {
  const { activeClient, derived, flow, accounts, centers, checks } = useCashFlowData();
  // Stamped once, on opening the preview, so it does not advance while the reader looks at it.
  const [generatedAt] = useState(() => new Date());

  const report = useMemo(
    () =>
      buildPdfFlowReport({
        clientName: activeClient?.name ?? "",
        ...(activeClient?.logo ? { logo: activeClient.logo } : {}),
        derived,
        incomes: flow?.incomes ?? [],
        accounts,
        centers,
        hasChecks: checks.length > 0,
        generatedAt,
      }),
    [activeClient, derived, flow, accounts, centers, checks.length, generatedAt],
  );

  const pages = useMemo(() => pdfFlowPages(report.sections), [report.sections]);

  return (
    <ReportLayer
      fileName={`Flujo-${report.header.clientName}-${report.header.dateLabel}`}
      onClose={onClose}
    >
      {pages.map(({ section, fit, panel, panels }, index) => (
        <div key={`${section.id}-${panel}`} className={index > 0 ? "print-page-break" : undefined}>
          <ReportSheet landscape>
            <header className="print-section flex flex-col gap-5 border-b border-border pb-6">
              <ReportBand
                {...(report.header.logo ? { leftLogo: report.header.logo } : {})}
                logoHeight={56}
                className="text-center"
              >
                <p className="text-[11.5px] font-semibold uppercase tracking-[0.5px] text-faint">
                  Flujo de pagos
                </p>
                <h1 className="mt-2 text-[24px] font-semibold leading-tight text-ink">
                  {report.header.clientName}
                </h1>
              </ReportBand>
              <dl className="flex flex-wrap justify-center gap-x-8 gap-y-2 text-[12.5px]">
                <Field label="Fecha de corte" value={report.header.dateLabel} />
                <Field label="Alcance" value={flowReportSubtitle(report.header)} />
                <Field label="Generado el" value={report.header.generatedAt} />
              </dl>
            </header>
            <section className="print-section flex flex-col gap-3">
              <h2 className="text-[14px] font-semibold text-ink">
                {section.title}
                {panels > 1 ? ` · ${panel}/${panels}` : ""}
              </h2>
              <ReportTable
                table={section.table}
                fit={fit}
                wrapLabels
                regularAmounts
                rowStyle={(row) => rowStyleOf(section, row)}
                cellStyle={(row, column, value) => cellStyleOf(section, row, column, value)}
              />
            </section>
            {index === pages.length - 1 && (
              <footer className="mt-4 grid grid-cols-3 gap-8 pt-10 text-center text-[11.5px] text-muted">
                {["Primera revisión", "Revisión final", "Gerencia"].map((role) => (
                  <div key={role} className="border-t border-border pt-2">
                    {role}
                  </div>
                ))}
              </footer>
            )}
          </ReportSheet>
        </div>
      ))}
    </ReportLayer>
  );
}

/** The PDF keeps the row bands and signed ink, with regular figures and no sign glyphs. */
const ROW_STYLE: Record<FlowRowTone, ReportRowStyle> = {
  total: { className: "bg-brand", ink: "font-bold text-white" },
  group: { className: "bg-brand-soft", ink: "font-bold text-brand" },
};

function rowStyleOf(section: PdfFlowSection, row: ChartTableRow): ReportRowStyle | undefined {
  const figureTone = section.figureRowTones?.[row.id];
  if (figureTone === "urgent") {
    return { className: "bg-urgent", ink: "font-bold text-ink" };
  }
  if (figureTone === "pending") {
    return { className: "bg-surface-calc-strong", ink: "font-semibold text-ink-soft" };
  }
  const tone = section.rowTones?.[row.id];
  return tone ? ROW_STYLE[tone] : undefined;
}

const CELL_STYLE: Record<FlowCellPaint, ReportCellStyle> = {
  urgent: { ink: "bg-urgent font-bold text-ink" },
  pending: { ink: "bg-surface-calc-strong font-bold text-ink" },
  outstanding: { ink: "text-ink-soft" },
  negative: { ink: "text-negative" },
  positive: { ink: "text-positive" },
};

function cellStyleOf(
  section: PdfFlowSection,
  row: ChartTableRow,
  column: string,
  value: string | null,
): ReportCellStyle | undefined {
  const rowTone = section.figureRowTones?.[row.id];
  // Total bands keep white figures on the brand ground, including signed balances.
  if (section.rowTones?.[row.id] === "total") return undefined;
  const paint = rowTone
    ? cellPaint(
        { ...section, rowTones: undefined, columnTones: { [column]: rowTone } },
        row.id,
        column,
        value,
      )
    : cellPaint(section, row.id, column, value);
  if (!paint) {
    return undefined;
  }
  // A mark of payment grounds its whole column. The urgent is ALWAYS bold, its zeros too;
  // the pending is bold only where it says something.
  if (paint === "pending" && !hasFigure(value)) {
    return { ink: "bg-surface-calc-strong font-semibold text-ink-soft" };
  }
  return CELL_STYLE[paint];
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-2">
      <dt className="text-muted">{label}</dt>
      <dd className="font-medium text-ink">{value}</dd>
    </div>
  );
}
