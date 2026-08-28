"use client";

import { useMemo, useState } from "react";
import { ExcelActions, type ExcelDownloadOption } from "@/components/ui/excel-actions";
import { centerLogoOf } from "@/lib/logos";
import { useOccupancyData } from "./occupancy-data-provider";
import { OccupancyUploadModal } from "./occupancy-upload-modal";

/**
 * Ocupaciones' Excel actions. A single download —the open sucursal-year—, so `ExcelActions` renders
 * a plain button; the day a second option exists, it turns into a menu on its own.
 */
export function OccupancyExcelActions() {
  const { dataset, isConsolidated, activeHotel, activeHotelId } = useOccupancyData();
  const [uploadOpen, setUploadOpen] = useState(false);

  // The consolidado is synthetic: it is not downloaded because it is nobody's file.
  const year = isConsolidated ? undefined : dataset;

  const downloads = useMemo<ExcelDownloadOption[]>(
    () => [
      {
        id: "data",
        title: "Excel con tus datos",
        description: "La sucursal y el año abiertos, con lo que hayas editado",
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
      <ExcelActions
        // With no hotel there is nowhere to load: the reason renders beside the button, because what
        // is missing is not the file but the previous step.
        upload={{
          onClick: () => setUploadOpen(true),
          disabled: activeHotelId === null,
          disabledReason: "Agrega un hotel primero: cada uno guarda sus propias sucursales.",
        }}
        downloads={downloads}
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
