"use client";

import { FileText } from "lucide-react";
import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import { ExportActions, type ExportOption } from "@/components/ui/export-actions";
import { useRevenueData } from "./revenue-data-provider";

const RevenueReportPreview = dynamic(
  () => import("./report/revenue-report-preview").then((mod) => mod.RevenueReportPreview),
  { ssr: false },
);

/**
 * Reportería's «Exportar», in the bar's ACTIONS and not among its marks: asking for a report selects
 * nothing.
 *
 * It offers ONE thing, the «Informe PDF»: what leaves this module is the printed report. The bar has
 * no Excel on purpose — the figures are PyG's raíz 4, and the one file the module owns is the
 * CAPTURE's, mounted inside the «Registrar datos» drawer with this same primitive. It stays a menu
 * with a single entry so the control reads the same here as in every other module.
 *
 * Disabled while there is no year loaded, NAMING the missing step — and here what it needs belongs
 * to another module. The preview loads dynamically: it mounts one chart per section —and prints
 * BOTH shapes of every card— so it cannot weigh on the load of a screen that most of the time is
 * only looked at.
 */
export function RevenueExportActions() {
  const { universe } = useRevenueData();
  const [reportOpen, setReportOpen] = useState(false);
  const ready = universe.years.length > 0;

  const exports = useMemo<ExportOption[]>(
    () => [
      {
        id: "pdf",
        title: "Informe PDF",
        description: "Vista previa para imprimir: cada tarjeta en sus dos formas",
        icon: FileText,
        iconClassName: "text-muted",
        disabled: !ready,
        disabledReason: "Carga en Pérdidas y Ganancias el estado de resultados.",
        run: () => setReportOpen(true),
      },
    ],
    [ready],
  );

  return (
    <>
      <ExportActions exports={exports} />
      {reportOpen && <RevenueReportPreview onClose={() => setReportOpen(false)} />}
    </>
  );
}
