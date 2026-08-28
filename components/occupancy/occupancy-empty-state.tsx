"use client";

import { BedDouble, Hotel } from "lucide-react";
import type { ReactNode } from "react";
import { EmptyState } from "@/components/ui/empty-state";
import { CreateHotelButton } from "./occupancy-hotel-actions";

/**
 * Ocupaciones' two empty states, which are two and not one — and only the second is filled by a
 * file:
 *
 * - **No hotels** (`NoHotelsEmptyState`): no Excel is missing, the previous step is. The only exit
 *   is creating the first one, and the copy says what is gained by doing it (each hotel holds ITS
 *   OWN), which is what turns «one more form» into «this is how I keep the firm's five hotels».
 * - **A hotel with no data** (`NoOccupancyDataEmptyState`): there the file really is missing. The
 *   copy is supplied by each tab, because Datos is where you load and Gráficos sends you to Datos.
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
