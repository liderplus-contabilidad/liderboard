"use client";

import { useMemo, useState } from "react";
import { ExcelActions, type ExcelDownloadOption } from "@/components/ui/excel-actions";
import { useOccupancyData } from "./occupancy-data-provider";
import { OccupancyUploadModal } from "./occupancy-upload-modal";

/**
 * Las acciones de Excel de Ocupaciones. Una sola descarga —la sucursal-año abierta—, así que
 * `ExcelActions` rinde un botón plano; el día que exista una segunda opción, pasa a menú sola.
 */
export function OccupancyExcelActions() {
  const { dataset, isConsolidated, activeHotelId } = useOccupancyData();
  const [uploadOpen, setUploadOpen] = useState(false);

  // El consolidado es sintético: no se descarga porque no es un archivo de nadie.
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
          const blob = await exportMod.workbookToBlob(exportMod.buildOccupancyWorkbook(year));
          downloadBlob(blob, exportMod.occupancyExportFilename(year));
        },
      },
    ],
    [year, isConsolidated],
  );

  return (
    <>
      <ExcelActions
        // Sin hotel no hay dónde cargar: el motivo se rinde junto al botón, porque lo que falta no
        // es el archivo sino el paso anterior.
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
