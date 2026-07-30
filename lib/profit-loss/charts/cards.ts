/**
 * The cards of Gráficos and Análisis, as DATA rather than as markup.
 *
 * These lists used to be assembled inline in each view, which was fine while the screen was
 * their only reader. It stops being fine the moment a second one — the printable report — has to
 * show the same cards: two assemblies of one question drift, and when they do, the screen states
 * one figure and the report another with nothing able to say which is right.
 *
 * Everything below the surface here is already pure and tested (the engine, the presets, the
 * option builders, the palette). What lives in this module is only the glue: WHICH question each
 * card asks, in what order, and with what words — the part that had no tests at all.
 *
 * The functions take `(context, filters)` and nothing else. `runQuery` in the provider is just
 * `buildSeries(sources, query)` and the context already carries those sources, so injecting it
 * would only open the door to a caller reading series from somewhere other than the context —
 * exactly the divergence this module exists to close.
 */
import type { ChartCardSpec, ChartTable } from "@/lib/charts/types";
import { periodLabel } from "../analytics/period";
import { buildSeries } from "../analytics/series";
import { toPareto, toPctOfRevenue, toPieSlices, type AmountEntry } from "../analytics/structure";
import type { AnalyticsSource, Series, SeriesBundle } from "../analytics/types";
import { compareSeries } from "../analytics/variation";
import type { PygFilters } from "../filters";
import {
  entryTable,
  horizontalBarOption,
  paretoOption,
  pieOption,
  seriesOptionFor,
  seriesTableFor,
  signColorOf,
  variationBarOption,
  waterfallOption,
  waterfallTable,
} from "./option";
import {
  amountOf,
  amountsAt,
  compositionQuery,
  excludedNote,
  expenseRootsOf,
  intersectWithMarked,
  lastCoveredIndex,
  leavesOf,
  leavesOfAny,
  presetQuery,
  REVENUE_ROOT,
  topByMagnitude,
  topEntries,
} from "./presets";
import {
  activeSource,
  codeColorResolver,
  colorResolver,
  expandSlots,
  toSeriesQuery,
  type SelectionContext,
} from "./selection";
import { buildWaterfall, waterfallRangeLabel } from "./waterfall";

const EMPTY_TABLE: ChartTable = { columns: [], rows: [] };

/** One of the closing figures above the cards. The VALUE is a number: formatting is the view's. */
export interface CardTile {
  id: string;
  label: string;
  /** `null` is no coverage, and must render as an empty tile — never as `$0`. */
  value: number | null;
  /** Only the result carries one; it always travels with its own glyph, never as color alone. */
  sign?: "positivo" | "negativo";
}

export interface GraficosCards {
  /** Index of the closing period; `-1` when nothing is covered. */
  period: number;
  periodName: string;
  tiles: CardTile[];
  cards: ChartCardSpec[];
}

export interface AnalisisCards {
  period: number;
  periodName: string;
  cards: ChartCardSpec[];
}

/**
 * Entry-based cards color by account code, ordered by the list the card ACTUALLY draws — which
 * is why every caller below ranks and cuts before calling this. Resolving colors against the
 * unranked list hands the first drawn bar whatever slot its position in the file earned it.
 */
export function entryColor(codes: string[]): (code: string) => string {
  const resolve = codeColorResolver(codes);
  return (code) => resolve({ code, centerId: "", year: 0 });
}

