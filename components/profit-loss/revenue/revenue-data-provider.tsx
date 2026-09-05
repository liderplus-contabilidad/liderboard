"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { buildAnalyticsSource } from "@/lib/profit-loss/analytics/source";
import { REVENUE_ROOT } from "@/lib/profit-loss/charts/presets";
import { applyEditsToLeafAccounts, mergeCenters } from "@/lib/profit-loss/derive";
import { loadedMonthsFor } from "@/lib/profit-loss/types";
import type { PygDataset } from "@/lib/profit-loss/types";
import { canCaptureExternal } from "@/lib/revenue/availability";
import {
  buildRevenueCards,
  DEFAULT_ANNUAL_SHAPE,
  DEFAULT_GROWTH_UNIT,
  readRevenueSummary,
  type AnnualShape,
  type ComparisonShape,
  type GrowthUnit,
  type RevenueCards,
  type RevenueCardsInput,
  type RevenueSummary,
} from "@/lib/revenue/cards";
import { externalForClient, saveExternalMonth } from "@/lib/revenue/db";
import {
  emptyFilters,
  periodLabel,
  sanitizeFilters,
  selectedMonths,
  withSpanToggled,
  withYearsCleared,
  withMonthsCleared,
  withMonthToggled,
  withYearToggled,
  type RevenueFilters,
  type RevenueUniverse,
} from "@/lib/revenue/filters";
import {
  emptyExternalSeries,
  MONTHS_IN_YEAR,
  type RevenueExternalAmounts,
  type RevenueExternalMonth,
  type RevenueExternalSeries,
  type RevenueYearInput,
} from "@/lib/revenue/types";
import type { NamedSpan } from "@/lib/period";
import { usePygData } from "../pyg-data-provider";

/**
 * «Reportería de ingresos»' state, mounted INSIDE the view and not in the layout.
 *
 * The house rule is that a provider lives in the layout when the HEADER reads from its same state —
 * that is how `ActiveClient` and the panel share it in PyG and in Ocupaciones — and the header reads
 * nothing from this subitem: the client is given by `PygDataProvider`, which is already above.
 * Lifting these marks would put something in the layout no other screen reads.
 *
 * **This is the ONLY place PyG is adapted to `lib/revenue/`.** The pure layer receives a
 * `RevenueYearInput` — a year and twelve numbers — and knows nothing of `PygDataset`, `CellEdit` or
 * `WorkspaceMeta`. That boundary is what lets the whole engine be tested without mounting anything.
 */
interface RevenueDataValue {
  /**
   * The PyG client this belongs to; `null` with none open. Unlike «Ventas por servicio», the
   * consolidado is NOT collapsed into `null` here: the comparison and the growth read estados de
   * resultados, which is exactly what the consolidado sums. What the consolidado cannot do is
   * CAPTURE — see `canCapture`.
   */
  clientId: string | null;
  isConsolidated: boolean;
  clientName: string | undefined;
  /** False until the first read from Dexie: it avoids the empty state flickering over a client that
   *  does have figures captured. */
  ready: boolean;
  /** Whether this workspace can hold captured figures at all. */
  canCapture: boolean;
  universe: RevenueUniverse;
  filters: RevenueFilters;
  /** How the span reads — what the tiles, the subtitles and the report header say. */
  periodName: string;
  /**
   * EXACTLY the input `cards` were built with. The report asks for the same cards with the same
   * arguments instead of recomposing them: two compositions of one input can drift apart, and
   * whoever receives the PDF no longer has the screen beside them to check against.
   */
  cardsInput: RevenueCardsInput;
  cards: RevenueCards;
  summary: RevenueSummary;
  /**
   * The header controls' state. It lives HERE and not inside each card because the cards are rebuilt
   * from `cardsInput` on every read: held locally they would reset to the default on the next mark,
   * and the reader would find the shape they chose undone by an unrelated click.
   */
  growthUnit: GrowthUnit;
  setGrowthUnit: (unit: GrowthUnit) => void;
  /** The comparison's «Ver como». The SCREEN opens flat; the skyline is opted into. */
  comparisonShape: ComparisonShape;
  setComparisonShape: (shape: ComparisonShape) => void;
  /** The annual card's «Ver como» — el total del tramo, o el promedio mensual. */
  annualShape: AnnualShape;
  setAnnualShape: (shape: AnnualShape) => void;
  toggleYear: (year: number) => void;
  clearYears: () => void;
  toggleMonth: (monthIndex: number) => void;
  clearMonths: () => void;
  /** Semestre y quimestre: ATAJOS que marcan meses, nunca un cuarto eje. */
  toggleSpan: (span: NamedSpan) => void;
  /** The year the capture drawer is writing — its own selector, independent of the marks. */
  captureYear: number | null;
  setCaptureYear: (year: number) => void;
  /** The captured figures of the year being written, as twelve slots each. */
  captureSeries: RevenueExternalSeries;
  /** The reference year's revenue, so the drawer can highlight a month with sales and no capture. */
  captureRevenue: (number | null)[];
  saveCapture: (monthIndex: number, amounts: RevenueExternalAmounts) => Promise<void>;
}

