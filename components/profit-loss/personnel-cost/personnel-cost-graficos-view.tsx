"use client";

import { ChevronsDownUp, ChevronsUpDown } from "lucide-react";
import { Fragment, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { ChartCard } from "@/components/ui/chart-card";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { StatTile } from "@/components/ui/stat-tile";
import { useCollapsedCards } from "@/components/ui/use-collapsed-cards";
import { formatCurrency, formatPercent } from "@/lib/format";
import { SCREEN_SOLID_VIEW, type SolidView } from "@/lib/charts/solid-bars";
import type { EvolutionView, PersonnelCardsInput, SharesCrumb } from "@/lib/personnel-cost/cards";
import { usePersonnelCostData } from "./personnel-cost-data-provider";

/**
 * The Gráficos tab: the four figures as tiles, and the three readings as cards.
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

/**
 * «Ver como» en las dos planas — el dibujo llano, o el mismo de pie en el escenario. Es UNA lista
 * para las dos porque son la misma pregunta dos veces, la misma que hacen Ventas e Ingresos.
 */
const SOLID_VIEWS: { value: SolidView; label: string }[] = [
  { value: "plano", label: "Plano" },
  { value: "solido", label: "Sólido 3D" },
];

/** Cuál de las dos tarjetas planas es cada una, para el control de su cabecera. */
type SolidCard = keyof NonNullable<PersonnelCardsInput["solidViews"]>;

/**
 * The two shaped cards in reading order, and which control each one's header carries: one offers the
 * stage's frieze, and the evolution offers its own skyline instead — a different shape answering a
 * different half of the question, which is why it is not the same control.
 */
const SHAPED: { card: "sections" | "groups"; solid: SolidCard | null }[] = [
  // The evolution right under «Planta vs Externos»: the two are the same stack read at two
  // resolutions —two sections, then the groups inside them— so they are read one after the other.
  { card: "sections", solid: "sections" },
  { card: "groups", solid: null },
];

/**
 * Los niveles de «% vs ventas por nivel» como pestañas: el abierto resaltado y los de arriba pulsables,
 * con el mismo control que «Ver como», para que un nivel se vea igual de bien que una forma. Van en
 * la cabecera de ESA tarjeta y no en la barra de filtros porque solo ella los lee — la regla de la
 * casa para todo control que da forma a una sola tarjeta. Solo hay pestaña para lo ya recorrido: el
 * nivel de abajo se abre con un clic en su barra, y una pestaña por adelantado tendría que elegir
 * cuál de ellas.
 */
function SharesLevels({
  crumbs,
  onGo,
}: {
  crumbs: SharesCrumb[];
  onGo: (crumb: SharesCrumb) => void;
}) {
  const current = String(crumbs.length - 1);
  return (
    <span className="flex items-center gap-2">
      <span className="text-[11.5px] font-semibold text-faint">Nivel</span>
      <SegmentedControl
        value={current}
        options={crumbs.map((crumb, index) => ({ value: String(index), label: crumb.label }))}
        onChange={(value) => onGo(crumbs[Number(value)])}
        ariaLabel="Nivel"
      />
    </span>
  );
}

/** «Ver como» y su control, que es el mismo en las tres cabeceras. */
function HeaderChoice<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <span className="flex items-center gap-2">
      <span className="text-[11.5px] font-semibold text-faint">Ver como</span>
      <SegmentedControl value={value} options={options} onChange={onChange} ariaLabel="Ver como" />
    </span>
  );
}

export function PersonnelCostGraficosView() {
  const {
    cards,
    reading,
    periodName,
    evolutionView,
    setEvolutionView,
    solidViews,
    setSolidView,
    setSharesPath,
  } = usePersonnelCostData();

  const ids = useMemo(
    () => [cards.sections.id, cards.groups.id, cards.shares.id],
    [cards.sections.id, cards.groups.id, cards.shares.id],
  );
  // Un clic en una barra abre lo que hay dentro; en una hoja no hay nada que abrir y no hace nada.
  const openSharesLevel = useCallback(
    (dataIndex: number) => {
      const next = cards.sharesEntries[dataIndex]?.next;
      if (next) {
        setSharesPath(next);
      }
    },
    [cards.sharesEntries, setSharesPath],
  );
  const { isCollapsed, toggle, allCollapsed, toggleAll } = useCollapsedCards(ids);

  const planta = reading.sections.find((entry) => entry.section.id === "planta");
  const externos = reading.sections.find((entry) => entry.section.id === "externos");
  const share = (value: number | null | undefined) =>
    value === null || value === undefined ? null : formatPercent(value);

  // La última: es la lectura que el libro deja en sus tres columnas de porcentaje, y se lee después
  // de saber cuánto costó y cómo evoluciona. Dos controles en su cabecera, y los dos son suyos: las
  // pestañas del nivel y el mismo «Ver como» de «Planta vs Externos».
  const sharesCard = (
    <ChartCard
      key={cards.shares.id}
      title={cards.shares.title}
      subtitle={cards.shares.subtitle}
      option={cards.shares.option}
      table={cards.shares.table}
      note={cards.shares.note}
      guide={cards.shares.guide}
      height={cards.shares.height}
      collapsed={isCollapsed(cards.shares.id)}
      onToggleCollapsed={() => toggle(cards.shares.id)}
      onSelect={openSharesLevel}
      expandable
      {...(cards.shares.option === null
        ? {}
        : {
            headerSlot: (
              <span className="flex items-center gap-4">
                <SharesLevels
                  crumbs={cards.sharesCrumbs}
                  onGo={(crumb) => setSharesPath(crumb.path)}
                />
                <HeaderChoice
                  value={solidViews?.shares ?? SCREEN_SOLID_VIEW}
                  options={SOLID_VIEWS}
                  onChange={(view) => setSolidView("shares", view)}
                />
              </span>
            ),
          })}
    />
  );

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

      <div className="flex flex-col gap-4">
        {SHAPED.map(({ card: which, solid }) => {
          const card = cards[which];
          return (
            <Fragment key={card.id}>
              <ChartCard
                title={card.title}
                subtitle={card.subtitle}
                option={card.option}
                table={card.table}
                note={card.note}
                guide={card.guide}
                height={card.height}
                collapsed={isCollapsed(card.id)}
                onToggleCollapsed={() => toggle(card.id)}
                // Las tres ofrecen «Ampliar»: apiladas a ancho completo la evolución mes a mes y el
                // ranking de conceptos se leen como tendencia pero no de cerca. La forma se sigue
                // eligiendo aquí; la ventana es para mirar.
                expandable
                // «Ver como» belongs to THIS card and to no other, so it lives in its header and not in
                // the filter bar. And a control that means nothing for the open data RENDERS NOTHING
                // rather than sitting disabled: with no plot there is no second shape of it either, and
                // the evolution's skyline needs something to put on its depth axis.
                {...(card.option === null
                  ? {}
                  : solid === null
                    ? cards.skylineAvailable
                      ? {
                          headerSlot: (
                            <HeaderChoice
                              value={evolutionView}
                              options={EVOLUTION_VIEWS}
                              onChange={setEvolutionView}
                            />
                          ),
                        }
                      : {}
                    : {
                        headerSlot: (
                          <HeaderChoice
                            value={solidViews?.[solid] ?? SCREEN_SOLID_VIEW}
                            options={SOLID_VIEWS}
                            onChange={(view) => setSolidView(solid, view)}
                          />
                        ),
                      })}
              />
            </Fragment>
          );
        })}
        {sharesCard}
      </div>
    </div>
  );
}
