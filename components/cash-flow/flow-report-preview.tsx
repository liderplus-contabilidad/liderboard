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
  buildFlowReport,
  cellPaint,
  hasFigure,
  type FlowCellPaint,
  type FlowReportSection,
  type FlowRowTone,
  flowReportSubtitle,
  SIGN_GLYPH,
} from "@/lib/cash-flow/report";
import { statementFit } from "@/lib/report/page-fit";
import { useCashFlowData } from "./cash-flow-data-provider";

/**
 * The printed flow, over the app's report shell: the letterhead, the date, and one table per
 * section of `buildFlowReport` — the same tables the Excel writes. On paper there are no controls:
 * the whole derived flow is printed, whatever the screen was showing.
 */
export function FlowReportPreview({ onClose }: { onClose: () => void }) {
  const { activeClient, derived, flow, accounts, centers, checks } = useCashFlowData();
  // Stamped once, on opening the preview, so it does not advance while the reader looks at it.
  const [generatedAt] = useState(() => new Date());

  const report = useMemo(
    () =>
      buildFlowReport({
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

  const widest = Math.max(1, ...report.sections.map((section) => section.table.columns.length));
  const fit = statementFit(widest);

  return (
    <ReportLayer
      fileName={`Flujo-${report.header.clientName}-${report.header.dateLabel}`}
      onClose={onClose}
    >
      <ReportSheet landscape={fit.orientation === "landscape"}>
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
        {report.sections.map((section) => (
          <section key={section.id} className="print-section flex flex-col gap-3">
            <h2 className="text-[14px] font-semibold text-ink">{section.title}</h2>
            <ReportTable
              table={section.table}
              fit={fit}
              rowStyle={(row) => rowStyleOf(section, row)}
              cellStyle={(row, column, value) => cellStyleOf(section, row, column, value)}
            />
          </section>
        ))}
        <footer className="mt-4 grid grid-cols-3 gap-8 pt-10 text-center text-[11.5px] text-muted">
          {["Primera revisión", "Revisión final", "Gerencia"].map((role) => (
            <div key={role} className="border-t border-border pt-2">
              {role}
            </div>
          ))}
        </footer>
      </ReportSheet>
    </ReportLayer>
  );
}

/**
 * The screen's colours on paper, by what each row and column MEANS (`report.ts` says it): the total
 * on the brand ground as the screen closes its tables, each supplier's heading in the brand tint,
 * the two marks of payment on a GROUND of their own — the urgent amber, the pending a quiet
 * blue-grey — with their figures in plain ink, so the paper tells them apart at a glance; the checks in their ink, and a saldo by
 * its sign, always with its ▲/▼, never the colour alone.
 */
const ROW_STYLE: Record<FlowRowTone, ReportRowStyle> = {
  total: { className: "bg-brand", ink: "font-bold text-white" },
  group: { className: "bg-brand-soft", ink: "font-bold text-brand" },
};

function rowStyleOf(section: FlowReportSection, row: ChartTableRow): ReportRowStyle | undefined {
  const tone = section.rowTones?.[row.id];
  return tone ? ROW_STYLE[tone] : undefined;
}

const CELL_STYLE: Record<FlowCellPaint, ReportCellStyle> = {
  urgent: { ink: "bg-marked font-bold text-ink" },
  pending: { ink: "bg-surface-calc-strong font-bold text-ink" },
  outstanding: { ink: "font-semibold text-crosslink" },
  negative: { ink: "font-bold text-negative", glyph: SIGN_GLYPH.negative },
  positive: { ink: "font-bold text-positive", glyph: SIGN_GLYPH.positive },
};

function cellStyleOf(
  section: FlowReportSection,
  row: ChartTableRow,
  column: string,
  value: string | null,
): ReportCellStyle | undefined {
  const paint = cellPaint(section, row.id, column, value);
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
