"use client";

import { FileText } from "lucide-react";
import dynamic from "next/dynamic";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useRevenueData } from "../revenue-data-provider";

const RevenueReportPreview = dynamic(
  () => import("./revenue-report-preview").then((mod) => mod.RevenueReportPreview),
  { ssr: false },
);

/**
 * «Informe», in the bar's ACTIONS and not among its marks: asking for a report selects nothing.
 *
 * Disabled while there is no year loaded, NAMING the missing step — a control switched off with no
 * explanation forces you to point at it to find out what it needs, and here what it needs belongs to
 * another module.
 *
 * The preview loads dynamically: it mounts one chart per section —and the report prints BOTH shapes
 * of every card— so it cannot weigh on the load of a screen that most of the time is only looked at.
 */
export function RevenueReportButton() {
  const { universe } = useRevenueData();
  const [open, setOpen] = useState(false);
  const ready = universe.years.length > 0;

  return (
    <>
      <Button
        size="toolbar"
        variant="secondary"
        icon={<FileText size={14} />}
        disabled={!ready}
        title={ready ? undefined : "Carga en Pérdidas y Ganancias el estado de resultados."}
        onClick={() => setOpen(true)}
      >
        Informe
      </Button>

      {open && <RevenueReportPreview onClose={() => setOpen(false)} />}
    </>
  );
}
