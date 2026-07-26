"use client";

import { useState, type ReactNode } from "react";
import { ComingSoon } from "@/components/dashboard/coming-soon";
import { GraficosView as OccupancyGraficosView } from "@/components/occupancy/charts/graficos-view";
import { OccupancyDatosView } from "@/components/occupancy/occupancy-datos-view";
import { OccupancyToolbar } from "@/components/occupancy/occupancy-toolbar";
import { OccupancyDownloadButton } from "@/components/occupancy/occupancy-download-button";
import { OccupancyUploadButton } from "@/components/occupancy/occupancy-upload-button";
import { AnalisisView } from "@/components/profit-loss/charts/analisis-view";
import { GraficosView } from "@/components/profit-loss/charts/graficos-view";
import { DatosToolbar } from "@/components/profit-loss/datos-toolbar";
import { DatosView } from "@/components/profit-loss/datos-view";
import { PygToolbar } from "@/components/profit-loss/pyg-toolbar";
import { Semaforo } from "@/components/profit-loss/semaforo";
import { cn } from "@/lib/cn";
import { findModuleBySlug, type ModuleTabId } from "@/lib/modules";

interface ModuleViews {
  rightSlot?: (tab: ModuleTabId) => ReactNode;
  toolbar?: (tab: ModuleTabId) => ReactNode;
  panel?: (tab: ModuleTabId) => ReactNode;
}

const MODULE_VIEWS: Record<string, ModuleViews> = {
  "profit-loss": {
    rightSlot: () => <Semaforo />,
    toolbar: (tab) => (
      <>
        <PygToolbar />
        {tab === "datos" && <DatosToolbar />}
      </>
    ),
    panel: (tab) => {
      switch (tab) {
        case "datos":
          return <DatosView />;
        case "graficos":
          return <GraficosView />;
        case "analisis":
          return <AnalisisView />;
      }
    },
  },
  occupancy: {
    rightSlot: (tab) =>
      tab === "datos" ? (
        <div className="flex items-center gap-2.5">
          <OccupancyDownloadButton />
          <OccupancyUploadButton />
        </div>
      ) : null,
    toolbar: (tab) => (tab === "graficos" ? <OccupancyToolbar /> : null),
    panel: (tab) => {
      switch (tab) {
        case "datos":
          return <OccupancyDatosView />;
        case "graficos":
          return <OccupancyGraficosView />;
        default:
          return null;
      }
    },
  },
};

export function ModuleTabs({ slug }: { slug: string }) {
  const mod = findModuleBySlug(slug);
  const [activeId, setActiveId] = useState<ModuleTabId>(mod?.tabs[0]?.id ?? "graficos");

  if (!mod) {
    return null;
  }

  const activeTab = mod.tabs.find((tab) => tab.id === activeId) ?? mod.tabs[0];
  const views = MODULE_VIEWS[mod.slug] ?? {};
  const panel = views.panel?.(activeTab.id) ?? <ComingSoon mod={mod} tab={activeTab} />;

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-end justify-between gap-6 border-b border-border bg-surface px-7 pt-[18px]">
        <div role="tablist" aria-label={`Vistas de ${mod.label}`} className="flex items-end gap-6">
          {mod.tabs.map((tab) => {
            const Icon = tab.icon;
            const active = tab.id === activeTab.id;

            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                id={`tab-${mod.slug}-${tab.id}`}
                aria-selected={active}
                aria-controls={`panel-${mod.slug}`}
                onClick={() => setActiveId(tab.id)}
                className={cn(
                  "relative flex items-center gap-2 py-2.5 text-sm font-semibold transition-colors",
                  active ? "text-brand" : "text-faint hover:text-muted",
                )}
              >
                <Icon size={16} strokeWidth={1.9} />
                {tab.label}
                {active && (
                  <span className="absolute inset-x-0 -bottom-px h-[2.5px] rounded-[3px] bg-brand" />
                )}
              </button>
            );
          })}
        </div>

        {views.rightSlot?.(activeTab.id)}
      </div>

      {views.toolbar?.(activeTab.id)}

      <div
        id={`panel-${mod.slug}`}
        role="tabpanel"
        aria-labelledby={`tab-${mod.slug}-${activeTab.id}`}
        className="flex-1 overflow-auto bg-canvas"
      >
        {panel}
      </div>
    </div>
  );
}
