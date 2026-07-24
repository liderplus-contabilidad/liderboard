"use client";

import { useMemo } from "react";
import { formatCurrency } from "@/lib/format";
import { periodLabel } from "@/lib/profit-loss/analytics/period";
import { toPieSlices } from "@/lib/profit-loss/analytics/structure";
import {
  entryTable,
  horizontalBarOption,
  pieOption,
  seriesOptionFor,
  seriesTableFor,
  type ChartTable,
} from "@/lib/profit-loss/charts/option";
import {
  amountOf,
  amountsAt,
  compositionQuery,
  excludedNote,
  EXPENSE_ROOT,
  intersectWithMarked,
  lastCoveredIndex,
  leavesOf,
  presetQuery,
  REVENUE_ROOT,
  topEntries,
} from "@/lib/profit-loss/charts/presets";
import {
  activeSource,
  codeColorResolver,
  colorResolver,
  toSeriesQuery,
} from "@/lib/profit-loss/charts/selection";
import { usePygAnalytics } from "../pyg-analytics-provider";
import { usePygData } from "../pyg-data-provider";
import { PygEmptyState } from "../pyg-empty-state";
import { ChartCard } from "./chart-card";
import { StatTile } from "./stat-tile";
import { WaterfallCard } from "./waterfall-card";

const EMPTY_TABLE: ChartTable = { columns: [], rows: [] };

/** What the evolution card falls back to with no account marked — a stable reference so the
 * queries built from it don't invalidate every render. */
const DEFAULT_EVOLUTION_CODES = [REVENUE_ROOT, EXPENSE_ROOT];

/**
 * Gráficos answers *how much and of what*: amounts per period, comparisons between accounts
 * and centers, composition of a total. No transformation selector — that is Análisis, and no
 * shape selector either — every card here is always bars (or the pie/ranking shape it owns).
 *
 * With an Excel loaded it shows something useful before the user marks anything, because a
 * blank panel next to a loaded file hands the reader the job of guessing what can be asked. The
 * filter bar's marks feed every card at once: the evolution card draws whatever accounts (and
 * centers) are marked, and falls back to Ingresos contra Costos y Gastos when nothing is: there
 * is no separate "Comparación" card living beside it.
 */
