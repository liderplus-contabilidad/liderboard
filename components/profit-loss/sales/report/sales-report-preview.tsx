"use client";

import { useMemo, useState } from "react";
import { ReportLayer, ReportSheet } from "@/components/ui/report-layer";
import { deriveSalesIdentity } from "@/lib/sales/identity";
import { buildSalesReport } from "@/lib/sales/report";
import { usePygData } from "../../pyg-data-provider";
import { useSalesData } from "../sales-data-provider";
import { SalesReportHeader } from "./sales-report-header";
import { SalesReportSection } from "./sales-report-section";

/** Any more columns than this and the table takes its own landscape sheet. It is the same threshold
 *  at which `statementFit` stops fitting a table into the vertical body. */
const WIDE = 6;

/**
 * The sales report, over the SAME shell as the other two (`ReportLayer`/`ReportSheet`). It
 * introduces nothing new: the `.report-layer` layer `@media print` isolates is tied to the CLASS and
 * not to an id, and that is exactly what allows a third report without one printing the others
 * behind it.
 *
 * It receives from the provider the SAME input the screen's cards were built with (`cardsInput`)
 * instead of recomposing it: that is what makes it impossible for the paper to say a figure the
 * screen does not say.
 *
 * Two sheets and not one: the first two sections are THREE-column tables and fit comfortably in
 * portrait, whereas the evolution is TWELVE months, which in portrait squeeze until they stop being
 * readable. The wide one takes **its own landscape sheet**, which is the figure PyG already uses and
 * for the same reason: a landscape sheet inside the vertical body would have to overflow it with a
 * negative margin, and on screen that reads as a table escaping the paper.
 */
export function SalesReportPreview({ onClose }: { onClose: () => void }) {
  const { activeClient } = usePygData();
  const { clientName, months, periodName, cardsInput } = useSalesData();
  // Stamped ONCE, on opening the preview, so it does not advance while the reader looks at it.
  const [generatedAt] = useState(() => new Date());

  // Only the CLIENT's logo, on the left. The right-hand one is the cost center's, and there is none
  // here: sales are not broken down by center —the report does not declare one—, so the band is left
  // with a single logo instead of inventing a second one that would mean nothing.
  const logo = activeClient?.logo;
  const identity = useMemo(() => deriveSalesIdentity(months), [months]);

  const report = useMemo(
    () =>
      buildSalesReport({
        ...cardsInput,
        clientName: clientName ?? "Cliente",
        ...(identity ? { companyName: identity.companyName } : {}),
        ...(logo ? { logo } : {}),
        generatedAt,
      }),
    [cardsInput, clientName, identity, logo, generatedAt],
  );

  // Which section goes on which sheet is decided by the NUMBER OF COLUMNS of its own table, not by a
  // list written by hand: the evolution grows to twelve and the other two stay at three, so the rule
  // holds on its own if one of them changes shape tomorrow.
  const portrait = report.sections.filter((section) => section.card.table.columns.length <= WIDE);
  const landscape = report.sections.filter((section) => section.card.table.columns.length > WIDE);

  return (
    <ReportLayer fileName={`Ventas-${clientName ?? "cliente"}-${periodName}`} onClose={onClose}>
      <ReportSheet>
        <SalesReportHeader header={report.header} />
        {portrait.map((section, index) => (
          <SalesReportSection key={section.id} card={section.card} breakBefore={index > 0} />
        ))}
      </ReportSheet>
      {landscape.length > 0 && (
        <ReportSheet landscape>
          {landscape.map((section) => (
            <SalesReportSection key={section.id} card={section.card} />
          ))}
        </ReportSheet>
      )}
    </ReportLayer>
  );
}
