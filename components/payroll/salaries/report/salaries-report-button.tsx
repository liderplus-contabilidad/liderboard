"use client";

import { FileText } from "lucide-react";
import dynamic from "next/dynamic";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { SalariesFilters } from "@/lib/payroll/salaries/filters";
import type { SalariesSource } from "@/lib/payroll/salaries/grid";
import type { EntityLogo } from "@/lib/workspaces";

const SalariesReportPreview = dynamic(
  () => import("./salaries-report-preview").then((mod) => mod.SalariesReportPreview),
  { ssr: false },
);

/**
 * Sueldos por Áreas' «Informe PDF», in the screen's header — not in the filter bar, which is this
 * module's only SELECTION surface, and asking for a report selects nothing.
 *
 * It loads the preview dynamically: the report mounts one chart per section and cannot weigh on the
 * load of a screen that most of the time is only looked at.
 */
export function SalariesReportButton({
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
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        size="toolbar"
        variant="secondary"
        icon={<FileText size={14} />}
        disabled={!hasPayroll}
        title={hasPayroll ? undefined : "Registra empleados en al menos un período."}
        onClick={() => setOpen(true)}
      >
        Informe PDF
      </Button>

      {open && (
        <SalariesReportPreview
          clientName={clientName}
          {...(logo ? { logo } : {})}
          {...(rightLogo ? { rightLogo } : {})}
          source={source}
          filters={filters}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
