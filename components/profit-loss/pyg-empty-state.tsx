"use client";

import { Building2, FileSpreadsheet } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { CreateClientButton } from "./pyg-client-actions";
import { usePygData } from "./pyg-data-provider";
import { PygExcelActions } from "./pyg-excel-actions";

/**
 * PyG's empty state, in its two forms — because they are two different gaps and only one is filled by
 * a file:
 *
 * - **No clients**: no Excel is missing, the previous step is. The only exit is creating the first
 *   one, and the copy says what is gained by doing it (each client holds ITS OWN), which is what
 *   turns «one more form» into «this is how I keep ten clients».
 * - **A client with no data**: there the file really is missing, and the Excel actions go with it.
 *   The tab row only mounts them in Datos, so Gráficas and Análisis with no dataset were left with no
 *   action at all: they go here, siblings of the `EmptyState` (which wraps its children in a `span`,
 *   and the download menu is a `div`).
 */
export function PygEmptyState() {
  const { activeClientId, isConsolidated } = usePygData();

  // The consolidado with nothing to sum is a THIRD gap: neither a file nor a client is missing, but a
  // second client with data. Offering «Cargar Excel» here would point at the wrong place, which is
  // the particular client that file belongs to.
  if (isConsolidated) {
    return (
      <div className="flex flex-col items-center gap-4 px-7 py-20">
        <EmptyState icon={<Building2 size={22} />} className="py-0">
          <span className="flex flex-col items-center gap-1.5 text-center">
            <span className="text-[15px] font-bold tracking-[-0.2px] text-ink">
              Todavía no hay nada que sumar
            </span>
            <span className="max-w-[420px]">
              El consolidado suma el estado de resultados de todos los clientes. Necesita al menos
              dos con datos cargados: abre uno en el selector y carga su Excel.
            </span>
          </span>
        </EmptyState>
      </div>
    );
  }

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