/** One entry per series at one period, dropping the ones with no coverage there. */
export function atPeriod(series: Series[], index: number): AmountEntry[] {
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
export function variationEntries(bundle: SeriesBundle, index: number): AmountEntry[] {
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

/**
 * What the evolution card falls back to with no account marked: Ingresos against every expense
 * root the statement carries — one of them until «Segmentar gastos» adds the non-operating.
 */
function defaultEvolutionCodes(source: AnalyticsSource | undefined): string[] {
  return [REVENUE_ROOT, ...expenseRootsOf(source)];
}

/** A card only carries `note` when there is one; an explicit `undefined` is a different shape. */
function withNote(note: string | undefined): { note?: string } {
  return note === undefined ? {} : { note };
}

/**
 * Gráficos answers *how much and of what*: amounts per period, comparisons between accounts and
 * centers, composition of a total.
 *
 * The closing period is resolved ONCE and travels out with the list. A statement whose revenue
 * stops in July but keeps booking a small cost through December has coverage to December; if
 * each card resolved its own, one subtitle would read «Jul» and the next «Dic» over the same
 * screen. Returning it alongside makes that unicity structural instead of a convention.
 */
export function buildGraficosCards(context: SelectionContext, filters: PygFilters): GraficosCards {
  const sources = [...context.sources];
  const runQuery = (query: Parameters<typeof buildSeries>[1]) => buildSeries(sources, query);
  const source = activeSource(context);
  // A marked period is a year-less slot; the engine reads dated references. Gráficos still reads
  // ONE year (`context.year`), so the expansion has a single year to stamp.
  const periodRefs = expandSlots(filters.periods, [context.year]);

  const defaultCodes = defaultEvolutionCodes(source);
  const totals = runQuery(presetQuery(defaultCodes, context, { periods: periodRefs }));
  const period = lastCoveredIndex(totals);
  const periodName = totals.periods[period]
    ? periodLabel(totals.periods[period])
    : "Sin movimiento";

  const revenue = amountOf(totals, REVENUE_ROOT, period);
  const expenseParts = defaultCodes.slice(1).map((root) => amountOf(totals, root, period));
  const expense = expenseParts.every((value) => value === null)
    ? null
    : expenseParts.reduce((sum: number, value) => sum + (value ?? 0), 0);
  const result = revenue !== null && expense !== null ? revenue - expense : null;

  // The evolution card draws the marked accounts (and centers); with nothing marked it falls
  // back to Ingresos vs Costos y Gastos — the same totals the tiles read.
  const evolutionCodes = filters.codes.length > 0 ? filters.codes : defaultCodes;
  const evolutionFilters = { ...filters, codes: evolutionCodes };
  const evolution = runQuery(toSeriesQuery(evolutionFilters, context));
  const evolutionContext = {
    colorOf: colorResolver(evolutionFilters, context),
    periods: evolution.periods,
  };

  // Composición y ranking conservan su pregunta fija, pero intersecan su universo con las
  // cuentas marcadas — una cuenta de gasto marcada vacía la composición de ingresos a propósito.
  const revenueLeaves = leavesOf(source, REVENUE_ROOT);
  const compositionCodes = intersectWithMarked(revenueLeaves, filters.codes);
  const composition = runQuery(
    compositionQuery(compositionCodes, context, { periods: periodRefs }),
  );
  const slices = toPieSlices(amountsAt(composition, period));
  const sliceColor = entryColor(slices.slices.map((slice) => slice.code));
  const compositionEmptyNote =
    revenueLeaves.length > 0 && compositionCodes.length === 0
      ? "El filtro de cuentas marcadas no incluye ninguna cuenta de Ingresos."
      : undefined;

  // Ranking of expenses: sorted BEFORE the cut, so the largest cannot fall off the list — and
  // before the colors, so the first bar drawn takes the first slot.
  const expenseLeaves = leavesOfAny(source, defaultCodes.slice(1));
  const rankingCodes = intersectWithMarked(expenseLeaves, filters.codes);
  const expenses = runQuery(compositionQuery(rankingCodes, context, { periods: periodRefs }));
  const ranking = topEntries(amountsAt(expenses, period));
  const rankingColor = entryColor(ranking.entries.map((entry) => entry.code));
  const rankingEmptyNote =
    expenseLeaves.length > 0 && rankingCodes.length === 0
      ? "El filtro de cuentas marcadas no incluye ninguna cuenta de Costos y Gastos."
      : undefined;

  // The cascade names the range it actually summed, taken from the coverage and never from the
  // file's year: a statement reaching July is «Ene–Jul», and calling it the year overstates
  // every step. No steps means no covered period at all — it says so rather than drawing a row
  // of bars at zero, which would read as a business that billed nothing.
  const waterfall = source
    ? buildWaterfall(source, {
        frequency: context.frequency,
        ...(periodRefs.length > 0 ? { periods: periodRefs } : {}),
      })
    : null;
  const steps = waterfall?.steps ?? [];
  const range = waterfallRangeLabel(waterfall?.periods ?? []);

  return {
    period,
    periodName,
    tiles: [
      { id: "ingresos", label: "Ingresos", value: revenue },
      { id: "gastos", label: "Costos y Gastos", value: expense },
      {
        id: "resultado",
        label: result !== null && result < 0 ? "Pérdida" : "Utilidad",
        value: result,
        ...(result === null ? {} : { sign: result < 0 ? "negativo" : ("positivo" as const) }),
      },
    ],
    cards: [
      {
        id: "evolucion",
        title: filters.codes.length > 0 ? "Comparación" : "Ingresos contra Costos y Gastos",
        subtitle: `${evolution.series.length} ${evolution.series.length === 1 ? "serie" : "series"} · ${periodName}`,
        option:
          evolution.series.length > 0
            ? seriesOptionFor("barras", evolution.series, evolutionContext)
            : null,
        table: seriesTableFor("barras", evolution.series, evolutionContext),
        warnings: evolution.warnings,
        height: 300,
      },
      {
        id: "composicion",
        title: "Composición de los ingresos",
        subtitle: periodName,
        option:
          slices.slices.length > 0 ? pieOption(slices, { colorOf: sliceColor, donut: true }) : null,
        table:
          slices.slices.length > 0
            ? entryTable(slices.slices, { colorOf: sliceColor })
            : EMPTY_TABLE,
        warnings: composition.warnings,
        ...withNote(compositionEmptyNote ?? excludedNote(slices.excluded)),
        height: 280,
      },
      {
        id: "ranking",
        title: "Ranking de gastos",
        subtitle: `De mayor a menor · ${periodName}`,
        option:
          ranking.entries.length > 0
            ? horizontalBarOption(ranking.entries, { colorOf: rankingColor })
            : null,
        table:
          ranking.entries.length > 0
            ? entryTable(ranking.entries, { colorOf: rankingColor })
            : EMPTY_TABLE,
        warnings: expenses.warnings,
        ...withNote(
          rankingEmptyNote ??
            (ranking.hidden > 0
              ? `Se muestran las ${ranking.entries.length} cuentas más grandes; ${ranking.hidden} quedaron fuera.`
              : undefined),
        ),
        height: 280,
      },
      {
        id: "cascada",
        title: "Del ingreso a la utilidad",
        subtitle: range ? `Suma de ${range}` : "Sin movimiento",
        option: steps.length > 0 ? waterfallOption(steps) : null,
        table: steps.length > 0 ? waterfallTable(steps) : EMPTY_TABLE,
        ...(waterfall ? { warnings: waterfall.warnings } : {}),
        ...withNote(
          waterfall && waterfall.grouped > 0
            ? `«Otros gastos» agrupa ${waterfall.grouped} grupos más pequeños.`
            : undefined,
        ),
        height: 340,
      },
    ],
  };
}

/**
 * Análisis answers *how it changes*, and answers it without asking the reader to configure
 * anything: the main expenses against revenue, how each account moved against the previous
 * period, and where the spend concentrates. Each intersects its fixed question with whatever
 * «Cuenta contable» marks.
 *
 * The vertical analysis table is deliberately NOT here: it owns controls of its own (base
 * account, folding) and its calculation already lives in `buildVerticalAnalysis`.
 */
export function buildAnalisisCards(context: SelectionContext, filters: PygFilters): AnalisisCards {
  const sources = [...context.sources];
  const runQuery = (query: Parameters<typeof buildSeries>[1]) => buildSeries(sources, query);
  const source = activeSource(context);
  const periodRefs = expandSlots(filters.periods, [context.year]);

  const expenseLeaves = leavesOfAny(source, expenseRootsOf(source));
  const expenseCodes = intersectWithMarked(expenseLeaves, filters.codes);
  const expenses = runQuery(compositionQuery(expenseCodes, context, { periods: periodRefs }));
  const period = lastCoveredIndex(expenses);
  const periodName = expenses.periods[period]
    ? periodLabel(expenses.periods[period])
    : "Sin movimiento";
  const expensesEmptyNote =
    expenseLeaves.length > 0 && expenseCodes.length === 0
      ? "El filtro de cuentas marcadas no incluye ninguna cuenta de Costos y Gastos."
      : undefined;

  // % over revenue of the largest expenses — each against the revenue of ITS OWN source, which
  // is what makes two centers of very different size comparable.
  const topExpenses = topEntries(amountsAt(expenses, period)).entries;
  const topCodes = new Set(topExpenses.map((entry) => entry.code));
  const shares = expenses.series
    .filter((series) => topCodes.has(series.key.code))
    .map((series) => toPctOfRevenue(series, sources));
  // Ranked before the colors are resolved: the slot order has to match the drawn order, or the
  // first bar of the card comes out painted slot 6.
  const shareEntries = topEntries(atPeriod(shares, period)).entries;
  const shareColor = entryColor(shareEntries.map((entry) => entry.code));

  // Variation against the previous period: the sign is the reading, so it goes out with an icon
  // and the signed value too, never as color alone.
  const variation = topByMagnitude(variationEntries(expenses, period));
  const variationColor = signColorOf(variation.entries);

  const pareto = toPareto(amountsAt(expenses, period));
  const paretoColor = entryColor(pareto.entries.map((entry) => entry.code));

  return {
    period,
    periodName,
    cards: [
      {
        id: "gastos-sobre-ingresos",
        title: "Gastos principales sobre ingresos",
        subtitle: `% sobre ingresos · ${periodName}`,
        option:
          shareEntries.length > 0
            ? horizontalBarOption(shareEntries, { colorOf: shareColor, unit: "porcentaje" })
            : null,
        table:
          shareEntries.length > 0
            ? entryTable(shareEntries, { colorOf: shareColor, unit: "porcentaje" }, "% ingresos")
            : EMPTY_TABLE,
        warnings: expenses.warnings,
        ...withNote(expensesEmptyNote),
        height: 300,
      },
      {
        id: "variacion",
        title: "Variación contra el periodo anterior",
        subtitle: periodName,
        option: variation.entries.length > 0 ? variationBarOption(variation.entries) : null,
        table:
          variation.entries.length > 0
            ? entryTable(variation.entries, { colorOf: variationColor }, "Variación")
            : EMPTY_TABLE,
        note: [
          "Cada barra lleva su flecha y su valor con signo; el color no es la única señal.",
          expensesEmptyNote ?? "",
          variation.hidden > 0
            ? `Se muestran los ${variation.entries.length} movimientos más grandes; ${variation.hidden} quedaron fuera.`
            : "",
        ]
          .filter(Boolean)
          .join(" "),
        height: 300,
      },
      {
        id: "pareto",
        title: "Concentración de gastos",
        subtitle: `Pareto · ${periodName}`,
        option: pareto.entries.length > 0 ? paretoOption(pareto, { colorOf: paretoColor }) : null,
        table:
          pareto.entries.length > 0
            ? entryTable(pareto.entries, { colorOf: paretoColor })
            : EMPTY_TABLE,
        ...withNote(expensesEmptyNote ?? excludedNote(pareto.excluded, "Sin acumular")),
        height: 300,
      },
    ],
  };
}
