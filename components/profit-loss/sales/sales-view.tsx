"use client";

import {
  ArrowLeft,
  Building2,
  ChevronsDownUp,
  ChevronsUpDown,
  Eye,
  EyeOff,
  FileSpreadsheet,
} from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { ChartCard } from "@/components/ui/chart-card";
import { EmptyState } from "@/components/ui/empty-state";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { StatTile } from "@/components/ui/stat-tile";
import { useCollapsedCards } from "@/components/ui/use-collapsed-cards";
import { cn } from "@/lib/cn";
import { formatCurrency, formatNumber } from "@/lib/format";
import { SOLID_VIEW_OPTIONS } from "@/lib/charts/solid-bars";
import { resolveOpenType } from "@/lib/sales/filters";
import { buildTypeDetailCard, type EvolutionView, type SolidView } from "@/lib/sales/cards";
import { PygEmptyState } from "../pyg-empty-state";
import { SalesDataProvider, useSalesData } from "./sales-data-provider";
import { SalesExportActions } from "./sales-export-actions";
import { SalesToolbar } from "./sales-toolbar";

/** The two shapes of the broken-down evolution, as the header names them — see `EvolutionView`. */
const EVOLUTION_VIEWS: { value: EvolutionView; label: string }[] = [
  { value: "skyline", label: "3D" },
  { value: "stacked", label: "2D" },
];

/**
 * «Ventas por servicio»: what the clinic billed, broken down by service type, by insurer, by month,
 * by article and by salesperson.
 *
 * Everything it shows is DERIVED and nothing is stored: what is persisted are the invoice lines
 * each Excel brought, plus the coverage of each month — and the five readings are recomputed on
 * every render, the same rule by which Rol de Pagos persists not a single total.
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
    coverage,
    reading,
    cards,
    cardsInput,
    filters,
    scopedPeriodName,
    universe,
    hideEmptyMonths,
    toggleEmptyMonths,
    evolutionView,
    setEvolutionView,
    typesView,
    setTypesView,
    insurersView,
    setInsurersView,
  } = useSalesData();
  const [uploadOpen, setUploadOpen] = useState(false);
  /** The type the composition card is opened into, or `null` on level one. A wish, resolved on
   *  read: when the type leaves what is marked, the card is back on level one. */
  const [drilledType, setDrilledType] = useState<string | null>(null);
  // One type marked in the bar opens the card into it too — see `resolveOpenType`.
  const openType = useMemo(() => resolveOpenType(drilledType, filters), [drilledType, filters]);
  const typeDetail = useMemo(
    () => (openType === null ? null : buildTypeDetailCard(cardsInput, openType.id)),
    [cardsInput, openType],
  );

  const cardIds = useMemo(
    () =>
      [
        cards.types.id,
        cards.insurers.id,
        cards.evolution.id,
        cards.articles.id,
        cards.vendors?.id,
      ].filter((id): id is string => id !== undefined),
    [cards.types.id, cards.insurers.id, cards.evolution.id, cards.articles.id, cards.vendors?.id],
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

  const empty = coverage.length === 0;

  // The evolution's header controls, and BOTH are conditional on there being something for them to
  // do: «Ver como» exists only where there is a breakdown to shape AND months to follow —comparing
  // years the series is the year, and a skyline would have nothing to put on its depth axis; with a
  // single month the card opens into one bar per service and there is no shape to choose— and
  // «Ocultar meses en 0»
  // only where there is an empty month to hide. Neither one sits disabled: with nothing to offer the
  // card gets no header slot at all.
  /**
   * «Ver como» for a card whose two shapes are two BODIES of one reading. It is offered exactly when
   * there is something drawn to give a body to: with nothing on the plot the switch would change one
   * empty state for another.
   */
  const bodyControl = (
    value: SolidView,
    onChange: (view: SolidView) => void,
    drawn: boolean,
  ): ReactNode =>
    drawn ? (
      <span className="flex items-center gap-2">
        <span className="text-[11.5px] font-semibold text-faint">Ver como</span>
        <SegmentedControl
          value={value}
          options={SOLID_VIEW_OPTIONS}
          onChange={onChange}
          ariaLabel="Ver como"
        />
      </span>
    ) : null;

  // The composition's header: on level one the hint and the body switch, on level two the way back.
  const typesFlat = typesView === "plano";
  const typesCard = typeDetail ?? cards.types;
  const typesControls = typeDetail ? (
    openType?.pinned ? (
      // Pinned by the bar: the way back is unmarking the type there, not a button here.
      <span className="text-[11.5px] text-faint">
        Tipo marcado en el filtro · quítalo para ver todos los tipos
      </span>
    ) : (
      <Button
        size="sm"
        variant="secondary"
        onClick={() => setDrilledType(null)}
        icon={<ArrowLeft size={14} />}
        className="font-medium"
      >
        Todos los tipos
      </Button>
    )
  ) : cards.types.option !== null ? (
    <div className="flex items-center gap-3">
      {typesFlat && (
        <span className="text-[11.5px] text-faint">Pulsa una barra para ver sus artículos</span>
      )}
      {bodyControl(typesView, setTypesView, true)}
    </div>
  ) : null;

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
          actions={<SalesExportActions open={uploadOpen} onOpenChange={setUploadOpen} />}
        />
      </div>

      <div className="px-7 pt-5">
        {empty ? (
          <div className="rounded-[13px] border border-border bg-surface">
            <EmptyState icon={<FileSpreadsheet size={22} />} className="py-16">
              Este cliente no tiene ninguna venta cargada. Sube el reporte de ventas del sistema con
              «Cargar Excel»: puede traer un mes, dos o la historia entera, y cada línea cae en el
              mes de su fecha.
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
                label="Promedio por línea"
                value={
                  reading.totals.averageLine === null
                    ? null
                    : formatCurrency(reading.totals.averageLine, { cents: true })
                }
                hint="Venta ÷ líneas facturadas"
                mono
              />
              <StatTile
                label="Seguros"
                value={formatNumber(reading.totals.insurerCount)}
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
              {/* One slot, two LEVELS. The collapse is keyed by level one's id, and the press is wired only
                  on the flat body. */}
              <ChartCard
                {...typesCard}
                collapsed={isCollapsed(cards.types.id)}
                onToggleCollapsed={() => toggle(cards.types.id)}
                expandable
                {...(typesControls ? { headerSlot: typesControls } : {})}
                {...(!typeDetail && typesFlat
                  ? {
                      onSelect: (index: number) => setDrilledType(cards.typeOrder[index] ?? null),
                    }
                  : {})}
              />
              <ChartCard
                {...cards.insurers}
                collapsed={isCollapsed(cards.insurers.id)}
                onToggleCollapsed={() => toggle(cards.insurers.id)}
                expandable
                headerSlot={bodyControl(
                  insurersView,
                  setInsurersView,
                  cards.insurers.option !== null,
                )}
              />
              <ChartCard
                {...cards.articles}
                collapsed={isCollapsed(cards.articles.id)}
                onToggleCollapsed={() => toggle(cards.articles.id)}
                expandable
              />
              {cards.vendors && (
                <ChartCard
                  {...cards.vendors}
                  collapsed={isCollapsed(cards.vendors.id)}
                  onToggleCollapsed={() => toggle(cards.vendors!.id)}
                  expandable
                />
              )}
              <ChartCard
                {...cards.evolution}
                collapsed={isCollapsed(cards.evolution.id)}
                onToggleCollapsed={() => toggle(cards.evolution.id)}
                expandable
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
