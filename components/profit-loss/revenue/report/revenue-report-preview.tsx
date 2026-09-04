"use client";

import { useMemo, useState } from "react";
import { ReportLayer, ReportSheet } from "@/components/ui/report-layer";
import { buildRevenueReport } from "@/lib/revenue/report";
import { usePygData } from "../../pyg-data-provider";
import { useRevenueData } from "../revenue-data-provider";
import { RevenueReportHeader } from "./revenue-report-header";
import { RevenueReportSection } from "./revenue-report-section";

/** Any more columns than this and the table takes its own landscape sheet — the same threshold at
 *  which `statementFit` stops fitting a table into the vertical body. */
const WIDE = 6;

/**
 * The report, over the SAME shell as the other three (`ReportLayer`/`ReportSheet`). It introduces
 * nothing new: the `.report-layer` layer `@media print` isolates is tied to the CLASS and not to an
 * id, which is exactly what allows a fourth report without one printing the others behind it.
 *
 * It receives from the provider the SAME input the screen's cards were built with (`cardsInput`)
 * instead of recomposing it, which is what makes it impossible for the paper to state a figure the
 * screen does not.
 *
 * The growth's table carries two columns per base year, so with three bases it reaches six and takes
 * a landscape sheet on its own. That is decided by the NUMBER OF COLUMNS and not by a list written by
 * hand, so the rule keeps holding if a reading changes shape tomorrow.
 */
export function RevenueReportPreview({ onClose }: { onClose: () => void }) {
  const { activeClient } = usePygData();
  const { clientName, periodName, cardsInput } = useRevenueData();
  // Stamped ONCE, on opening the preview, so it does not advance while the reader looks at it.
  const [generatedAt] = useState(() => new Date());

  const logo = activeClient?.logo;

  const report = useMemo(
    () =>
      buildRevenueReport({
        ...cardsInput,
        clientName: clientName ?? "Cliente",
        ...(logo ? { logo } : {}),
        generatedAt,
      }),
    [cardsInput, clientName, logo, generatedAt],
  );

  const portrait = report.sections.filter((section) => section.card.table.columns.length <= WIDE);
  const landscape = report.sections.filter((section) => section.card.table.columns.length > WIDE);

  return (
    <ReportLayer
      fileName={`Reporteria-de-ingresos-${clientName ?? "cliente"}-${periodName}`}
      onClose={onClose}
    >
      <ReportSheet>
        <RevenueReportHeader header={report.header} />
        {portrait.map((section, index) => (
          <RevenueReportSection key={section.id} card={section.card} breakBefore={index > 0} />
        ))}
      </ReportSheet>
      {landscape.length > 0 && (
        <ReportSheet landscape>
          {landscape.map((section, index) => (
            <RevenueReportSection key={section.id} card={section.card} breakBefore={index > 0} />
          ))}
        </ReportSheet>
      )}
    </ReportLayer>
  );
}
