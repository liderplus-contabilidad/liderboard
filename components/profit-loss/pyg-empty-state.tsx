"use client";

import { FileSpreadsheet } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { PygExcelActions } from "./pyg-excel-actions";

/**
 * El vacío de Gráficas y Análisis. Esas dos pestañas no montan `DatosToolbar`, así que sin
 * dataset se quedaban sin ninguna acción: las acciones de Excel van aquí, hermanas del
 * `EmptyState` (que envuelve sus children en un `span`, y el menú de descarga es un `div`).
 */
export function PygEmptyState() {
  return (
    <div className="flex flex-col items-center gap-4 px-7 py-20">
      <EmptyState icon={<FileSpreadsheet size={22} />} className="py-0">
        Carga un Excel para ver el estado de resultados.
      </EmptyState>
      <PygExcelActions />
    </div>
  );
}
