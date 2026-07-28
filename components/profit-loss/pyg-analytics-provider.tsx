"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { buildSeries } from "@/lib/profit-loss/analytics/series";
import type {
  AnalyticsSource,
  SeriesBundle,
  SeriesKey,
  SeriesQuery,
} from "@/lib/profit-loss/analytics/types";
import {
  colorResolver,
  shapeFor,
  type ChartType,
  type SelectionContext,
  type TransformId,
} from "@/lib/profit-loss/charts/selection";
import { sourcesFromViews } from "@/lib/profit-loss/charts/sources";
import type { CellEdit } from "@/lib/profit-loss/types";
import { usePygData } from "./pyg-data-provider";

interface PygAnalyticsValue {
  /** One per selector view — Consolidado included — ready for `buildSeries`. */
  sources: AnalyticsSource[];
  /** The resolved center, frequency and year a preset query is read against. */
  context: SelectionContext;
  transform: TransformId;
  chartType: ChartType;
  /** The one way a series gets a color, so a center keeps its own across cards. */
  colorOf: (key: SeriesKey) => string;
  setTransform: (transform: TransformId) => void;
  setChartType: (chartType: ChartType) => void;
  /** Runs any query against the same sources every card draws from. */
  runQuery: (query: SeriesQuery) => SeriesBundle;
}

const PygAnalyticsContext = createContext<PygAnalyticsValue | null>(null);

/**
 * The presentation-only half of PyG's charts: which engine transformation a card applies and
 * which shape draws it. Everything that used to also live here — the comparison selection, its
 * dimension/cross, the "Agregar" picker — moved to `PygFilters` in `PygDataProvider`, since
 * Datos needs the same marks. `PygDataProvider` mounts this internally: the dashboard layout
 * keeps a single mount point either way.
 *
 * `allEdits` arrives as a prop rather than through the data context because the sources need
 * EVERY center's edits, while the context exposes only the resolved view's.
 */
export function PygAnalyticsProvider({
  allEdits,
  children,
}: {
  allEdits: CellEdit[];
  children: ReactNode;
}) {
  const { views, frequency, activeCenterId, dataset, filters, mode, loadedMonths } = usePygData();

  // The by-centers workspace declares its coverage; every view shares the SAME set, since one
  // file is a month and brings every center at once, Consolidado included. Single mode omits
  // it so `buildAnalyticsSource` keeps inferring coverage from values, as before this change.
  const coveredIndices = useMemo(
    () => (mode === "multi" ? new Set(loadedMonths) : undefined),
    [mode, loadedMonths],
  );

  // Rebuilding the sources is the cost of an edit: the numbers changed, so must the series.
  // Memoizing against `views`/`allEdits` keeps every OTHER render — a filter, a tab, a
  // frequency — from walking the account tree again.
  const sources = useMemo(
    () => sourcesFromViews(views, allEdits, coveredIndices),
    [views, allEdits, coveredIndices],
  );
  const year = dataset?.year ?? 0;

  const context = useMemo<SelectionContext>(
    () => ({ sources, activeCenterId, frequency, year }),
    [sources, activeCenterId, frequency, year],
  );

  const [transform, setTransform] = useState<TransformId>("montos");
  // Sanitized on read rather than in an effect, like every other derived value here: picking a
  // transform that cannot carry the wanted shape clamps to one it can, without a stale render.
  const [wantedChartType, setChartType] = useState<ChartType>("barras");
  const chartType = shapeFor(transform, wantedChartType);

  const colorOf = useMemo(() => colorResolver(filters, context), [filters, context]);
  const runQuery = useCallback((query: SeriesQuery) => buildSeries(sources, query), [sources]);

  const value = useMemo<PygAnalyticsValue>(
    () => ({
      sources,
      context,
      transform,
      chartType,
      colorOf,
      setTransform,
      setChartType,
      runQuery,
    }),
    [sources, context, transform, chartType, colorOf, runQuery],
  );

  return <PygAnalyticsContext.Provider value={value}>{children}</PygAnalyticsContext.Provider>;
}

export function usePygAnalytics(): PygAnalyticsValue {
  const context = useContext(PygAnalyticsContext);
  if (!context) {
    throw new Error("usePygAnalytics debe usarse dentro de <PygDataProvider>.");
  }
  return context;
}
