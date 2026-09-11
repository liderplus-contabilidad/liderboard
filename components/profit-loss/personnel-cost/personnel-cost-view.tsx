"use client";

import { BarChart3, Table2 } from "lucide-react";
import dynamic from "next/dynamic";
import { useState } from "react";
import { TabBar, type TabBarItem } from "@/components/ui/tab-bar";
import { PygEmptyState } from "../pyg-empty-state";
import { PersonnelCostDataProvider, usePersonnelCostData } from "./personnel-cost-data-provider";
import {
  PersonnelCostConsolidated,
  PersonnelCostForeignSystem,
  PersonnelCostNoData,
} from "./personnel-cost-empty-state";
import { PersonnelCostExcelActions } from "./personnel-cost-excel-actions";
import { PersonnelCostToolbar } from "./personnel-cost-toolbar";

/**
 * The capture, on its own for ONE case: a client with nothing loaded draws no tabs, so the card that
 * lives in Datos would be unreachable exactly where it is most needed — a workspace whose history is
 * the only thing there is to write.
 */
const Capture = dynamic(
  () => import("./personnel-cost-capture").then((mod) => mod.PersonnelCostCapture),
  { ssr: false },
);
const YearTabs = dynamic(
  () => import("./personnel-cost-year-tabs").then((mod) => mod.PersonnelCostYearTabs),
  { ssr: false },
);

type PersonnelTabId = "graficos" | "datos";

/** The same two tabs PyG opens with, in the same order and with the same icons. */
const TABS: readonly TabBarItem<PersonnelTabId>[] = [
  { id: "graficos", label: "Gráficos", icon: BarChart3 },
  { id: "datos", label: "Datos", icon: Table2 },
];

/**
 * The panels are code-split for the reason `ModuleTabs` already writes down: importing them statically
 * would put ECharts (~700 KB) into this route's client chunk even for a reader who only ever opens
 * Datos. `ssr: false` because both read the workspace from IndexedDB — on the server they can only
 * render their own empty state, so prerendering buys nothing and costs a hydration pass.
 */
const PanelFallback = () => <div className="px-7 py-5" aria-busy="true" />;

const GraficosPanel = dynamic(
  () => import("./personnel-cost-graficos-view").then((mod) => mod.PersonnelCostGraficosView),
  { ssr: false, loading: PanelFallback },
);
const DatosPanel = dynamic(
  () => import("./personnel-cost-datos-view").then((mod) => mod.PersonnelCostDatosView),
  { ssr: false, loading: PanelFallback },
);

/**
 * «Análisis costo personal»: a subitem of Pérdidas y Ganancias with two tabs of its own.
 *
 * The tabs are the view's and not the registry's, and that is deliberate: `DashboardSubmodule` carries
 * no `tabs` because a subitem is a whole page, and widening it would push a second tab strip into the
 * shell for every subitem that will never have one. `TabBar` exists precisely for this — Rol de Pagos'
 * período detail already mounts it outside the module registry.
 */
export function PersonnelCostView() {
  return (
    <PersonnelCostDataProvider>
      <PersonnelCostContent />
    </PersonnelCostDataProvider>
  );
}

function PersonnelCostContent() {
  const { ready, clientId, isConsolidated, canRead, sourceSystemId, universe } =
    usePersonnelCostData();
  const [tab, setTab] = useState<PersonnelTabId>("graficos");

  // Before the first read from Dexie it is not known whether anything is captured: waiting avoids the
  // empty state flickering over a client that does have its year loaded.
  if (!ready) {
    return null;
  }

  // The four gaps, in the order they can occur. None of them draws the tabs or the bar: there is
  // nothing to switch between and nothing to filter, and a disabled control is a trap, not an
  // affordance.
  const gap = (() => {
    if (isConsolidated) {
      return <PersonnelCostConsolidated />;
    }
    if (clientId === null) {
      return <PygEmptyState />;
    }
    if (!canRead) {
      return <PersonnelCostForeignSystem systemId={sourceSystemId} />;
    }
    if (universe.years.length === 0) {
      return <PersonnelCostNoData />;
    }
    return null;
  })();

  if (gap) {
    // `PygEmptyState` brings its own padding — it is the shell's own empty state; the three of this
    // module are cards and take the page's.
    if (clientId === null && !isConsolidated) {
      return gap;
    }
    // Only the «sin datos» gap keeps the capture: with no client, another system or the consolidado
    // there is no partition to write into, and it would have nowhere to put a figure.
    const writable = canRead && universe.years.length === 0;
    if (!writable) {
      return <div className="px-7 py-5">{gap}</div>;
    }
    // With no exercise at all the strip is still the way IN: it carries no tab yet and its «Agregar
    // año» is the only thing on the page that can create one — and so is the Excel, which is how a
    // backup comes back before the first estado de resultados does.
    return (
      <div className="flex h-full flex-col">
        <YearTabs />
        <div className="flex flex-1 flex-col gap-4 overflow-auto bg-canvas px-7 py-5">
          {gap}
          <div className="flex justify-end">
            <PersonnelCostExcelActions />
          </div>
          <Capture />
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <TabBar
        items={TABS}
        value={tab}
        onChange={setTab}
        ariaLabel="Vistas de Análisis costo personal"
        idPrefix="personnel-cost"
        className="shrink-0 px-7 pt-[18px]"
      />

      {/* Los EJERCICIOS del cliente, y SÓLO sobre Datos: abrir un año dice qué tabla se ve, y en
          Gráficos no hay ninguna que cambie. Allí la tira es el único selector de año —el chip «Año»
          de la barra se esconde— y en Gráficos es al revés: el chip marca cuáles se comparan. */}
      {tab === "datos" && <YearTabs />}

      <PersonnelCostToolbar tab={tab} actions={<PersonnelCostExcelActions />} />

      <div
        id="personnel-cost-panel"
        role="tabpanel"
        aria-labelledby={`personnel-cost-tab-${tab}`}
        className="flex-1 overflow-auto bg-canvas"
      >
        {tab === "graficos" ? <GraficosPanel /> : <DatosPanel />}
      </div>
    </div>
  );
}
