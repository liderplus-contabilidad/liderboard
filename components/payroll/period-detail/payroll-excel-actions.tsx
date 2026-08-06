"use client";

import { useState } from "react";
import { ExcelActions } from "@/components/ui/excel-actions";
import type { PayrollPeriod } from "@/lib/payroll/types";
import { RolUploadModal } from "../rol-upload-modal";

/**
 * El envoltorio de Rol de Pagos sobre `ExcelActions` — la misma regla que siguen `PygExcelActions`
 * y `OccupancyExcelActions`: el módulo aporta qué abre «Cargar», qué genera «Descargar» y qué dice
 * el `ⓘ`; la forma de los controles es del primitivo y ningún módulo la escribe.
 *
 * Va en el `rightSlot` de la barra de pestañas, y solo sobre «Empleados»: cargar es lo que se hace
 * en esa vista, igual que PyG monta las suyas solo sobre Datos.
 */
export function PayrollExcelActions({
  period,
  periods,
  employeeCount,
}: {
  period: PayrollPeriod;
  periods: readonly PayrollPeriod[];
  employeeCount: number;
}) {
  const [uploading, setUploading] = useState(false);

  return (
    <>
      <ExcelActions
        upload={{ label: "Cargar rol de pagos", onClick: () => setUploading(true) }}
        // Sin opciones de descarga el primitivo no rinde control alguno: el Excel del período
        // todavía no se genera, y un botón apagado más no diría nada que el del encabezado no diga.
        downloads={[]}
        info={{
          title: "¿Qué archivo acepta?",
          children: (
            <>
              El Excel del sistema contable, con su hoja <span className="font-mono">GENERAL</span>.
              El mes NO sale del nombre del archivo: se lee de la celda{" "}
              <span className="font-mono">B2</span> de esa hoja, y tiene que ser el del período
              abierto.
            </>
          ),
        }}
      />

      {uploading && (
        <RolUploadModal
          period={period}
          periods={periods}
          currentCount={employeeCount}
          onClose={() => setUploading(false)}
        />
      )}
    </>
  );
}
