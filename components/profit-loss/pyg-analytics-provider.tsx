"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { buildSeries } from "@/lib/profit-loss/analytics/series";
import type {
  AnalyticsSource,
  SeriesBundle,
  SeriesKey,
  SeriesQuery,
} from "@/lib/profit-loss/analytics/types";
import { REVENUE_ROOT } from "@/lib/profit-loss/charts/presets";
import { colorResolver, type SelectionContext } from "@/lib/profit-loss/charts/selection";
import { sourcesFromViews } from "@/lib/profit-loss/charts/sources";
import type { CellEdit } from "@/lib/profit-loss/types";
import { usePygData } from "./pyg-data-provider";

interface PygAnalyticsValue {
  /** One per selector view — Consolidado included — ready for `buildSeries`. */
  sources: AnalyticsSource[];
  /** The resolved center, frequency and year a preset query is read against. */
  context: SelectionContext;
  /**
   * The denominator of the vertical analysis table. It lives here and not in `PygFilters`
   * because it selects nothing — it names what one card divides by, and no other tab reads it.
   */
  verticalBaseCode: string;
  /** The one way a series gets a color, so a center keeps its own across cards. */
  colorOf: (key: SeriesKey) => string;
  setVerticalBaseCode: (code: string) => void;
  /** Runs any query against the same sources every card draws from. */
  runQuery: (query: SeriesQuery) => SeriesBundle;
}

const PygAnalyticsContext = createContext<PygAnalyticsValue | null>(null);

/**
 * The presentation-only half of PyG's charts: the materialized sources, the color rule and the
 * one card-level choice left — the vertical analysis' base account. Everything that used to
 * also live here — the comparison selection, its dimension/cross, the "Agregar" picker, and the
 * transformation/shape the Análisis picker set — is gone: the marks moved to `PygFilters` in
 * `PygDataProvider` since Datos needs them too, and no card picks its shape anymore.
 * `PygDataProvider` mounts this internally: the dashboard layout keeps a single mount point
 * either way.
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
  const { views, frequency, activeCenterId, dataset, filters, loadedMonths } = usePygData();

  // Both modes declare their own coverage now (`WorkspaceMeta.loadedMonths`), so it always wins
  // outright over `buildAnalyticsSource`'s value-based inference — every view shares the SAME
  // set, since one file is a month and brings every center (or the lone statement) at once.
  const coveredIndices = useMemo(() => new Set(loadedMonths), [loadedMonths]);

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

  // Sanitized on read rather than in an effect, like every other derived value here: a base the
  // resolved center no longer declares —another workspace,
  // another file— falls back to Ingresos instead of leaving the table blank until it is repicked.
  const [wantedBaseCode, setVerticalBaseCode] = useState<string>(REVENUE_ROOT);
  const activeSource = sources.find((source) => source.centerId === activeCenterId);
  const verticalBaseCode =
    activeSource && !activeSource.valuesByCode.has(wantedBaseCode) ? REVENUE_ROOT : wantedBaseCode;

  const colorOf = useMemo(() => colorResolver(filters, context), [filters, context]);
  const runQuery = useCallback((query: SeriesQuery) => buildSeries(sources, query), [sources]);

  const value = useMemo<PygAnalyticsValue>(
    () => ({
      sources,
      context,
      verticalBaseCode,
      colorOf,
      setVerticalBaseCode,
      runQuery,
    }),
    [sources, context, verticalBaseCode, colorOf, runQuery],
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
