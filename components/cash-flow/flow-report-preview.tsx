"use client";

import { useMemo, useState } from "react";
import { ReportBand, ReportLayer, ReportSheet } from "@/components/ui/report-layer";
import { ReportTable } from "@/components/ui/report-table";
import { buildFlowReport, flowReportSubtitle } from "@/lib/cash-flow/report";
import { statementFit } from "@/lib/report/page-fit";
import { useCashFlowData } from "./cash-flow-data-provider";

/**
 * The printed flow, over the app's report shell: the letterhead, the date, and one table per
 * section of `buildFlowReport` — the same tables the Excel writes. On paper there are no controls:
 * the whole derived flow is printed, whatever the screen was showing.
 */
export function FlowReportPreview({ onClose }: { onClose: () => void }) {
  const { activeClient, derived, flow, accounts, centers } = useCashFlowData();
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
        generatedAt,
      }),
    [activeClient, derived, flow, accounts, centers, generatedAt],
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
            <ReportTable table={section.table} fit={fit} />
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

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-2">
      <dt className="text-muted">{label}</dt>
      <dd className="font-medium text-ink">{value}</dd>
    </div>
  );
}
