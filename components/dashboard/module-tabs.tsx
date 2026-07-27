"use client";

import dynamic from "next/dynamic";
import { useState, type ReactNode } from "react";
import { ComingSoon } from "@/components/dashboard/coming-soon";
import { OccupancyExcelActions } from "@/components/occupancy/occupancy-excel-actions";
import { OccupancyToolbar } from "@/components/occupancy/occupancy-toolbar";
import { PygExcelActions } from "@/components/profit-loss/pyg-excel-actions";
import { PygToolbar } from "@/components/profit-loss/pyg-toolbar";
import { cn } from "@/lib/cn";
import { findModuleBySlug, type ModuleTabId } from "@/lib/modules";

/**
 * The panels are the ONLY thing here that is code-split, and it is this registry that makes it
 * worth doing: importing them statically put ECharts (~700 KB) in the shared client chunk of
 * EVERY route — including `/salaries` and `/sales`, which render `ComingSoon` and draw nothing.
 * Each panel now arrives when its tab is first opened.
 *
 * `ssr: false` because every panel reads the workspace from IndexedDB: on the server they can
 * only render their own empty state, so prerendering them buys nothing and costs a hydration
 * pass. The shell, the tab bar and the toolbars stay static — they are what the reader sees
 * first, and none of them pull a chart or a parser.
 */
const PanelFallback = () => <div className="px-7 py-5" aria-busy="true" />;

const DatosView = dynamic(
  () => import("@/components/profit-loss/datos-view").then((mod) => mod.DatosView),
  { ssr: false, loading: PanelFallback },
);
const GraficosView = dynamic(
  () => import("@/components/profit-loss/charts/graficos-view").then((mod) => mod.GraficosView),
  { ssr: false, loading: PanelFallback },
);
const AnalisisView = dynamic(
  () => import("@/components/profit-loss/charts/analisis-view").then((mod) => mod.AnalisisView),
  { ssr: false, loading: PanelFallback },
);
const OccupancyDatosView = dynamic(
  () => import("@/components/occupancy/occupancy-datos-view").then((mod) => mod.OccupancyDatosView),
  { ssr: false, loading: PanelFallback },
);
const OccupancyGraficosView = dynamic(
  () => import("@/components/occupancy/charts/graficos-view").then((mod) => mod.GraficosView),
  { ssr: false, loading: PanelFallback },
);

interface ModuleViews {
  rightSlot?: (tab: ModuleTabId) => ReactNode;
  toolbar?: (tab: ModuleTabId) => ReactNode;
  panel?: (tab: ModuleTabId) => ReactNode;
}

const MODULE_VIEWS: Record<string, ModuleViews> = {
  "profit-loss": {
    rightSlot: (tab) => (tab === "datos" ? <PygExcelActions /> : null),
    toolbar: () => <PygToolbar />,
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
    rightSlot: (tab) => (tab === "datos" ? <OccupancyExcelActions /> : null),
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

        {/* La barra alinea el slot una sola vez, a la altura de las etiquetas: así el mismo
            componente sirve fuera de ella (el vacío de PyG) sin arrastrar la compensación. */}
        <div className="pb-[11px]">{views.rightSlot?.(activeTab.id)}</div>
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
