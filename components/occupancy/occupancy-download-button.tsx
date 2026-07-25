"use client";

import { FileSpreadsheet, Loader2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useOccupancyData } from "./occupancy-data-provider";

/**
 * Downloads the active sucursal-year in the layout the parser reads, so it re-uploads into the
 * same sucursal. Behind a dynamic import so exceljs stays out of the initial bundle.
 *
 * The Consolidado has nothing to hand over: exporting a calculation would invite re-uploading
 * it as a sucursal named «Consolidado».
 */
export function OccupancyDownloadButton() {
  const { dataset, isConsolidated } = useOccupancyData();
  const year = isConsolidated ? undefined : dataset;
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const download = async () => {
    if (!year || busy) {
      return;
    }
    setBusy(true);
    setFailed(false);
    try {
      const [exportMod, { downloadBlob }] = await Promise.all([
        import("@/lib/occupancy/export"),
        import("@/lib/download"),
      ]);
      const blob = await exportMod.workbookToBlob(exportMod.buildOccupancyWorkbook(year));
      downloadBlob(blob, exportMod.occupancyExportFilename(year));
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="pb-[11px]">
      <Button
        variant="secondary"
        disabled={!year || busy}
        icon={busy ? <Loader2 size={15} className="animate-spin" /> : <FileSpreadsheet size={15} />}
        onClick={() => void download()}
        title={
          isConsolidated
            ? "El consolidado es un cálculo de la app; descarga el Excel de una sucursal."
            : failed
              ? "No se pudo generar el Excel. Intenta de nuevo."
              : undefined
        }
      >
        {busy ? "Generando…" : "Descargar Excel"}
      </Button>
    </div>
  );
}
