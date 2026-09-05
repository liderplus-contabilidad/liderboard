"use client";

import { ChevronsDownUp, ChevronsUpDown, PanelsTopLeft, Wallet } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { ChartCard } from "@/components/ui/chart-card";
import { EmptyState } from "@/components/ui/empty-state";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { StatTile } from "@/components/ui/stat-tile";
import { useCollapsedCards } from "@/components/ui/use-collapsed-cards";
import { MONTHS_FULL_ES } from "@/lib/date";
import { formatCurrency, formatPercent } from "@/lib/format";
import type { AnnualShape, ComparisonShape, GrowthUnit } from "@/lib/revenue/cards";
import { PygEmptyState } from "../pyg-empty-state";
import { RevenueCapturePanel } from "./revenue-capture-panel";
import { RevenueDataProvider, useRevenueData } from "./revenue-data-provider";
import { RevenueEmptyState } from "./revenue-empty-state";
import { RevenueExcelActions } from "./revenue-excel-actions";
import { RevenueReportButton } from "./report/revenue-report-button";
import { RevenueToolbar } from "./revenue-toolbar";

/** «Ver en» — the growth's unit, as the header names it. */
const GROWTH_UNITS: { value: GrowthUnit; label: string }[] = [
  { value: "dolares", label: "Dólares" },
  { value: "porcentaje", label: "Porcentaje" },
];

/** «Ver como» en el comparativo — plano, o el año con su propio eje de fondo. */
const COMPARISON_SHAPES: { value: ComparisonShape; label: string }[] = [
  { value: "plano", label: "Plano" },
  { value: "skyline", label: "Skyline 3D" },
];

/** «Ver como» en «Ventas por año» — el total del tramo, o el promedio mensual. */
const ANNUAL_SHAPES: { value: AnnualShape; label: string }[] = [
  { value: "total", label: "Total" },
  { value: "promedio", label: "Promedio mensual" },
];

/**
 * «Reportería de ingresos»: the six sheets the firm keeps in a workbook, as five cards on ONE page.
 *
 * Everything it shows is DERIVED. The revenue is the raíz 4 of the estado de resultados and is
 * recomputed on every render; the only thing persisted are the three figures no chart of accounts
 * holds — cobros con tarjeta, comisiones and pauta — and not one percentage, total or growth among
 * them.
 */
export function RevenueView() {
  return (
    <RevenueDataProvider>
      <RevenueContent />
    </RevenueDataProvider>
  );
}

