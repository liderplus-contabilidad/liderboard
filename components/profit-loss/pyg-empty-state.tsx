"use client";

import { Building2, FileSpreadsheet } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { CreateClientButton } from "./pyg-client-actions";
import { usePygData } from "./pyg-data-provider";
import { PygExcelActions } from "./pyg-excel-actions";

/**
 * El vacío de PyG, en sus dos formas — porque son dos huecos distintos y solo uno se llena con un
 * archivo:
 *
 * - **Sin clientes**: no falta un Excel, falta el paso anterior. La única salida es crear el
 *   primero, y el texto dice qué se gana al hacerlo (cada cliente guarda LO SUYO), que es lo que
 *   convierte «otro formulario más» en «así es como llevo diez clientes».
 * - **Con cliente y sin datos**: ahí sí falta el archivo, y van las acciones de Excel. La fila de
 *   tabs solo las monta en Datos, así que Gráficas y Análisis sin dataset se quedaban sin ninguna
 *   acción: van aquí, hermanas del `EmptyState` (que envuelve sus children en un `span`, y el menú
 *   de descarga es un `div`).
 */
export function PygEmptyState() {
  const { activeClientId } = usePygData();

  if (activeClientId === null) {
    return (
      <div className="flex flex-col items-center gap-4 px-7 py-20">
        <EmptyState icon={<Building2 size={22} />} className="py-0">
          <span className="flex flex-col items-center gap-1.5 text-center">
            <span className="text-[15px] font-bold tracking-[-0.2px] text-ink">
              Todavía no hay clientes
            </span>
            <span className="max-w-[420px]">
              Cada cliente guarda su propio estado de resultados, sus ajustes y sus comentarios.
              Crea el primero y después carga su Excel.
            </span>
          </span>
        </EmptyState>
        <CreateClientButton />
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-4 px-7 py-20">
      <EmptyState icon={<FileSpreadsheet size={22} />} className="py-0">
        <span className="flex flex-col items-center gap-1 text-center">
          <span>
            Carga un mes por centros de costo, un estado único o el Excel completo de la app.
          </span>
          <span className="text-[12px] text-faint">
            El archivo mensual por centros no trae fecha: el mes sale del nombre, con el patrón{" "}
            <span className="font-mono">PyG-AAAA-MM-…</span> (ej.{" "}
            <span className="font-mono">PyG-2026-01-…</span>).
          </span>
        </span>
      </EmptyState>
      <PygExcelActions />
    </div>
  );
}
