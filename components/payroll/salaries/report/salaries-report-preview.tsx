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
 * El informe de Sueldos por Áreas, sobre el mismo armazón que PyG (`ReportLayer`/`ReportSheet`).
 *
 * Recibe `source`/`filters` ya resueltos por `SalariesView` en vez de leerlos de un provider: las
 * marcas de esta pantalla viven en estado local del componente (no hay nada más en el layout que
 * las lea), así que aquí llegan como argumentos.
 *
 * Una sola hoja para todo el informe — `statementFit` decide UNA orientación para todas las
 * tablas, porque comparten exactamente las mismas columnas (design decision #6).
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
  // Sellada una vez, al abrir la vista previa, para que no avance mientras el lector la mira.
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
