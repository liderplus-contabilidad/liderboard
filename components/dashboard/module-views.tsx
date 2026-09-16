"use client";

import dynamic from "next/dynamic";
import type { ReactNode } from "react";
import { CashFlowExportActions } from "@/components/cash-flow/cash-flow-export-actions";
import { CashFlowToolbar } from "@/components/cash-flow/cash-flow-toolbar";
import { OccupancyExportActions } from "@/components/occupancy/occupancy-export-actions";
import { OccupancyToolbar } from "@/components/occupancy/occupancy-toolbar";
import { PygChartYearNotice } from "@/components/profit-loss/pyg-chart-year-notice";
import { PygDriftNotice } from "@/components/profit-loss/pyg-drift-notice";
import { PygExportActions } from "@/components/profit-loss/pyg-export-actions";
import { PygToolbar } from "@/components/profit-loss/pyg-toolbar";
import type { ModuleTabId } from "@/lib/modules";

/**
 * What each tabbed module mounts, by tab. Two readers: the HEADER takes `rightSlot` —the export
 * control sits in the same row as the tabs— and `ModuleTabs` takes the rest, below it. It is one
 * registry and not two so that a tab's export and its panel cannot disagree on which tab they
 * belong to.
 *
 * The panels are the ONLY thing here that is code-split, and it is this registry that makes it
 * worth doing: importing them statically put ECharts (~700 KB) in the shared client chunk of
 * EVERY route — including `/sales`, which renders `ComingSoon` and draws nothing.
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
const CashFlowSummaryView = dynamic(
  () => import("@/components/cash-flow/summary-view").then((mod) => mod.SummaryView),
  { ssr: false, loading: PanelFallback },
);
const PayablesView = dynamic(
  () => import("@/components/cash-flow/payables-view").then((mod) => mod.PayablesView),
  { ssr: false, loading: PanelFallback },
);
const ChecksView = dynamic(
  () => import("@/components/cash-flow/checks-view").then((mod) => mod.ChecksView),
  { ssr: false, loading: PanelFallback },
);
const FlowView = dynamic(
  () => import("@/components/cash-flow/flow-view").then((mod) => mod.FlowView),
  { ssr: false, loading: PanelFallback },
);
const CashEntriesView = dynamic(
  () => import("@/components/cash-flow/cash-entries-view").then((mod) => mod.CashEntriesView),
  { ssr: false, loading: PanelFallback },
);

export interface ModuleViews {
  /** The export control of the tab, mounted in the header's row next to the tabs. */
  rightSlot?: (tab: ModuleTabId) => ReactNode;
  toolbar?: (tab: ModuleTabId) => ReactNode;
  notice?: (tab: ModuleTabId) => ReactNode;
  panel?: (tab: ModuleTabId) => ReactNode;
}

export const MODULE_VIEWS: Record<string, ModuleViews> = {
  "profit-loss": {
    // «Exportar» is the same on the THREE tabs — the Excels export the workspace and the report covers
    // every tab —; «Cargar Excel» and the ⓘ mount only over Datos, which is where loading happens.
    rightSlot: (tab) => <PygExportActions upload={tab === "datos"} />,
    toolbar: () => <PygToolbar />,
    // Datos warns about a drift in the Utilidad; the two chart tabs, which read ONE year, say which
    // one when several are on screen. Both render nothing in the common case.
    notice: (tab) => (tab === "datos" ? <PygDriftNotice /> : <PygChartYearNotice />),
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
    rightSlot: (tab) => (tab === "datos" ? <OccupancyExportActions /> : null),
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
  "cash-flow": {
    // «Cargar Excel» only where something is loaded (a cartera, the check register); «Exportar»
    // wherever the tab has an output. Resumen has neither: it is a reading.
    rightSlot: (tab) => (tab === "resumen" ? null : <CashFlowExportActions tab={tab} />),
    // ONE bar for the five tabs: the cut date and the center are common, and each tab adds its own
    // marks (see `CashFlowToolbar`).
    toolbar: (tab) => <CashFlowToolbar tab={tab} />,
    panel: (tab) => {
      switch (tab) {
        case "resumen":
          return <CashFlowSummaryView />;
        case "cxp":
          return <PayablesView />;
        case "cheques":
          return <ChecksView />;
        case "flujo":
          return <FlowView />;
        case "cargas":
          return <CashEntriesView />;
        default:
          return null;
      }
    },
  },
};
