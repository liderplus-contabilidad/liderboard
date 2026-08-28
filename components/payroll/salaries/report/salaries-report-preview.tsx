"use client";

import { useMemo, useState } from "react";
import { ReportLayer, ReportSheet } from "@/components/ui/report-layer";
import { DEFAULT_PAYROLL_PARAMETERS } from "@/lib/payroll/engine/parameters";
import type { SalariesFilters } from "@/lib/payroll/salaries/filters";
import type { SalariesSource } from "@/lib/payroll/salaries/grid";
import { buildSalariesReport } from "@/lib/payroll/salaries/report";
import { statementFit } from "@/lib/report/page-fit";
import type { EntityLogo } from "@/lib/workspaces";
import { SalariesReportHeader } from "./salaries-report-header";
import { SalariesReportSection } from "./salaries-report-section";

/**
 * The Sueldos por Áreas report, over the same shell as PyG's (`ReportLayer`/`ReportSheet`).
 *
 * It receives `source`/`filters` already resolved by `SalariesView` instead of reading them from a
 * provider: this screen's marks live in the component's local state (nothing else in the layout reads
 * them), so here they arrive as arguments.
 *
 * One single sheet for the whole report — `statementFit` decides ONE orientation for every table,
 * because they share exactly the same columns (design decision #6).
 */
export function SalariesReportPreview({
  clientName,
  logo,
  rightLogo,
  source,
  filters,
  onClose,
}: {
  clientName: string;
  logo?: EntityLogo;
  rightLogo?: EntityLogo;
  source: SalariesSource;
  filters: SalariesFilters;
  onClose: () => void;
}) {
  // Stamped once, on opening the preview, so it does not advance while the reader looks at it.
  const [generatedAt] = useState(() => new Date());

  const report = useMemo(
    () =>
      buildSalariesReport({
        clientName,
        ...(logo ? { logo } : {}),
        ...(rightLogo ? { rightLogo } : {}),
        source,
        filters,
        parameters: DEFAULT_PAYROLL_PARAMETERS,
        generatedAt,
      }),
    [clientName, logo, rightLogo, source, filters, generatedAt],
  );

  const columnCount = Math.max(
    0,
    ...report.sections.map((section) => section.card.table.columns.length),
  );
  const fit = statementFit(columnCount);

  return (
    <ReportLayer fileName={`Sueldos-${clientName}-${report.header.rangeLabel}`} onClose={onClose}>
      <ReportSheet landscape={fit.orientation === "landscape"}>
        <SalariesReportHeader header={report.header} />
        {report.sections.map((section, index) => (
          <SalariesReportSection
            key={section.id}
            card={section.card}
            fit={fit}
            breakBefore={index > 0}
          />
        ))}
      </ReportSheet>
    </ReportLayer>
  );
}
