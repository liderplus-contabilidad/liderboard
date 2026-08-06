"use client";

import dynamic from "next/dynamic";
import { useState, type ReactNode } from "react";
import { ComingSoon } from "@/components/dashboard/coming-soon";
import { OccupancyExcelActions } from "@/components/occupancy/occupancy-excel-actions";
import { OccupancyToolbar } from "@/components/occupancy/occupancy-toolbar";
import { PygDriftNotice } from "@/components/profit-loss/pyg-drift-notice";
import { PygExcelActions } from "@/components/profit-loss/pyg-excel-actions";
import { PygReportButton } from "@/components/profit-loss/report/pyg-report-button";
import { PygToolbar } from "@/components/profit-loss/pyg-toolbar";
import { TabBar } from "@/components/ui/tab-bar";
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
  notice?: (tab: ModuleTabId) => ReactNode;
  panel?: (tab: ModuleTabId) => ReactNode;
}

const MODULE_VIEWS: Record<string, ModuleViews> = {
  "profit-loss": {
    // El informe cubre las TRES pestañas, así que su botón está en las tres; las acciones de
    // Excel siguen viviendo solo en Datos, que es donde se carga y se descarga.
    rightSlot: (tab) => (
      <div className="flex items-center gap-2.5">
        {tab === "datos" && <PygExcelActions />}
        <PygReportButton />
      </div>
    ),
    toolbar: () => <PygToolbar />,
    notice: (tab) => (tab === "datos" ? <PygDriftNotice /> : null),
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
      <TabBar
        items={mod.tabs}
        value={activeTab.id}
        onChange={setActiveId}
        ariaLabel={`Vistas de ${mod.label}`}
        idPrefix={mod.slug}
        rightSlot={views.rightSlot?.(activeTab.id)}
        className="shrink-0 px-7 pt-[18px]"
      />

      {views.toolbar?.(activeTab.id)}
      {views.notice?.(activeTab.id)}

      <div
        id={`${mod.slug}-panel`}
        role="tabpanel"
        aria-labelledby={`${mod.slug}-tab-${activeTab.id}`}
        className="flex-1 overflow-auto bg-canvas"
      >
        {panel}
      </div>
    </div>
  );
}
