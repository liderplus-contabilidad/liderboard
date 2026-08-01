"use client";

import { BedDouble, Hotel } from "lucide-react";
import type { ReactNode } from "react";
import { EmptyState } from "@/components/ui/empty-state";
import { CreateHotelButton } from "./occupancy-hotel-actions";

/**
 * Los dos huecos de Ocupaciones, que son dos y no uno — y solo el segundo se llena con un archivo:
 *
 * - **Sin hoteles** (`NoHotelsEmptyState`): no falta un Excel, falta el paso anterior. La única
 *   salida es crear el primero, y el texto dice qué se gana al hacerlo (cada hotel guarda LO SUYO),
 *   que es lo que convierte «otro formulario más» en «así llevo los cinco hoteles de la firma».
 * - **Con hotel y sin datos** (`NoOccupancyDataEmptyState`): ahí sí falta el archivo. La copia la
 *   pone cada pestaña, porque desde Datos se carga y desde Gráficos se vuelve a Datos.
 */
export function NoHotelsEmptyState() {
  return (
    <div className="rounded-[13px] border border-border bg-surface">
      <div className="flex flex-col items-center gap-4 py-14">
        <EmptyState icon={<Hotel size={22} />} className="py-0">
          <span className="flex flex-col items-center gap-1.5 text-center">
            <span className="text-[15px] font-bold tracking-[-0.2px] text-ink">
              Todavía no hay hoteles
            </span>
            <span className="max-w-[440px]">
              Cada hotel guarda sus propias sucursales, sus años y lo que escribas a mano. Crea el
              primero y después carga sus Excel de ocupación.
            </span>
          </span>
        </EmptyState>
        <CreateHotelButton />
      </div>
    </div>
  );
}

export function NoOccupancyDataEmptyState({
  children,
  action,
}: {
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-[13px] border border-border bg-surface">
      <EmptyState icon={<BedDouble size={22} />} className="py-14">
        {children}
      </EmptyState>
      {action && <div className="flex justify-center pb-8">{action}</div>}
    </div>
  );
}
