"use client";

import { FileText } from "lucide-react";
import dynamic from "next/dynamic";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { usePygData } from "../pyg-data-provider";

/**
 * «Informe PDF» — the one control the report needs.
 *
 * It is NOT part of `ExcelActions`: that block documents itself as «las acciones de Excel de
 * CUALQUIER módulo», and putting a PDF inside it contradicts its own contract. Nor is there a
 * `ReportActions` twin of it — what earns that primitive on the Excel side is the busy state,
 * the error panel and the reentrancy guard of GENERATING a file, and none of that exists here:
 * this button opens a layer. If Ocupaciones ever wants the same thing, the shared part gets
 * extracted then.
 *
 * The name says what it does. It is not «Descargar» because it does not download: it opens a
 * preview, and the print dialog is a step the preview announces rather than a surprise.
 */
const PygReportPreview = dynamic(
  () => import("./pyg-report-preview").then((mod) => mod.PygReportPreview),
  { ssr: false },
);

export function PygReportButton() {
  const { dataset } = usePygData();
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        size="toolbar"
        variant="secondary"
        icon={<FileText size={14} />}
        disabled={!dataset}
        // Same sentence the Excel downloads use: the missing step is the same one.
        title={dataset ? undefined : "Carga un Excel primero."}
        onClick={() => setOpen(true)}
      >
        Informe PDF
      </Button>

      {open && <PygReportPreview onClose={() => setOpen(false)} />}
    </>
  );
}