const RevenueDataContext = createContext<RevenueDataValue | null>(null);

const NO_EXTERNAL: RevenueExternalMonth[] = [];

export function RevenueDataProvider({ children }: { children: ReactNode }) {
  const {
    activeClientId,
    activeClient,
    isConsolidated,
    datasets,
    edits,
    loadedMonthsByYear,
    sourceSystemId,
  } = usePygData();
  const [rawFilters, setRawFilters] = useState<RevenueFilters>(emptyFilters);
  const [growthUnit, setGrowthUnit] = useState<GrowthUnit>(DEFAULT_GROWTH_UNIT);
  const [comparisonShape, setComparisonShape] = useState<ComparisonShape>("plano");
  const [annualShape, setAnnualShape] = useState<AnnualShape>(DEFAULT_ANNUAL_SHAPE);
  const [captureYearRaw, setCaptureYear] = useState<number | null>(null);

  const canCapture = canCaptureExternal({ sourceSystemId, isConsolidated });
  // The capture writes into a REAL client and never into the consolidado, so the partition it uses is
  // the one `canCapture` already vouched for.
  const clientId = isConsolidated ? null : activeClientId;

  // The ONLY query, and always bounded by the client: it is what stops two companies' figures mixing
  // in silence.
  const stored = useLiveQuery(() => externalForClient(clientId), [clientId]);
  const external = stored ?? NO_EXTERNAL;
  const ready = stored !== undefined;

  /**
   * The revenue of every year the workspace declares, derived and never stored.
   *
   * It is the same path PyG's own Consolidado por centros walks: fold the edits into the leaves,
   * `mergeCenters` the year's datasets into one, and read the analytics source off the synthetic
   * dataset. The reading is of the COMPANY and not of the marked center, like the Excel it replaces.
   *
   * In the cross-client consolidado `datasets`, `edits` and `loadedMonthsByYear` are ALREADY the
   * consolidated ones —«from here on the consolidado IS the workspace»—, so there is a single code
   * path here and it never asks which of the two is open.
   */
  const revenueByYear = useMemo(() => {
    const byYear = new Map<number, PygDataset[]>();
    for (const dataset of datasets) {
      byYear.set(dataset.year, [...(byYear.get(dataset.year) ?? []), dataset]);
    }

    const result: { year: number; monthlyRevenue: (number | null)[] }[] = [];
    for (const [year, ofYear] of byYear) {
      const covered = loadedMonthsFor({ loadedMonthsByYear }, year);
      if (covered.length === 0) {
        // A year with no declared coverage is a year the workspace does not have: it is not a year of
        // zeros, and it does not enter the universe.
        continue;
      }
      const merged = mergeCenters(
        ofYear.map((dataset) =>
          applyEditsToLeafAccounts(
            dataset.accounts,
            edits.filter((edit) => edit.datasetId === dataset.id),
          ),
        ),
      );
      const source = buildAnalyticsSource(
        { ...ofYear[0], accounts: merged.accounts, warnings: [], resultFromFile: [] },
        // The edits are already folded into the merged accounts; applying them again would count
        // them twice — `buildViews`' same rule for the synthetic Consolidado.
        [],
        new Set(covered),
      );
      // `REVENUE_ROOT` comes from PyG's own presets, never redeclared here. Its stored sign is
      // already normalised by whichever upload strategy created the workspace, and `rootSign` is `+1`
      // for the raíz 4 — applying it would be an operation that does nothing while looking like it
      // does something.
      const values = source.valuesByCode.get(REVENUE_ROOT);
      const inCoverage = new Set(covered);
      result.push({
        year,
        monthlyRevenue: Array.from({ length: MONTHS_IN_YEAR }, (_, month) =>
          inCoverage.has(month) ? (values?.[month] ?? 0) : null,
        ),
      });
    }
    return result.sort((a, b) => a.year - b.year);
  }, [datasets, edits, loadedMonthsByYear]);

  /** The captured figures, indexed by year as twelve slots each. */
  const externalByYear = useMemo(() => {
    const byYear = new Map<number, RevenueExternalSeries>();
    for (const row of external) {
      const series = byYear.get(row.year) ?? emptyExternalSeries();
      series.cardRevenue[row.monthIndex] = row.cardRevenue;
      series.cardFees[row.monthIndex] = row.cardFees;
      series.adSpend[row.monthIndex] = row.adSpend;
      byYear.set(row.year, series);
    }
    return byYear;
  }, [external]);

  const years = useMemo(() => revenueByYear.map((entry) => entry.year), [revenueByYear]);

  // The YEARS resolve first, because the universe of months is that of the marked years: without that
  // order, marking a year could not open the months only it brings.
  const yearsOnly = useMemo(
    () => sanitizeFilters(rawFilters, { years, months: [] }),
    [rawFilters, years],
  );
  const universe = useMemo<RevenueUniverse>(() => {
    const marked = new Set(yearsOnly.years);
    const months = new Set<number>();
    for (const entry of revenueByYear) {
      if (!marked.has(entry.year)) {
        continue;
      }
      entry.monthlyRevenue.forEach((value, month) => {
        if (value !== null) {
          months.add(month);
        }
      });
    }
    return { years, months: [...months].sort((a, b) => a - b) };
  }, [years, yearsOnly.years, revenueByYear]);

  // Pruned on READ and never in an effect: switching client cannot leave a render marking a year this
  // client does not have.
  const filters = useMemo(() => sanitizeFilters(rawFilters, universe), [rawFilters, universe]);
  const period = useMemo(() => selectedMonths(filters, universe), [filters, universe]);
  /**
   * The RESOLVED span and not the marks: with no month marked the reading still covers a tramo —every
   * loaded month of the marked years— and a subtitle that named only «2024, 2025, 2026» left the
   * reader to guess which months the figures under it were measured over.
   *
   * Composed HERE and once, so the tiles, the five subtitles, the Excel and the report header cannot
   * name different spans for the same reading.
   */
  const periodName = useMemo(() => periodLabel(period, filters.years), [period, filters.years]);

  const cardsInput = useMemo<RevenueCardsInput>(() => {
    const marked = new Set(filters.years);
    const inputs: RevenueYearInput[] = revenueByYear
      .filter((entry) => marked.has(entry.year))
      .map((entry) => ({
        year: entry.year,
        monthlyRevenue: entry.monthlyRevenue,
        external: externalByYear.get(entry.year) ?? emptyExternalSeries(),
      }));
    return { years: inputs, months: period, period: periodName, canCapture };
  }, [revenueByYear, externalByYear, filters.years, period, periodName, canCapture]);

  const cards = useMemo(
    () => buildRevenueCards(cardsInput, { growthUnit, comparisonShape, annualShape }),
    [cardsInput, growthUnit, comparisonShape, annualShape],
  );
  const summary = useMemo(() => readRevenueSummary(cardsInput), [cardsInput]);

  // The drawer opens on the most recent year, which is the one being closed; the user can move it and
  // the choice survives, because it is independent of the marks.
  const captureYear = captureYearRaw ?? years[years.length - 1] ?? null;
  const captureSeries = useMemo(
    () =>
      (captureYear === null ? emptyExternalSeries() : externalByYear.get(captureYear)) ??
      emptyExternalSeries(),
    [externalByYear, captureYear],
  );
  const captureRevenue = useMemo(
    () =>
      revenueByYear.find((entry) => entry.year === captureYear)?.monthlyRevenue ??
      Array.from({ length: MONTHS_IN_YEAR }, () => null),
    [revenueByYear, captureYear],
  );

  const saveCapture = useCallback(
    async (monthIndex: number, amounts: RevenueExternalAmounts) => {
      // Guarded here as well as in the UI: a write into the consolidado would create a partition that
      // belongs to nobody, and the defence belongs where the write is, not only where the button is.
      if (!clientId || captureYear === null || !canCapture) {
        return;
      }
      await saveExternalMonth(clientId, captureYear, monthIndex, amounts);
    },
    [clientId, captureYear, canCapture],
  );

  /**
   * Every mark goes through here, and it sanitizes BEFORE applying: the marks are pruned on read, so
   * a toggle has to act on the pruned list and not on whatever a previous client left behind.
   */
  const setFilters = useCallback(
    (next: (current: RevenueFilters) => RevenueFilters) => {
      setRawFilters((current) => next(sanitizeFilters(current, universe)));
    },
    [universe],
  );

  /**
   * Every gesture that WRITES a mark, memoized apart from the value.
   *
   * They depend only on the two universes a toggle needs (`years`, `universe.months`) and on
   * `setFilters`, which is a third of what the value itself depends on. Left inline, each of them was
   * a fresh closure on every render of anything the value tracks —a card rebuild, a capture, a shape
   * switch— so the toolbar re-rendered for reasons that had nothing to do with the marks.
   *
   * The three SHAPES stay out of here on purpose: they are what a card is drawn as, not what the
   * screen is narrowed to, and grouping them together would put a chip's dependency on a segmented
   * control.
   */
  const marks = useMemo(
    () => ({
      toggleYear: (year: number) => setFilters((current) => withYearToggled(current, year, years)),
      clearYears: () => setFilters(withYearsCleared),
      toggleMonth: (month: number) =>
        setFilters((current) => withMonthToggled(current, month, universe.months)),
      clearMonths: () => setFilters(withMonthsCleared),
      // A span writes MONTHS and nothing of its own: there is no fourth mark to keep in sync, which
      // is what keeps «ninguna marca = todos» meaning the same thing after adding two controls.
      toggleSpan: (span: NamedSpan) =>
        setFilters((current) => withSpanToggled(current, span, universe.months)),
    }),
    [setFilters, years, universe.months],
  );

  const value = useMemo<RevenueDataValue>(
    () => ({
      clientId: activeClientId,
      isConsolidated,
      clientName: activeClient?.name,
      ready,
      canCapture,
      universe,
      filters,
      periodName,
      cardsInput,
      cards,
      summary,
      growthUnit,
      setGrowthUnit,
      comparisonShape,
      setComparisonShape,
      annualShape,
      setAnnualShape,
      ...marks,
      captureYear,
      setCaptureYear,
      captureSeries,
      captureRevenue,
      saveCapture,
    }),
    [
      marks,
      activeClientId,
      activeClient?.name,
      isConsolidated,
      ready,
      canCapture,
      universe,
      filters,
      periodName,
      cardsInput,
      cards,
      summary,
      growthUnit,
      comparisonShape,
      annualShape,
      captureYear,
      captureSeries,
      captureRevenue,
      saveCapture,
    ],
  );

  return <RevenueDataContext.Provider value={value}>{children}</RevenueDataContext.Provider>;
}

export function useRevenueData(): RevenueDataValue {
  const value = useContext(RevenueDataContext);
  if (!value) {
    throw new Error("useRevenueData debe usarse dentro de RevenueDataProvider.");
  }
  return value;
}
