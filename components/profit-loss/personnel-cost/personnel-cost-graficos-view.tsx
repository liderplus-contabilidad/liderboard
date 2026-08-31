"use client";

import { ChevronsDownUp, ChevronsUpDown } from "lucide-react";
import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { ChartCard } from "@/components/ui/chart-card";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { StatTile } from "@/components/ui/stat-tile";
import { useCollapsedCards } from "@/components/ui/use-collapsed-cards";
import { formatCurrency, formatPercent } from "@/lib/format";
import type { EvolutionView } from "@/lib/personnel-cost/cards";
import { usePersonnelCostData } from "./personnel-cost-data-provider";

/**
 * The Gráficos tab: the four figures as tiles, and the four readings as cards.
 *
 * The tiles are here and not in Datos because there the table already states every one of them, and a
 * number said twice on one screen makes the reader look for a difference between two figures that have
 * none. Here nothing else states them.
 *
 * Each card's shape is chosen by HOW MANY YEARS are marked and never by a control — see
 * `lib/personnel-cost/cards.ts`.
 */
/** «Ver como» de la evolución: la pila con su línea, o el skyline con un eje por entidad. */
const EVOLUTION_VIEWS: { value: EvolutionView; label: string }[] = [
  { value: "apilada", label: "Apilada" },
  { value: "skyline", label: "Skyline 3D" },
];

export function PersonnelCostGraficosView() {
  const { cards, reading, periodName, evolutionView, setEvolutionView } = usePersonnelCostData();

  const ids = useMemo(
    () => [cards.sections.id, cards.ratio.id, cards.groups.id, cards.concepts.id],
    [cards.sections.id, cards.ratio.id, cards.groups.id, cards.concepts.id],
  );
  const { isCollapsed, toggle, allCollapsed, toggleAll } = useCollapsedCards(ids);

  const planta = reading.sections.find((entry) => entry.section.id === "planta");
  const externos = reading.sections.find((entry) => entry.section.id === "externos");
  const share = (value: number | null | undefined) =>
    value === null || value === undefined ? null : formatPercent(value);

  return (
    <div className="px-7 py-5">
      <div className="mb-4 flex gap-4">
        <StatTile
          label="Costo de personal"
          value={formatCurrency(reading.total, { cents: true })}
          hint={periodName}
        />
        <StatTile
          label="% vs ventas"
          value={share(reading.share)}
          hint={`sobre ${formatCurrency(reading.revenue, { cents: true })} de la raíz 4`}
        />
        <StatTile
          label="Planta"
          value={share(planta?.share)}
          hint={
            planta
              ? `Afiliados + no afiliados · ${formatCurrency(planta.total, { cents: true })}`
              : undefined
          }
        />
        <StatTile
          label="Externos"
          value={share(externos?.share)}
          hint={
            externos
              ? `Honorarios médicos · ${formatCurrency(externos.total, { cents: true })}`
              : undefined
          }
        />
      </div>

      <div className="mb-3 flex justify-end">
        <Button
          size="sm"
          variant="ghost"
          icon={allCollapsed ? <ChevronsUpDown size={14} /> : <ChevronsDownUp size={14} />}
          onClick={toggleAll}
        >
          {allCollapsed ? "Desplegar todos" : "Cerrar todos"}
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {[cards.sections, cards.ratio, cards.groups, cards.concepts].map((card) => (
          <ChartCard
            key={card.id}
            title={card.title}
            subtitle={card.subtitle}
            option={card.option}
            table={card.table}
            note={card.note}
            guide={card.guide}
            height={card.height}
            collapsed={isCollapsed(card.id)}
            onToggleCollapsed={() => toggle(card.id)}
            // «Ver como» belongs to THIS card and to no other, so it lives in its header and not in
            // the filter bar — and where the skyline has nothing to put on its depth axis the card
            // gets no header slot at all, rather than a control drawn disabled.
            {...(card.id === cards.groups.id && cards.skylineAvailable
              ? {
                  headerSlot: (
                    <span className="flex items-center gap-2">
                      <span className="text-[11.5px] font-semibold text-faint">Ver como</span>
                      <SegmentedControl
                        value={evolutionView}
                        options={EVOLUTION_VIEWS}
                        onChange={setEvolutionView}
                        ariaLabel="Ver como"
                      />
                    </span>
                  ),
                }
              : {})}
          />
        ))}
      </div>
    </div>
  );
}
