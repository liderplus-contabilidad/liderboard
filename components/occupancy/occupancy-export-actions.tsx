"use client";

import { FileSpreadsheet } from "lucide-react";
import { useMemo, useState } from "react";
import { ExportActions, type ExportOption } from "@/components/ui/export-actions";
import { centerLogoOf } from "@/lib/logos";
import { useOccupancyData } from "./occupancy-data-provider";
import { OccupancyUploadModal } from "./occupancy-upload-modal";

/**
 * Ocupaciones' `ExportActions` wrapper. «Exportar» offers a single entry —the open sucursal-year as
 * an Excel— and stays a menu all the same, so the control reads like every other module's; the
 * module has no printed report yet, and the day it gets one it is one more entry here.
 */
export function OccupancyExportActions() {
  const { dataset, isConsolidated, activeHotel, activeHotelId } = useOccupancyData();
  const [uploadOpen, setUploadOpen] = useState(false);

  // The consolidado is synthetic: it is not downloaded because it is nobody's file.
  const year = isConsolidated ? undefined : dataset;

  const exports = useMemo<ExportOption[]>(
    () => [
      {
        id: "data",
        title: "Excel con tus datos",
        description: "La sucursal y el año abiertos, con lo que hayas editado",
        icon: FileSpreadsheet,
        iconClassName: "text-brand",
        disabled: !year,
        disabledReason: isConsolidated
          ? "El consolidado es un cálculo de la app; descarga el Excel de una sucursal."
          : "Carga un Excel de ocupación primero.",
        run: async () => {
          if (!year) {
            return;
          }
          const [exportMod, { downloadBlob }] = await Promise.all([
            import("@/lib/occupancy/export"),
            import("@/lib/download"),
          ]);
          const blob = await exportMod.workbookToBlob(
            // The sheet IS a sucursal, so it carries both halves of the letterhead: the hotel on the
            // left and the sucursal on the right.
            exportMod.buildOccupancyWorkbook(
              year,
              activeHotel?.logo,
              centerLogoOf(activeHotel?.centerLogos, year.centerId),
            ),
          );
          downloadBlob(blob, exportMod.occupancyExportFilename(year));
        },
      },
    ],
    [year, isConsolidated, activeHotel?.logo, activeHotel?.centerLogos],
  );

  return (
    <>
      <ExportActions
        // With no hotel there is nowhere to load: the reason renders beside the button, because what
        // is missing is not the file but the previous step.
        upload={{
          onClick: () => setUploadOpen(true),
          disabled: activeHotelId === null,
          disabledReason: "Agrega un hotel primero: cada uno guarda sus propias sucursales.",
        }}
        exports={exports}
        info={{
          title: "Archivos aceptados",
          children: (
            <>
              Un archivo por sucursal y año (.xls / .xlsx); puedes cargar varios a la vez. Cada
              archivo declara su hotel y su sucursal en las líneas bajo el título, y todos deben ser
              del mismo hotel.
            </>
          ),
        }}
      />

      <OccupancyUploadModal open={uploadOpen} onClose={() => setUploadOpen(false)} />
    </>
  );
}
