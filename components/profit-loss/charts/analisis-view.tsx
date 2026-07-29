"use client";

import { useMemo } from "react";
import { periodLabel } from "@/lib/profit-loss/analytics/period";
import { toPareto, toPctOfRevenue, type AmountEntry } from "@/lib/profit-loss/analytics/structure";
import { compareSeries } from "@/lib/profit-loss/analytics/variation";
import type { AnalyticsSource, Series, SeriesBundle } from "@/lib/profit-loss/analytics/types";
import {
  entryTable,
  horizontalBarOption,
  paretoOption,
  signColorOf,
  variationBarOption,
  type ChartTable,
} from "@/lib/profit-loss/charts/option";
import {
  amountsAt,
  compositionQuery,
  excludedNote,
  expenseRootsOf,
  intersectWithMarked,
  lastCoveredIndex,
  leavesOfAny,
  topByMagnitude,
  topEntries,
} from "@/lib/profit-loss/charts/presets";
import { activeSource, expandSlots } from "@/lib/profit-loss/charts/selection";
import { buildVerticalAnalysis } from "@/lib/profit-loss/charts/vertical";
import { usePygAnalytics } from "../pyg-analytics-provider";
import { usePygData } from "../pyg-data-provider";
import { PygEmptyState } from "../pyg-empty-state";
import { ChartCard } from "@/components/ui/chart-card";
import { entryColor } from "./graficos-view";
import { VerticalAnalysisCard } from "./vertical-analysis-card";

const EMPTY_TABLE: ChartTable = { columns: [], rows: [] };

/**
 * Análisis answers *how it changes*, and it answers it without asking the reader to configure
 * anything: the vertical analysis table plus three cards — the main expenses against revenue,
 * how each account moved against the previous period, and where the spend concentrates — each
 * intersecting its fixed question with whatever the "Cuenta contable" filter marks (the filter
 * bounds every card, including these). There is no transformation picker: naming an engine
 * transform (índice base 100, media móvil, % sobre la cuenta padre) asked the reader to know
 * the engine, and an accountant reads these questions, not those operations.
 */
