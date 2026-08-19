"use client";

import { useMemo } from "react";
import { ChevronsDownUp, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SpecCard } from "@/components/ui/chart-card";
import { useCollapsedCards } from "@/components/ui/use-collapsed-cards";
import { buildAnalisisCards } from "@/lib/profit-loss/charts/cards";
import { activeSource, expandSlots } from "@/lib/profit-loss/charts/selection";
import { buildVerticalAnalysis } from "@/lib/profit-loss/charts/vertical";
import { usePygAnalytics } from "../pyg-analytics-provider";
import { usePygData } from "../pyg-data-provider";
import { PygEmptyState } from "../pyg-empty-state";
import { VerticalAnalysisCard } from "./vertical-analysis-card";

/**
 * Análisis answers *how it changes*, and it answers it without asking the reader to configure
 * anything: the vertical analysis table plus three cards — the main expenses against revenue,
 * how each account moved against the previous period, and where the spend concentrates — each
 * intersecting its fixed question with whatever the "Cuenta contable" filter marks. There is no
 * transformation picker: naming an engine transform (índice base 100, media móvil, % sobre la
 * cuenta padre) asked the reader to know the engine, and an accountant reads these questions.
 *
 * The three cards come from `buildAnalisisCards`. The vertical table stays here because it is
 * not one of them: it owns controls of its own (base account, folding), and its calculation
 * already lives in `buildVerticalAnalysis`.
 */
export function AnalisisView() {
  const { dataset, filters, accountOptions, collapsed, toggleCollapsed, views } = usePygData();
  const { context, verticalBaseCode, setVerticalBaseCode } = usePygAnalytics();

  const { cards } = useMemo(() => buildAnalisisCards(context, filters), [context, filters]);

  // A marked period is a year-less slot; the engine reads dated references. Análisis still
  // reads ONE year (`context.year`), so the expansion has a single year to stamp.
  const periodRefs = useMemo(
    () => expandSlots(filters.periods, [context.year]),
    [filters.periods, context.year],
  );

  // The vertical analysis reads the SOURCE rather than a query: it draws the whole account tree
  // and a query would cap it at the palette's eight slots. Everything that bounds it — the
  // frequency, the marked periods and accounts, the fold state — comes from the filter bar.
  const source = activeSource(context);
  const vertical = useMemo(
    () =>
      buildVerticalAnalysis(source, {
        baseCode: verticalBaseCode,
        frequency: context.frequency,
        periods: periodRefs,
        markedCodes: filters.codes,
        collapsed,
      }),
    [source, verticalBaseCode, context.frequency, periodRefs, filters.codes, collapsed],
  );
  const centerName =
    views.find((view) => view.id === context.activeCenterId)?.name ?? "Consolidado";

  // Igual que en Gráficos: qué tarjetas están plegadas es estado local de la pantalla. El análisis
  // vertical no entra — es una tabla con sus propios chevrons de árbol, y un segundo chevron en su
  // cabecera dejaría sin decir cuál pliega qué.
  const cardIds = useMemo(() => cards.map((card) => card.id), [cards]);
  const { isCollapsed, toggle, allCollapsed, toggleAll } = useCollapsedCards(cardIds);

  if (!dataset) {
    return <PygEmptyState />;
  }

  return (
    <div className="flex flex-col gap-4 px-7 py-5">
      <VerticalAnalysisCard
        table={vertical}
        accounts={accountOptions}
        baseCode={verticalBaseCode}
        centerName={centerName}
        year={context.year}
        filteredEmpty={filters.codes.length > 0 && vertical.rows.length === 0}
        onChangeBase={setVerticalBaseCode}
        onToggleCollapse={toggleCollapsed}
      />

      {/* Un solo botón con dos sentidos, el mismo de Gráficos y en el mismo sitio —a la izquierda,
          sobre la esquina donde están las flechas que mueve—: mientras quede una abierta cierra, y
          con todas cerradas abre. */}
      <div className="flex justify-start">
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

      {/* Igual que en Gráficos: el orden lo declara `buildAnalisisCards`. */}
      <SpecCard
        spec={cards[0]}
        collapsed={isCollapsed(cards[0].id)}
        onToggleCollapsed={() => toggle(cards[0].id)}
      />

      <div className="grid grid-cols-2 gap-4">
        <SpecCard
          spec={cards[1]}
          collapsed={isCollapsed(cards[1].id)}
          onToggleCollapsed={() => toggle(cards[1].id)}
        />
        <SpecCard
          spec={cards[2]}
          collapsed={isCollapsed(cards[2].id)}
          onToggleCollapsed={() => toggle(cards[2].id)}
        />
      </div>
    </div>
  );
}
