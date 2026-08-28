"use client";

import { FileText } from "lucide-react";
import dynamic from "next/dynamic";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useSalesData } from "../sales-data-provider";

const SalesReportPreview = dynamic(
  () => import("./sales-report-preview").then((mod) => mod.SalesReportPreview),
  { ssr: false },
);

/**
 * Ventas por servicio's «Informe PDF», in the view's HEADER — not in the bar, which is the only
 * SELECTION surface, and asking for a report selects nothing.
 *
 * Disabled while the client has no month loaded, NAMING the missing step: a control switched off with
 * no explanation forces you to point at it to find out what it is missing.
 *
 * The preview loads dynamically: it mounts one chart per section and cannot weigh on the load of a
 * screen that most of the time is only looked at.
 */
export function SalesReportButton() {
  const { months, clientId } = useSalesData();
  const [open, setOpen] = useState(false);
  const ready = clientId !== null && months.length > 0;

  return (
    <>
      <Button
        size="toolbar"
        variant="secondary"
        icon={<FileText size={14} />}
        disabled={!ready}
        title={ready ? undefined : "Carga el Excel de ventas de al menos un mes."}
        onClick={() => setOpen(true)}
      >
        Informe PDF
      </Button>

      {open && <SalesReportPreview onClose={() => setOpen(false)} />}
    </>
  );
}