export function AnalisisView() {
  const { dataset, filters, accountOptions, collapsed, toggleCollapsed, views } = usePygData();
  const { context, verticalBaseCode, setVerticalBaseCode, runQuery } = usePygAnalytics();
  const source = activeSource(context);
  // A marked period is a year-less slot; the engine reads dated references. Análisis still
  // reads ONE year (`context.year`), so the expansion has a single year to stamp.
  const periodRefs = useMemo(
    () => expandSlots(filters.periods, [context.year]),
    [filters.periods, context.year],
  );
  // `toPctOfRevenue` takes the engine's own mutable array; the context keeps its list readonly.
  const sources = useMemo<AnalyticsSource[]>(() => [...context.sources], [context.sources]);

  const expenseLeaves = leavesOfAny(source, expenseRootsOf(source));
  const expenseCodes = intersectWithMarked(expenseLeaves, filters.codes);
  const expenses = useMemo(
    () => runQuery(compositionQuery(expenseCodes, context, { periods: periodRefs })),
    [runQuery, expenseCodes, context, periodRefs],
  );
  const period = useMemo(() => lastCoveredIndex(expenses), [expenses]);
  const periodName = expenses.periods[period]
    ? periodLabel(expenses.periods[period])
    : "Sin movimiento";
  const expensesEmptyNote =
    expenseLeaves.length > 0 && expenseCodes.length === 0
      ? "El filtro de cuentas marcadas no incluye ninguna cuenta de Costos y Gastos."
      : undefined;

  // % over revenue of the largest expenses — each against the revenue of ITS OWN source, which
  // is what makes two centers of very different size comparable.
  const topExpenses = useMemo(
    () => topEntries(amountsAt(expenses, period)).entries,
    [expenses, period],
  );
  const shares = useMemo(() => {
    const codes = new Set(topExpenses.map((entry) => entry.code));
    return expenses.series
      .filter((series) => codes.has(series.key.code))
      .map((series) => toPctOfRevenue(series, sources));
  }, [expenses, topExpenses, sources]);
  // Ranked before the colors are resolved: the slot order has to match the drawn order, or the
  // first bar of the card comes out painted slot 6.
  const shareEntries = useMemo(
    () => topEntries(atPeriod(shares, period)).entries,
    [shares, period],
  );
  const shareColor = useMemo(
    () => entryColor(shareEntries.map((entry) => entry.code)),
    [shareEntries],
  );

  // Variation against the previous period: the sign is the reading, so it goes out with an
  // icon and the signed value too, never as color alone.
  const variation = useMemo(
    () => topByMagnitude(variationEntries(expenses, period)),
    [expenses, period],
  );
  const variationColor = useMemo(() => signColorOf(variation.entries), [variation]);

  const pareto = useMemo(() => toPareto(amountsAt(expenses, period)), [expenses, period]);
  const paretoColor = useMemo(
    () => entryColor(pareto.entries.map((entry) => entry.code)),
    [pareto],
  );

  // The vertical analysis reads the SOURCE rather than a query: it draws the whole account tree
  // and a query would cap it at the palette's eight slots. Everything that bounds it — the
  // frequency, the marked periods and accounts, the fold state — comes from the filter bar.
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

      <ChartCard
        title="Gastos principales sobre ingresos"
        subtitle={`% sobre ingresos · ${periodName}`}
        option={
          shareEntries.length > 0
            ? horizontalBarOption(shareEntries, {
                colorOf: shareColor,
                unit: "porcentaje",
              })
            : null
        }
        table={
          shareEntries.length > 0
            ? entryTable(shareEntries, { colorOf: shareColor, unit: "porcentaje" }, "% ingresos")
            : EMPTY_TABLE
        }
        warnings={expenses.warnings}
        note={expensesEmptyNote}
        height={300}
      />

      <div className="grid grid-cols-2 gap-4">
        <ChartCard
          title="Variación contra el periodo anterior"
          subtitle={periodName}
          option={variation.entries.length > 0 ? variationBarOption(variation.entries) : null}
          table={
            variation.entries.length > 0
              ? entryTable(variation.entries, { colorOf: variationColor }, "Variación")
              : EMPTY_TABLE
          }
          note={[
            "Cada barra lleva su flecha y su valor con signo; el color no es la única señal.",
            expensesEmptyNote ?? "",
            variation.hidden > 0
              ? `Se muestran los ${variation.entries.length} movimientos más grandes; ${variation.hidden} quedaron fuera.`
              : "",
          ]
            .filter(Boolean)
            .join(" ")}
          height={300}
        />

        <ChartCard
          title="Concentración de gastos"
          subtitle={`Pareto · ${periodName}`}
          option={pareto.entries.length > 0 ? paretoOption(pareto, { colorOf: paretoColor }) : null}
          table={
            pareto.entries.length > 0
              ? entryTable(pareto.entries, { colorOf: paretoColor })
              : EMPTY_TABLE
          }
          note={expensesEmptyNote ?? excludedNote(pareto.excluded, "Sin acumular")}
          height={300}
        />
      </div>
    </div>
  );
}

/** One entry per series at one period, dropping the ones with no coverage there. */
function atPeriod(series: Series[], index: number): AmountEntry[] {
  if (index < 0) {
    return [];
  }
  return series
    .map((entry) => ({
      code: entry.key.code,
      label: entry.label,
      value: entry.points[index]?.value ?? null,
    }))
    .filter((entry): entry is AmountEntry => entry.value !== null);
}

/** The change of each account against the previous period, signed. */
function variationEntries(bundle: SeriesBundle, index: number): AmountEntry[] {
  if (index <= 0) {
    return [];
  }
  return bundle.series
    .map((series) => {
      const points = compareSeries(series, { kind: "periodo-anterior" });
      return {
        code: series.key.code,
        label: series.label,
        value: points[index]?.deltaAbs ?? null,
      };
    })
    .filter((entry): entry is AmountEntry => entry.value !== null);
}
