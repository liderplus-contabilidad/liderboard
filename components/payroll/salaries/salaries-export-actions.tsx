"use client";

import { FileText } from "lucide-react";
import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import { ExportActions, type ExportOption } from "@/components/ui/export-actions";
import type { SalariesFilters } from "@/lib/payroll/salaries/filters";
import type { SalariesSource } from "@/lib/payroll/salaries/grid";
import type { EntityLogo } from "@/lib/workspaces";

const SalariesReportPreview = dynamic(
  () => import("./report/salaries-report-preview").then((mod) => mod.SalariesReportPreview),
  { ssr: false },
);

/**
 * Sueldos por Áreas' «Exportar», in the screen's header — not in the filter bar, which is this
 * module's only SELECTION surface, and asking for a report selects nothing.
 *
 * It offers ONE thing, the «Informe PDF»: the module has no data of its own and no Excel yet, and it
 * stays a menu with a single entry so the control reads the same here as in every other module. It
 * loads the preview dynamically: the report mounts one chart per section and cannot weigh on the
 * load of a screen that most of the time is only looked at.
 */
export function SalariesExportActions({
  clientName,
  logo,
  rightLogo,
  source,
  filters,
  hasPayroll,
}: {
  clientName: string;
  logo?: EntityLogo;
  rightLogo?: EntityLogo;
  source: SalariesSource;
  filters: SalariesFilters;
  hasPayroll: boolean;
}) {
  const [reportOpen, setReportOpen] = useState(false);

  const exports = useMemo<ExportOption[]>(
    () => [
      {
        id: "pdf",
        title: "Informe PDF",
        description:
          "Vista previa para imprimir: la evolución de la nómina con las marcas de la barra",
        icon: FileText,
        iconClassName: "text-muted",
        disabled: !hasPayroll,
        disabledReason: "Registra empleados en al menos un período.",
        run: () => setReportOpen(true),
      },
    ],
    [hasPayroll],
  );

  return (
    <>
      <ExportActions exports={exports} />

      {reportOpen && (
        <SalariesReportPreview
          clientName={clientName}
          {...(logo ? { logo } : {})}
          {...(rightLogo ? { rightLogo } : {})}
          source={source}
          filters={filters}
          onClose={() => setReportOpen(false)}
        />
      )}
    </>
  );
}
