"use client";

import { useMemo } from "react";
import { SpecCard } from "@/components/ui/chart-card";
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

      {/* Igual que en Gráficos: el orden lo declara `buildAnalisisCards`. */}
      <SpecCard spec={cards[0]} />

      <div className="grid grid-cols-2 gap-4">
        <SpecCard spec={cards[1]} />
        <SpecCard spec={cards[2]} />
      </div>
    </div>
  );
}
