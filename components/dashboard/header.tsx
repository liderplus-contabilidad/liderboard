"use client";

import { ChevronRight } from "lucide-react";
import { usePathname } from "next/navigation";
import { ActiveClient, type ActiveClientInfo } from "@/components/dashboard/active-client";
import { useOccupancyData } from "@/components/occupancy/occupancy-data-provider";
import { PygClientActions } from "@/components/profit-loss/pyg-client-actions";
import { DEFAULT_MODULE, findModuleBySlug } from "@/lib/modules";
import { DEFAULT_CENTER_ID } from "@/lib/occupancy/types";

export function DashboardHeader() {
  const pathname = usePathname();
  const occupancy = useOccupancyData();
  const slug = pathname.split("/").filter(Boolean)[0];
  const current = findModuleBySlug(slug) ?? DEFAULT_MODULE;
  const isPyg = current.slug === "profit-loss";
  const isOccupancy = current.slug === "occupancy";

  // `principal` is left out: it is labelled with the hotel's own name, so naming it here would
  // say the same thing twice.
  const centerLabel = occupancy.isConsolidated
    ? `Consolidado (${occupancy.centers.length} ${occupancy.centers.length === 1 ? "sucursal" : "sucursales"})`
    : occupancy.activeCenterId === DEFAULT_CENTER_ID
      ? undefined
      : occupancy.activeCenterName;
  const hotel: ActiveClientInfo | undefined = occupancy.hotelName
    ? {
        name: occupancy.hotelName,
        period: [occupancy.activeYear, centerLabel].filter(Boolean).join(" · ") || undefined,
      }
    : undefined;

  return (
    <header className="flex items-center gap-5 border-b border-border bg-surface px-7 py-4">
      <div className="min-w-0">
        <div className="mb-0.5 flex items-center gap-2 text-[11.5px] font-medium text-faint">
          <span>Módulos</span>
          <ChevronRight size={13} className="shrink-0" />
          <span className="truncate text-muted">{current.title}</span>
        </div>
        <h1 className="truncate text-xl font-bold tracking-tight text-brand">{current.title}</h1>
      </div>

      {/* PyG passes its client list, so the block becomes a selector. Ocupaciones does NOT: it
          has its own database and its own hotel, and until it grows the same shape the block
          stays exactly the read-only summary it has always been. */}
      {isPyg && (
        <div className="ml-auto min-w-0">
          <PygClientActions />
        </div>
      )}
      {isOccupancy && (
        <ActiveClient
          client={hotel}
          caption="Ocupación diaria"
          emptyLabel="Sin hotel seleccionado"
        />
      )}
    </header>
  );
}