export function GraficosView() {
  const { dataset, filters } = usePygData();
  const { context, runQuery } = usePygAnalytics();
  const source = activeSource(context);

  const totals = useMemo(
    () => runQuery(presetQuery(DEFAULT_EVOLUTION_CODES, context, { periods: filters.periods })),
    [runQuery, context, filters.periods],
  );
  // ONE period for the whole tab. Every card names it in its subtitle, so they cannot be
  // allowed to each pick their own: a statement whose revenue stops in July but keeps booking
  // a small cost through December has coverage to the end, and cards resolving it separately
  // would caption one "Jul" and the next "Dic" over the same screen.
  const period = useMemo(() => lastCoveredIndex(totals), [totals]);
  const periodName = totals.periods[period]
    ? periodLabel(totals.periods[period])
    : "Sin movimiento";

  const revenue = amountOf(totals, REVENUE_ROOT, period);
  const expense = amountOf(totals, EXPENSE_ROOT, period);
  const result = revenue !== null && expense !== null ? revenue - expense : null;

  // The evolution card draws the marked accounts (and centers); with nothing marked it falls
  // back to Ingresos vs Costos y Gastos — the same two totals the stat tiles read.
  const evolutionCodes = filters.codes.length > 0 ? filters.codes : DEFAULT_EVOLUTION_CODES;
  const evolutionFilters = useMemo(
    () => ({ ...filters, codes: evolutionCodes }),
    [filters, evolutionCodes],
  );
  const evolutionQuery = useMemo(
    () => toSeriesQuery(evolutionFilters, context),
    [evolutionFilters, context],
  );
  const evolution = useMemo(() => runQuery(evolutionQuery), [runQuery, evolutionQuery]);
  const evolutionColor = useMemo(
    () => colorResolver(evolutionFilters, context),
    [evolutionFilters, context],
  );
  const evolutionContext = { colorOf: evolutionColor, periods: evolution.periods };

  // Composición y ranking conservan su pregunta fija, pero intersecan su universo con las
  // cuentas marcadas — una cuenta de gasto marcada vacía la composición de ingresos a propósito.
  const revenueLeaves = leavesOf(source, REVENUE_ROOT);
  const compositionCodes = intersectWithMarked(revenueLeaves, filters.codes);
  const composition = useMemo(
    () => runQuery(compositionQuery(compositionCodes, context, { periods: filters.periods })),
    [runQuery, compositionCodes, context, filters.periods],
  );
  const slices = useMemo(() => toPieSlices(amountsAt(composition, period)), [composition, period]);
  const sliceColor = useMemo(() => entryColor(slices.slices.map((slice) => slice.code)), [slices]);
  const compositionEmptyNote =
    revenueLeaves.length > 0 && compositionCodes.length === 0
      ? "El filtro de cuentas marcadas no incluye ninguna cuenta de Ingresos."
      : undefined;

  // Ranking of expenses: sorted BEFORE the cut, so the largest cannot fall off the list.
  const expenseLeaves = leavesOf(source, EXPENSE_ROOT);
  const rankingCodes = intersectWithMarked(expenseLeaves, filters.codes);
  const expenses = useMemo(
    () => runQuery(compositionQuery(rankingCodes, context, { periods: filters.periods })),
    [runQuery, rankingCodes, context, filters.periods],
  );
  const ranking = useMemo(() => topEntries(amountsAt(expenses, period)), [expenses, period]);
  const rankingColor = useMemo(
    () => entryColor(ranking.entries.map((entry) => entry.code)),
    [ranking],
  );
  const rankingEmptyNote =
    expenseLeaves.length > 0 && rankingCodes.length === 0
      ? "El filtro de cuentas marcadas no incluye ninguna cuenta de Costos y Gastos."
      : undefined;

  if (!dataset) {
    return <PygEmptyState />;
  }

  return (
    <div className="flex flex-col gap-4 px-7 py-5">
      <div className="flex gap-4">
        <StatTile
          label="Ingresos"
          value={revenue === null ? null : formatCurrency(revenue)}
          hint={periodName}
        />
        <StatTile
          label="Costos y Gastos"
          value={expense === null ? null : formatCurrency(expense)}
          hint={periodName}
        />
        <StatTile
          label={result !== null && result < 0 ? "Pérdida" : "Utilidad"}
          value={result === null ? null : formatCurrency(result)}
          hint={periodName}
          sign={result === null ? undefined : result < 0 ? "negativo" : "positivo"}
        />
      </div>

      <ChartCard
        title={filters.codes.length > 0 ? "Comparación" : "Ingresos contra Costos y Gastos"}
        subtitle={`${evolution.series.length} ${evolution.series.length === 1 ? "serie" : "series"} · ${periodName}`}
        option={
          evolution.series.length > 0
            ? seriesOptionFor("barras", evolution.series, evolutionContext)
            : null
        }
        table={seriesTableFor("barras", evolution.series, evolutionContext)}
        warnings={evolution.warnings}
        height={300}
      />

      <div className="grid grid-cols-2 gap-4">
        <ChartCard
          title="Composición de los ingresos"
          subtitle={periodName}
          option={
            slices.slices.length > 0
              ? pieOption(slices, { colorOf: sliceColor, donut: true })
              : null
          }
          table={
            slices.slices.length > 0
              ? entryTable(slices.slices, { colorOf: sliceColor })
              : EMPTY_TABLE
          }
          warnings={composition.warnings}
          note={compositionEmptyNote ?? excludedNote(slices.excluded)}
          height={280}
        />

        <ChartCard
          title="Ranking de gastos"
          subtitle={`De mayor a menor · ${periodName}`}
          option={
            ranking.entries.length > 0
              ? horizontalBarOption(ranking.entries, { colorOf: rankingColor })
              : null
          }
          table={
            ranking.entries.length > 0
              ? entryTable(ranking.entries, { colorOf: rankingColor })
              : EMPTY_TABLE
          }
          warnings={expenses.warnings}
          note={
            rankingEmptyNote ??
            (ranking.hidden > 0
              ? `Se muestran las ${ranking.entries.length} cuentas más grandes; ${ranking.hidden} quedaron fuera.`
              : undefined)
          }
          height={280}
        />
      </div>

      {/* Primero la historia completa —de dónde salió el ingreso y en qué se fue—, y recién
          después la evolución, que responde una pregunta más fina. */}
      <WaterfallCard
        source={source}
        frequency={context.frequency}
        periods={filters.periods.length > 0 ? filters.periods : undefined}
      />
    </div>
  );
}

/** Entry-based cards color by account code, ordered by the list the card actually draws. */
export function entryColor(codes: string[]): (code: string) => string {
  const resolve = codeColorResolver(codes);
  return (code) => resolve({ code, centerId: "", year: 0 });
}