function RevenueContent() {
  const {
    clientId,
    isConsolidated,
    ready,
    canCapture,
    universe,
    cards,
    summary,
    growthUnit,
    setGrowthUnit,
    comparisonShape,
    setComparisonShape,
    annualShape,
    setAnnualShape,
  } = useRevenueData();
  const [captureOpen, setCaptureOpen] = useState(false);

  const cardIds = useMemo(
    () => [
      cards.comparison.id,
      cards.annual.id,
      cards.growth.id,
      ...cards.ratios.map((card) => card.id),
    ],
    [cards.comparison.id, cards.annual.id, cards.growth.id, cards.ratios],
  );
  const { isCollapsed, toggle, allCollapsed, toggleAll } = useCollapsedCards(cardIds);

  // Before the first read from Dexie it is not known whether there are captured figures: waiting
  // avoids the empty state flickering over a client that does have its year loaded.
  if (!ready) {
    return null;
  }

  // With no client the empty state names the missing step, which is PyG's and not this screen's. The
  // consolidado does NOT fall here: it sums estados de resultados, which is exactly what this reads.
  if (clientId === null && !isConsolidated) {
    return <PygEmptyState />;
  }

  const empty = universe.years.length === 0;

  return (
    <div className="pb-5">
      {/* ONE bar with the marks and the actions, EDGE TO EDGE and flush against the header, and it
          STAYS: the cards are tall, and what is changed while looking at the bottom one is precisely
          what is marked up here. */}
      <div className="sticky top-0 z-20">
        <RevenueToolbar
          actions={
            <>
              {/* Only where the workspace can hold captured figures. Elsewhere it is NOT DRAWN — a
                  control that means nothing for the open data does not render disabled. */}
              {canCapture && (
                <Button
                  size="toolbar"
                  icon={<PanelsTopLeft size={15} />}
                  onClick={() => setCaptureOpen(true)}
                >
                  Registrar datos
                </Button>
              )}
              <RevenueExcelActions />
              <RevenueReportButton />
            </>
          }
        />
      </div>

      <div className="px-7 pt-5">
        {empty ? (
          <RevenueEmptyState />
        ) : (
          <>
            <div className="mb-4 grid grid-cols-4 gap-4">
              <StatTile
                label={`Venta ${summary.reference?.year ?? ""}`.trim()}
                value={
                  summary.reference?.covered
                    ? formatCurrency(summary.reference.total, { cents: true })
                    : null
                }
                hint={summary.coverage ?? undefined}
                mono
              />
              <StatTile
                label="Promedio mensual"
                value={
                  summary.reference?.average === null || summary.reference === null
                    ? null
                    : formatCurrency(summary.reference.average, { cents: true })
                }
                hint="Sobre los meses cargados"
                mono
              />
              <StatTile
                label="Mejor mes"
                value={
                  summary.reference?.best
                    ? formatCurrency(summary.reference.best.amount, { cents: true })
                    : null
                }
                hint={
                  summary.reference?.best
                    ? `${MONTHS_FULL_ES[summary.reference.best.monthIndex]} ${summary.reference.year}`
                    : undefined
                }
                mono
              />
              <StatTile
                label={
                  summary.previous ? `Crecimiento vs ${summary.previous.baseYear}` : "Crecimiento"
                }
                value={
                  summary.previous?.total.percent === null ||
                  summary.previous === null ||
                  summary.previous === undefined
                    ? null
                    : `${summary.previous.total.percent > 0 ? "+" : ""}${formatPercent(summary.previous.total.percent)}`
                }
                {...(summary.previous?.total.percent != null
                  ? {
                      sign:
                        summary.previous.total.percent < 0
                          ? ("negativo" as const)
                          : ("positivo" as const),
                    }
                  : {})}
                hint={summary.previous ? "Mismo tramo" : "Marca otro año para comparar"}
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
                {...cards.comparison}
                collapsed={isCollapsed(cards.comparison.id)}
                onToggleCollapsed={() => toggle(cards.comparison.id)}
                {...(cards.skylineAvailable
                  ? {
                      // Offered exactly where it has something to put on the depth axis: with one
                      // year there is no second row, so the control is not drawn at all rather than
                      // drawn disabled.
                      headerSlot: (
                        <HeaderChoice
                          label="Ver como"
                          value={comparisonShape}
                          options={COMPARISON_SHAPES}
                          onChange={setComparisonShape}
                        />
                      ),
                    }
                  : {})}
              />

              {/* La lectura ANUAL, entre el mes a mes y la comparación: mensual → anual →
                  comparativo → consolidado. */}
              <ChartCard
                {...cards.annual}
                collapsed={isCollapsed(cards.annual.id)}
                onToggleCollapsed={() => toggle(cards.annual.id)}
                headerSlot={
                  <HeaderChoice
                    label="Ver como"
                    value={annualShape}
                    options={ANNUAL_SHAPES}
                    onChange={setAnnualShape}
                  />
                }
              />

              <ChartCard
                {...cards.growth}
                collapsed={isCollapsed(cards.growth.id)}
                onToggleCollapsed={() => toggle(cards.growth.id)}
                headerSlot={
                  <HeaderChoice
                    label="Ver en"
                    value={growthUnit}
                    options={GROWTH_UNITS}
                    onChange={setGrowthUnit}
                  />
                }
              />

              {/* Ninguna cifra registrada en ningún año marcado: las tres tarjetas no tendrían nada
                  que dibujar, y tres cajas vacías no informan tres veces — dicen lo mismo una vez y
                  dejan al lector sin saber si la pantalla está vacía o rota. Un solo bloque nombra lo
                  que falta y lleva dentro el botón que lo arregla. Cuando SOLO algunos años están sin
                  registrar, las tarjetas se quedan como están: ese caso ya lo resuelve la nota. */}
              {cards.ratiosIdle ? (
                <div className="rounded-[13px] border border-border bg-surface">
                  <EmptyState icon={<Wallet size={22} />} className="py-12">
                    <span className="flex flex-col items-center gap-3 text-center">
                      <span className="max-w-[460px]">
                        Cobros con tarjeta, comisiones TC y publicidad Facebook no están en ningún
                        estado de resultados: se registran a mano. Sin ellos, las tres lecturas de
                        participación no tienen numerador que medir.
                      </span>
                      <Button
                        size="md"
                        icon={<PanelsTopLeft size={15} />}
                        onClick={() => setCaptureOpen(true)}
                      >
                        Registrar datos
                      </Button>
                    </span>
                  </EmptyState>
                </div>
              ) : (
                cards.ratios.map((card) => (
                  /* Sin «Ver como»: el monto y su participación ya se leen en la misma gráfica —
                     la barra del numerador escribe debajo de su cifra qué parte es de la de al
                     lado—, así que no queda una segunda forma entre la que elegir. */
                  <ChartCard
                    key={card.id}
                    {...card}
                    collapsed={isCollapsed(card.id)}
                    onToggleCollapsed={() => toggle(card.id)}
                  />
                ))
              )}
            </div>

            {/* The consolidado draws the two readings that ARE a sum of estados de resultados and
                nothing else: cobros, comisiones and pauta belong to a particular client, and writing
                them here would create a partition that is nobody's. */}
            {isConsolidated && (
              <p className="mt-3 text-[12px] leading-snug text-faint">
                El consolidado entre clientes suma estados de resultados, así que el comparativo y
                el crecimiento se leen igual. Cobros con tarjeta, comisiones y pauta pertenecen a un
                cliente concreto: elige uno en el selector de la cabecera para registrarlos.
              </p>
            )}

            {universe.months.length === 0 && (
              <p className="mt-3 text-[12px] text-faint">
                Los años marcados no tienen ningún mes cargado. Marca otro en «Año».
              </p>
            )}
          </>
        )}
      </div>

      {captureOpen && canCapture && <RevenueCapturePanel onClose={() => setCaptureOpen(false)} />}
    </div>
  );
}

/**
 * A control read by ONE card, in that card's header. In the filter bar it would read as feeding every
 * card and would leave a chip for something that narrows nothing — the rule that separates
 * Ocupaciones' «Ver por» from PyG's marks.
 */
function HeaderChoice<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <span className="flex items-center gap-2">
      <span className="text-[11.5px] font-semibold text-faint">{label}</span>
      <SegmentedControl value={value} options={options} onChange={onChange} ariaLabel={label} />
    </span>
  );
}
