"use client";

import { ChevronRight } from "lucide-react";
import { usePathname } from "next/navigation";
import { ActiveClient, type ActiveClientInfo } from "@/components/dashboard/active-client";
import { useOccupancyData } from "@/components/occupancy/occupancy-data-provider";
import { usePygData } from "@/components/profit-loss/pyg-data-provider";
import { DEFAULT_MODULE, findModuleBySlug } from "@/lib/modules";
import { DEFAULT_CENTER_ID } from "@/lib/occupancy/types";

export function DashboardHeader() {
  const pathname = usePathname();
  const { dataset, mode, views, activeCenterId } = usePygData();
  const occupancy = useOccupancyData();
  const slug = pathname.split("/").filter(Boolean)[0];
  const current = findModuleBySlug(slug) ?? DEFAULT_MODULE;
  const isPyg = current.slug === "profit-loss";
  const isOccupancy = current.slug === "occupancy";

  // In multi-center mode the subline names the active view (Consolidado / center / Sin-centro);
  // a single statement falls back to its own cost-center line, if any.
  const activeView = mode === "multi" ? views.find((v) => v.id === activeCenterId) : undefined;
  const centerCount = views.filter((v) => v.role === "center").length;
  const activeName = activeView
    ? activeView.role === "consolidado"
      ? `Consolidado (${centerCount} ${centerCount === 1 ? "centro" : "centros"})`
      : activeView.name
    : dataset?.costCenterName;
  const client: ActiveClientInfo | undefined = dataset
    ? {
        name: dataset.companyName,
        period: activeName ? `${dataset.periodLabel} · ${activeName}` : dataset.periodLabel,
      }
    : undefined;

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

      {isPyg && <ActiveClient client={client} />}
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
