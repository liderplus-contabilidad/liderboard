"use client";

import {
  Building2,
  ChevronsDownUp,
  ChevronsUpDown,
  Eye,
  EyeOff,
  FileSpreadsheet,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { ChartCard } from "@/components/ui/chart-card";
import { EmptyState } from "@/components/ui/empty-state";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { StatTile } from "@/components/ui/stat-tile";
import { useCollapsedCards } from "@/components/ui/use-collapsed-cards";
import { cn } from "@/lib/cn";
import { formatCurrency, formatNumber } from "@/lib/format";
import type { EvolutionView } from "@/lib/sales/cards";
import { PygEmptyState } from "../pyg-empty-state";
import { SalesDataProvider, useSalesData } from "./sales-data-provider";
import { SalesExcelActions } from "./sales-excel-actions";
import { SalesReportButton } from "./report/sales-report-button";
import { SalesToolbar } from "./sales-toolbar";

/** The two shapes of the broken-down evolution, as the header names them — see `EvolutionView`. */
const EVOLUTION_VIEWS: { value: EvolutionView; label: string }[] = [
  { value: "skyline", label: "Skyline 3D" },
  { value: "stacked", label: "Apilado" },
];

/**
 * «Ventas por servicio»: what the clinic billed, broken down by service, by payer and by month.
 *
 * Everything it shows is DERIVED and nothing is stored: the only thing persisted are the invoice
 * lines each Excel brought, and the three readings are recomputed on every render — the same rule by
 * which Rol de Pagos persists not a single total.
 */
export function SalesView() {
  return (
    <SalesDataProvider>
      <SalesContent />
    </SalesDataProvider>
  );
}

function SalesContent() {
  const {
    clientId,
    isConsolidated,
    ready,
    months,
    reading,
    cards,
    scopedPeriodName,
    universe,
    hideEmptyMonths,
    toggleEmptyMonths,
    evolutionView,
    setEvolutionView,
  } = useSalesData();
  const [uploadOpen, setUploadOpen] = useState(false);

  const cardIds = useMemo(
    () => [cards.services.id, cards.payers.id, cards.evolution.id],
    [cards.services.id, cards.payers.id, cards.evolution.id],
  );
  const { isCollapsed, toggle, allCollapsed, toggleAll } = useCollapsedCards(cardIds);

  // Before the first read from Dexie it is not known whether there are months: waiting avoids the
  // empty state flickering over a client that actually already has its year loaded.
  if (!ready) {
    return null;
  }

  // The consolidado is NOT a client but the sum of all of them, and what it sums are estados de
  // resultados. Its gap is not filled by a file —loading here would write into a partition that
  // belongs to nobody—, so it says what to choose instead of offering «Cargar Excel».
  if (isConsolidated) {
    return (
      <div className="px-7 py-20">
        <EmptyState icon={<Building2 size={22} />} className="py-0">
          El consolidado entre clientes suma estados de resultados, no facturación. Elige un cliente
          en el selector de la cabecera para ver sus ventas por servicio.
        </EmptyState>
      </div>
    );
  }

  // With no client the empty state names the missing step, which is PyG's and not this screen's.
  if (clientId === null) {
    return <PygEmptyState />;
  }

  const empty = months.length === 0;

  // The evolution's header controls, and BOTH are conditional on there being something for them to
  // do: «Ver como» exists only where there is a breakdown to shape —comparing years the series is
  // the year, and a skyline would have nothing to put on its depth axis— and «Ocultar meses en 0»
  // only where there is an empty month to hide. Neither one sits disabled: with nothing to offer the
  // card gets no header slot at all.
  const evolutionControls =
    cards.skylineAvailable || cards.emptyMonths > 0 ? (
      <div className="flex items-center gap-3">
        {cards.skylineAvailable && (
          <span className="flex items-center gap-2">
            <span className="text-[11.5px] font-semibold text-faint">Ver como</span>
            <SegmentedControl
              value={evolutionView}
              options={EVOLUTION_VIEWS}
              onChange={setEvolutionView}
              ariaLabel="Ver como"
            />
          </span>
        )}
        {cards.emptyMonths > 0 && (
          <Button
            size="sm"
            variant="secondary"
            aria-pressed={hideEmptyMonths}
            onClick={toggleEmptyMonths}
            icon={hideEmptyMonths ? <Eye size={14} /> : <EyeOff size={14} />}
            className={cn(
              "font-medium",
              hideEmptyMonths && "border-brand/40 bg-brand-soft text-brand hover:bg-brand-soft",
            )}
          >
            {hideEmptyMonths
              ? `Mostrar ${cards.emptyMonths} ${cards.emptyMonths === 1 ? "mes" : "meses"} en 0`
              : "Ocultar meses en 0"}
          </Button>
        )}
      </div>
    ) : null;

  return (
    <div className="pb-5">
      {/* ONE bar with the marks and the actions, EDGE TO EDGE and flush against the header, and it
          STAYS: the three cards are tall, and what is changed while looking at the bottom one is
          precisely what is marked up here. */}
      <div className="sticky top-0 z-20">
        <SalesToolbar
          actions={
            <>
              <SalesExcelActions open={uploadOpen} onOpenChange={setUploadOpen} />
              <SalesReportButton />
            </>
          }
        />
      </div>

      <div className="px-7 pt-5">
        {empty ? (
          <div className="rounded-[13px] border border-border bg-surface">
            <EmptyState icon={<FileSpreadsheet size={22} />} className="py-16">
              Este cliente no tiene ningún mes de ventas cargado. Sube el Excel «Venta de Servicios
              por FACTURA» del mes con «Cargar Excel».
            </EmptyState>
          </div>
        ) : (
          <>
            <div className="mb-4 grid grid-cols-4 gap-4">
              <StatTile
                label="Venta total"
                value={formatCurrency(reading.totals.amount, { cents: true })}
                hint={scopedPeriodName}
                mono
              />
              <StatTile
                label="Líneas facturadas"
                value={formatNumber(reading.totals.lineCount)}
                hint={scopedPeriodName}
                mono
              />
              <StatTile
                label="Ticket promedio"
                value={
                  reading.totals.averageTicket === null
                    ? null
                    : formatCurrency(reading.totals.averageTicket, { cents: true })
                }
                hint="Por línea de factura"
                mono
              />
              <StatTile
                label="Pagadores"
                value={formatNumber(reading.totals.payerCount)}
                hint="Aseguradoras y particulares"
                mono
              />
            </div>

            <div className="mb-4 flex items-center">
              <Button
                size="sm"
                variant="secondary"
                onClick={toggleAll}
                icon={allCollapsed ? <ChevronsUpDown size={14} /> : <ChevronsDownUp size={14} />}
                className="font-medium"
              >
                {allCollapsed ? "Desplegar todos" : "Cerrar todos"}
              </Button>
            </div>

            <div className="flex flex-col gap-4">
              <ChartCard
                {...cards.services}
                collapsed={isCollapsed(cards.services.id)}
                onToggleCollapsed={() => toggle(cards.services.id)}
              />
              <ChartCard
                {...cards.payers}
                collapsed={isCollapsed(cards.payers.id)}
                onToggleCollapsed={() => toggle(cards.payers.id)}
              />
              <ChartCard
                {...cards.evolution}
                collapsed={isCollapsed(cards.evolution.id)}
                onToggleCollapsed={() => toggle(cards.evolution.id)}
                {...(evolutionControls
                  ? {
                      headerSlot: evolutionControls,
                    }
                  : {})}
              />
            </div>

            {universe.months.length === 0 && (
              <p className="mt-3 text-[12px] text-faint">
                Los años marcados no tienen ningún mes cargado. Marca otro en «Año», o sube su
                Excel.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
