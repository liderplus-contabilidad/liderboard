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
import {
  CHART_COMPOSITION_MAX,
  CHART_MAX_SERIES,
  CHART_SECTION,
  colorForSliceSlot,
  colorForCompositionSlot,
  colorForEntity,
  colorForRankingSlot,
} from "@/lib/charts/palette";
import type { ChartCardSpec, ChartTable, ChartTableRow } from "@/lib/charts/types";
import { formatCurrency } from "@/lib/format";
import { periodLabel, periodRangeLabel } from "../analytics/period";
import { buildSeries } from "../analytics/series";
import {
  OTHERS_CODE,
  toPareto,
  toPieSlices,
  type AmountEntry,
  type ParetoResult,
} from "../analytics/structure";
import type { AnalyticsSource, PeriodRef, PeriodSlot, SeriesBundle } from "../analytics/types";
import { compareSeries } from "../analytics/variation";
import type { PygFilters } from "../filters";
import {
  buildBusinessLines,
  describeBusinessLines,
  columnsByCategory,
  columnsByCenter,
  readByPeriod,
  readTotal,
  selectBusinessLines,
  sumBusinessLines,
  type BusinessLineSet,
} from "./business-lines";
import { BUSINESS_LINES_PRESET, EXPENSE_DISTRIBUTION_PRESET } from "./preset-views";
import {
  annexPlanOf,
  buildExpenseDistribution,
  describeExpenseDistribution,
  residualCodes,
  shareOf,
  type ExpenseDistribution,
} from "./expense-distribution";
import {
  distributionColor,
  distributionShares,
  foldDistribution,
  resolveDistributionParent,
} from "./distribution";
import {
  categoryBarOption,
  categoryTable,
  entryTable,
  formatChartValue,
  horizontalBarOption,
  verticalBarOption,
  paretoOption,
  pieOption,
  seriesOptionFor,
  seriesTableFor,
  signColorOf,
  stackedTotalOption,
  stackedTotalTable,
  variationBarOption,
  waterfallOption,
  waterfallTable,
} from "./option";
import {
  amountsOver,
  childrenOf,
  compositionQuery,
  coveredPeriods,
  movingPeriods,
  excludedNote,
  expenseRootsOf,
  EXPENSE_RANKING_SIZE,
  intersectWithMarked,
  lastCoveredIndex,
  leavesOf,
  leavesOfAny,
  presetQuery,
  REVENUE_ROOT,
  seriesTotal,
  sumOver,
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
import {
  GUIDE_BUSINESS_LINES,
  GUIDE_COMPOSITION,
  GUIDE_DISTRIBUTION,
  GUIDE_EVOLUTION,
  GUIDE_EXPENSE_ANNEX_BARS,
  GUIDE_EXPENSE_ANNEX_PIE,
  GUIDE_EXPENSE_SHARE,
  GUIDE_PARETO,
  GUIDE_RANKING,
  GUIDE_VARIATION,
  GUIDE_WATERFALL,
} from "./guides";
import { describeShares, markedShares } from "./share";
import { buildWaterfall } from "./waterfall";

const EMPTY_TABLE: ChartTable = { columns: [], rows: [] };

/**
 * The height of the ONLY pie left —the annex's—, and why it is not that of the others.
 *
 * Width is of no use to a pie: ECharts' radius is a percentage of the canvas' SMALLER dimension, and
 * on a full-width card the smaller one is always the height. With the previous 280 px the circle came
 * out about 218 px in diameter inside a card over a thousand wide — a stamp in the middle of an empty
 * band, and with the small slices turned into splinters where the label with its guide line did not
 * fit. Raising it is the ONLY thing that enlarges it.
 *
 * 420 is the height the annex's vertical bar already uses, so that view's two cards end up the same
 * height. «Composición de los ingresos» shared the number while it was also a pie; now it is bars and
 * its height is asked for by its rows, not by a radius.
 */
const PIE_HEIGHT = 420;

/** One of the closing figures above the cards. The VALUE is a number: formatting is the view's. */
export interface CardTile {
  id: string;
  label: string;
  /** `null` is no coverage, and must render as an empty tile — never as `$0`. */
  value: number | null;
  /** Only the result carries one; it always travels with its own glyph, never as color alone. */
  sign?: "positivo" | "negativo";
}

/**
 * What the VIEW decides and the marks do not: «Ocultar meses en 0» belongs to Gráficos and to no
 * other tab, so it is not a `PygFilters` —it is not stored, it produces no chip and Datos and Análisis
 * draw the same whether it is on or off—. It comes in as an option for the same reason the Datos
 * switch lives in its card's header: the cards of a single screen read it.
 */
export interface GraficosOptions {
  /** Removes from the axis the covered periods in which the statement moved nothing. Monthly only. */
  hideEmptyPeriods?: boolean;
  /**
   * The business lines SWITCHED OFF in their card's legend, by id. It comes in as an option and not
   * as a mark for the same reason as «Ocultar meses en 0»: ONE card of ONE tab reads it, so it is not
   * stored, it produces no chip and the printable report still puts out all six.
   */
  hiddenLines?: readonly string[];
}

export interface GraficosCards {
  /** The periods the figures sum, in axis order; empty when nothing is covered. */
  periods: PeriodRef[];
  periodName: string;
  tiles: CardTile[];
  cards: ChartCardSpec[];
  /**
   * The annex's breakdown RAW, and `null` outside that view. It also comes out of the cards because
   * clicking a bar opens THAT line's weight, and drawing it needs its numbers and the two totals —
   * not the already formatted strings the table carries. A bar's index is its position here: both
   * lists are ordered largest to smallest through the same place.
   */
  annex: ExpenseDistribution | null;
  /**
   * The accounts «Otros» stands for, and empty whenever that bar is not drawn.
   *
   * They come out next to the breakdown because the breakdown cannot carry them: it computes the
   * residual by SUBTRACTION and never looks at what makes it up, so the sentinel `OTHERS_CODE` has
   * no children to open. Resolving them here, off the same `annexPlan` that drew the bars, is what
   * keeps a second definition of «what the annex leaves out» from appearing in the view and
   * drifting from this one.
   */
  annexResidualCodes: string[];
  /**
   * The ids of the annex's TWO cards, or `null` outside that view.
   *
   * They come out declared because both draw EXACTLY the same breakdown —one single reduction, the
   * same rows, the same cut— and who decides how many are seen is the CONSUMER: the screen shows one
   * with a «Barras · Pastel» switch, and the printable report both, because a printed control is a
   * button nobody can press (the rule Sueldos por Áreas already applies to its table and its chart).
   * Emitting one here would force the report to ask for the list twice, and emitting two without
   * saying they are a pair would force the view to recognise them by their label.
   */
  annexShapes: { barras: string; pastel: string } | null;
  /**
   * How many COVERED periods moved nothing — what «Ocultar meses en 0» can remove from the axis. It
   * is always counted over the UNPRUNED axis, so it does not change on pressing the button: counting
   * it over the pruned one would leave it at zero and the control would vanish just as it was used,
   * with no way back.
   */
  emptyPeriods: number;
  /**
   * The business lines the legend offers, and `[]` outside that view. They come from here instead of
   * being derived again in the view so the legend and the bars cannot talk about different lists — it
   * is the same reason the annex puts out its breakdown raw.
   *
   * ALL the ones that move in the span go in, the switched off ones too: the legend is the only place
   * they are switched back on from, and an item that disappeared on being pressed would have no way
   * back.
   */
  lines: { id: string; label: string }[];
}

export interface AnalisisCards {
  periods: PeriodRef[];
  periodName: string;
  cards: ChartCardSpec[];
}

/** How a set of covered periods is named on screen; nothing covered is not a range. */
function nameOf(periods: readonly PeriodRef[]): string {
  return periods.length > 0 ? periodRangeLabel(periods) : "Sin movimiento";
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

/**
 * The colour of a composition row by its PLACE in the breakdown, not by its code.
 *
 * `entryColor` does not serve here even though the list already arrives ordered: what it does is hand
 * out `CHART_PALETTE`'s slots, which is the IDENTITY set, and this breakdown has its own. The firm
 * asked for it warm —see `CHART_COMPOSITION_PALETTE`, where it is measured why they are not the exact
 * hues of the reference they brought—. The table twin consumes it TOO, which is what keeps each row's
 * colour dot the same as its bar's. The slots and not the entity still hand it out even though the
 * card is no longer a pie: what it draws is still the WHOLE, ordered breakdown.
 */
export function compositionColor(codes: string[]): (code: string) => string {
  const slotByCode = new Map(codes.map((code, index) => [code, index]));
  return (code) => colorForCompositionSlot(slotByCode.get(code) ?? -1);
}

/**
 * The colour of a ranking bar by its POSITION, not by its code.
 *
 * `entryColor` does not serve here for the same reason it does not serve in the pie, and with a worse
 * consequence: it hands out `CHART_PALETTE`'s eight slots, so from the ninth bar on it returned
 * `CHART_NEUTRAL` — seven identical grey bars at the bottom of a list of fifteen, which is exactly
 * where the reader is going to look to know which is the next one to cut. The list arrives already
 * ranked and cut, so the index IS the position. The table twin consumes it TOO, which is what keeps
 * each row's colour dot the same as its bar's.
 */
export function rankingColorOf(codes: string[]): (code: string) => string {
  const slotByCode = new Map(codes.map((code, index) => [code, index]));
  return (code) => colorForRankingSlot(slotByCode.get(code) ?? -1);
}

/**
 * The hue of an annex slice by its PLACE in the breakdown — the same figure as `compositionColor`,
 * with the long sequence that lets it name seventeen lines instead of six. It does not go through
 * `colorForEntity` for the usual reason: here the colour does not tell apart entities that come and
 * go, it orders a breakdown that arrives whole and already ordered.
 */
export function annexSliceColor(codes: string[]): (code: string) => string {
  const slotByCode = new Map(codes.map((code, index) => [code, index]));
  return (code) => colorForSliceSlot(slotByCode.get(code) ?? -1);
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

/**
 * Sums a list of totals that may not exist: `null` is «not covered» and does not count, but a WHOLE
 * list with no coverage is still `null` — the difference between a total of zero and having no
 * total, which is the engine's rule and cannot be broken precisely in the line that declares the
 * balance.
 */
function addTotals(values: readonly (number | null)[]): number | null {
  return values.reduce<number | null>(
    (total, value) => (value === null ? total : (total ?? 0) + value),
    null,
  );
}

/** A card only carries `note` when there is one; an explicit `undefined` is a different shape. */
function withNote(note: string | undefined): { note?: string } {
  return note === undefined ? {} : { note };
}

/**
 * What the Pareto left out, in one line. The cut is SAID, like the ranking's: a list silently
 * truncated reads as the whole list, and here the truncation is dozens of accounts.
 */
function paretoNote(pareto: ParetoResult): string | undefined {
  const parts = [
    pareto.truncated > 0
      ? `Se muestran las ${pareto.entries.length} cuentas que más concentran; ${pareto.truncated} quedaron fuera.`
      : "",
    excludedNote(pareto.excluded, "Sin acumular") ?? "",
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(" ") : undefined;
}

/**
 * The header card when reading by BUSINESS LINES — with the CATEGORIES on the X axis.
 *
 * The axis is rotated with respect to the rest of the app, and that is the card's decision. With the
 * months on the axis, the five categories that are not hospedaje share a group with a bar a hundred
 * times larger: they end up crushed against the axis, with no label of their own and no room for
 * their figure. Rotating it, each category has its gap and its name even if its bar measures two
 * pixels.
 *
 * What is compared WITHIN each category is not declared: it comes out of what is marked, the whole
 * module's usual figure. Several marked centers draw one bar per establishment —which is the
 * accountant's table, category × sucursal, in a single chart—; otherwise, each covered period is a
 * bar, and when there are more of them than the palette admits it closes into a single bar per
 * category with the span's total, which is also the only reading where each bar prints its figure
 * above it.
 */
function businessLineCard(
  set: BusinessLineSet,
  bundle: SeriesBundle,
  periodName: string,
  centers: readonly { id: string; label: string }[],
  omitted: readonly string[],
): ChartCardSpec {
  // It is summed CENTER BY CENTER, always — with just one too. The batch brings one series per
  // (account, center), so a sum that indexes them by code keeps the last one and talks about a single
  // establishment: the bars would say five hotels and the balance one, and the note would declare half
  // a million «unclassified» that is actually drawn.
  const byCenter = centers.map((center) => ({
    ...center,
    summed: sumBusinessLines(
      bundle.series.filter((entry) => entry.key.centerId === center.id),
      set.lines,
    ).series,
  }));
  const drawnCodes = new Set(
    byCenter.flatMap((center) => center.summed.map((entry) => entry.key.code)),
  );
  const balance = {
    lines: addTotals(
      byCenter.flatMap((center) => center.summed.map((entry) => seriesTotal(entry))),
    ),
    section: addTotals(set.sectionCodes.map((code) => sumAllOver(bundle, code))),
    excluded: addTotals(set.excluded.map((entry) => sumAllOver(bundle, entry.code))),
    // What is switched off in the legend is still money of the statement: it is summed here so the
    // balance counts it as a difference instead of declaring it «unclassified», which is the warning
    // that the reading does not close and must not be spent on something the user has just switched
    // off on purpose.
    hidden: addTotals(
      set.hidden.flatMap((line) => line.codes.map((code) => sumAllOver(bundle, code))),
    ),
    idle: set.lines.length - drawnCodes.size,
  };

  // With several centers each column of the axis is a (category, establishment) pair —the shape of
  // the accountant's sheet—, and the bars inside are still the periods: the two readings coexist in
  // the same chart instead of taking turns.
  const columns =
    centers.length > 1
      ? columnsByCenter(byCenter, set.lines)
      : columnsByCategory(byCenter[0]?.summed ?? []);
  // The COVERED periods, not the whole axis: a year loaded up to May compares five bars per category
  // —the chart the firm draws by hand—, and as soon as it goes past the palette's eight slots it
  // closes into a single bar per category with the total, which is also the only reading where each
  // bar prints its figure above it.
  const marks = bundle.periods
    .map((period, index) => ({ index, label: periodLabel(period) }))
    .filter((mark) => columns.some((column) => column.series.points[mark.index]?.value != null));
  const reading =
    marks.length > 1 && marks.length <= CHART_MAX_SERIES
      ? readByPeriod(columns, marks)
      : readTotal(columns, marks.length === 1 ? marks[0].label : periodName);
  const order = reading.series.map((entry) => entry.id);
  const context = { colorOf: (id: string) => colorForEntity(id, order) };

  // The subtitle counts LINES, not columns: with three centers marked, «10 líneas» would be false —
  // they are four lines seen across three establishments.
  const drawnLines = new Set(columns.map((column) => column.series.key.code)).size;
  const subtitle =
    centers.length > 1
      ? `${drawnLines} ${drawnLines === 1 ? "línea" : "líneas"} × ${centers.length} centros · ${periodName}`
      : `${drawnLines} ${drawnLines === 1 ? "línea" : "líneas"} · ${periodName}`;

  const drawn = reading.categories.length > 0 && reading.series.length > 0;
  return {
    id: "evolucion",
    title: "Ventas por línea de negocio",
    subtitle,
    guide: GUIDE_BUSINESS_LINES,
    option: drawn
      ? categoryBarOption(reading.categories, reading.series, context, reading.groups)
      : null,
    table: drawn
      ? categoryTable(reading.categories, reading.series, context, reading.groups)
      : EMPTY_TABLE,
    warnings: bundle.warnings,
    ...withNote(
      [
        // With all of them switched off there is no balance to write —no line is left to sum—, so the
        // note says what happened and where it is undone, which is the only useful thing there.
        set.lines.length === 0
          ? "Todas las líneas están apagadas: enciende alguna en la leyenda para volver a dibujar."
          : describeBusinessLines(set, balance),
        // Why Hospedaje shows three establishments and not the five marked: the other two do not sell
        // hospedaje. Without saying so, a missing column reads as a missing datum.
        centers.length > 1 && columns.length < drawnLines * centers.length
          ? "Un establecimiento sin ventas en una línea no abre columna."
          : "",
        // Why twelve marked months draw ONE bar: the palette has eight colours. It is said with what
        // has to be done to see them one by one again, not just with the reason.
        marks.length > CHART_MAX_SERIES
          ? `Con más de ${CHART_MAX_SERIES} periodos marcados cada columna muestra el total del tramo; desmarca alguno en «Periodo» para compararlos uno a uno.`
          : "",
        omitted.length > 0 && centers.length > 1
          ? `${omitted.join(" y ")} no entra en el reparto por establecimiento; márcalo en «Centro de costo» para incluirlo.`
          : "",
      ]
        .filter(Boolean)
        .join(" ") || undefined,
    ),
    height: 300,
  };
}

/**
 * The two cards of the EXPENSE ANNEX, which is what the «Costos y gastos» view puts on screen.
 *
 * There are two because they are two readings of the SAME breakdown and neither replaces the other:
 * the bars say how much —they are read in dollars and checked against the book—, and the pie says
 * what part of the total each one is. The accountant's annex carries both, one below the other, for
 * that very reason.
 *
 * **The bars' table twin IS the whole annex**: code, value, % of the expense and % of the revenue,
 * the seventeen rows uncut and with their TOTAL row. That is the place where an account the chart
 * folded still has its figure, and it is what makes cutting the chart lose nothing — the same
 * division of labour `payroll/salaries` already uses, where the chart narrows the cast and the table
 * lists everyone.
 */
function expenseDistributionCards(
  distribution: ExpenseDistribution,
  periodName: string,
  warnings: string[],
  emptyNote: string | undefined,
): [ChartCardSpec, ChartCardSpec] {
  // ONE single reduction for both cards: the bars and the pie draw exactly the same list, folded into
  // «Otros» from line fifteen on. Each used to cut on its own —the bars by the ranking's scale, the
  // pie by its own— and they could show a different number of lines of the same breakdown, which is
  // the kind of disagreement nobody reads as an error.
  // Ordering before cutting is what makes the one that is folded always the smallest.
  // The cut is brought by the breakdown: fifteen with the universe of movement accounts, and ALL the
  // lines when the plan declares its annex, where folding the three smallest hides exactly the rows
  // the accountant checks against their sheet.
  const slices = toPieSlices(distribution.categories, { maxSlices: distribution.maxSlices });
  const drawn = slices.slices;
  const grouped =
    !distribution.residual && drawn.some((slice) => slice.code === OTHERS_CODE)
      ? distribution.categories.length - (distribution.maxSlices - 1)
      : 0;
  // ONE SINGLE colour for the seventeen bars, and it is the one the app already has for this block:
  // the light blue Datos paints root 5 with, sampled from the accountant's own book. Here the colour
  // distinguishes nothing —every bar carries its line labelled on the axis and its figure beside
  // it—, so handing out seventeen hues would spend the identity channel re-saying what the bar's
  // length already says. It is also the rule `CHART_SECTION` declares: when what is drawn is a BLOCK
  // of the statement, the colour says which block it talks about, and a light blue means «costos y
  // gastos» in Datos, in the report and here.
  const colorOf = () => CHART_SECTION.cost;
  const sliceColor = annexSliceColor(drawn.map((slice) => slice.code));
  const note =
    emptyNote ??
    describeExpenseDistribution(distribution, {
      grouped,
      // With cents, the opposite of the axis: here the figure is not looked at, it is CHECKED against
      // the book.
      format: (value) => formatCurrency(value, { cents: true }),
    });

  return [
    {
      id: "evolucion",
      title: "Distribución de costos y gastos",
      guide: GUIDE_EXPENSE_ANNEX_BARS,
      subtitle: `${distribution.categories.length} ${distribution.categories.length === 1 ? "rubro" : "rubros"} · ${periodName}`,
      option: drawn.length > 0 ? verticalBarOption(drawn, { colorOf }) : null,
      table: drawn.length > 0 ? expenseAnnexTable(distribution) : EMPTY_TABLE,
      warnings,
      ...withNote(note),
      // Less than the ranking's fifteen rows —a column takes up width, not height—, but with room for
      // the four lines of the longest label and the figure above the bar.
      height: 420,
    },
    {
      id: "ranking",
      title: "Distribución de costos y gastos %",
      guide: GUIDE_EXPENSE_ANNEX_PIE,
      subtitle: `Peso de cada rubro · ${periodName}`,
      option: drawn.length > 0 ? pieOption(slices, { colorOf: sliceColor }) : null,
      table: drawn.length > 0 ? entryTable(drawn, { colorOf: sliceColor }) : EMPTY_TABLE,
      warnings,
      // What the pie cannot draw —a negative credit note— is named, which is the rule `excludedNote`
      // already applies to the revenue composition.
      ...withNote(emptyNote ?? excludedNote(slices.excluded)),
      height: PIE_HEIGHT,
    },
  ];
}

/**
 * The ANNEX as a table: one row per line with its code, and the two percentage columns the
 * accountant's file prints next to the value.
 *
 * The code goes as a `sublabel` and not stuck to the name because in a table there is room for both,
 * the same decision `categoryTable` takes with the establishment. The rows carry NO colour dot, which
 * is what `ChartTableRow.color` documents for a row that is not a series: here the seventeen bars
 * share a fill, so a dot per row would promise a distinction that does not exist. The TOTAL row
 * closes with `emphasis`: without it a total reads as one more line of the list, and here it is
 * precisely the figure everything above is checked against.
 */
function expenseAnnexTable(distribution: ExpenseDistribution): ChartTable {
  const pct = (value: number | null) =>
    value === null ? null : formatChartValue(value, "porcentaje");
  const rows: ChartTableRow[] = distribution.categories.map((category) => ({
    id: category.code,
    label: category.label,
    sublabel: category.code,
    values: [
      formatCurrency(category.value, { cents: true }),
      pct(category.shareOfExpenses),
      pct(category.shareOfRevenue),
    ],
  }));

  if (distribution.totalExpenses !== null) {
    rows.push({
      id: "__total__",
      label: "Total costos y gastos",
      emphasis: true,
      values: [
        formatCurrency(distribution.totalExpenses, { cents: true }),
        // The 100 % belongs to the whole breakdown even though three lines are being looked at: the
        // denominator is the engine's rollup, so the column adds up to less and this cell still tells
        // the truth.
        pct(shareOf(distribution.totalExpenses, distribution.totalExpenses)),
        pct(distribution.expensesOverRevenue),
      ],
    });
  }

  return { columns: ["Valor", "% del gasto", "% del ingreso"], rows };
}

/**
 * One account summed over ALL the series that bring it, which with several centers in play are
 * several. `sumOver` returns the first one, and with that the note's balance would talk about a
 * single establishment while the bars talk about five.
 */
function sumAllOver(bundle: SeriesBundle, code: string): number | null {
  return addTotals(
    bundle.series.filter((entry) => entry.key.code === code).map((entry) => seriesTotal(entry)),
  );
}

/**
 * Gráficos answers *how much and of what*: amounts per period, comparisons between accounts and
 * centers, composition of a total.
 *
 * A figure here is the TOTAL of the periods the filter bar left in play — six months marked is a
 * six-month figure, and with nothing marked it is the whole covered year, which is what the
 * cascade beside it already declared it was summing. Reading a single closing column was what the
 * tab did back when there was no «Periodo» filter and the last loaded month was the only period
 * anyone could speak of.
 *
 * That span is resolved ONCE and travels out with the list. A statement whose revenue stops in
 * July but keeps booking a small cost through December has coverage to December; if each card
 * resolved its own, one subtitle would read «Ene–Jul» and the next «Ene–Dic» over the same
 * screen. Returning it alongside makes that unicity structural instead of a convention.
 */
export function buildGraficosCards(
  context: SelectionContext,
  filters: PygFilters,
  options: GraficosOptions = {},
): GraficosCards {
  const sources = [...context.sources];
  const runQuery = (query: Parameters<typeof buildSeries>[1]) => buildSeries(sources, query);
  const source = activeSource(context);
  // A marked period is a year-less slot; the engine reads dated references. Gráficos still reads
  // ONE year (`context.year`), so the expansion has a single year to stamp.
  const marked = expandSlots(filters.periods, [context.year]);

  const defaultCodes = defaultEvolutionCodes(source);
  const statement = runQuery(presetQuery(defaultCodes, context, { periods: marked }));
  const covered = coveredPeriods(statement);
  // A «month at 0» only exists in MONTHLY: a quarter aggregates three months, and one that added up
  // to zero would be a quarter at zero, not a month — the view does not offer the button outside it
  // either, and this is what makes passing it anyway harmless.
  const moving = context.frequency === "mensual" ? movingPeriods(statement) : statement.periods;
  // It is counted against the DRAWN columns and not against the covered ones, which is what makes the
  // button useful: the axis is the frequency's —the year's twelve unless «Periodo» narrows it—, so a
  // file that runs to July paints Aug–Dec empty even though the label says «Ene–Jul». Against the
  // covered ones it gave zero in exactly the case that is seen on screen.
  //
  // A month NEVER loaded and one loaded at zero both go: to the engine they are different things and
  // they still are —the label and the tiles read `coveredPeriods`—, but what the button removes are
  // empty columns, and on the axis both are just that.
  const emptyPeriods = statement.periods.length - moving.length;
  // It is only pruned if something is left: with the WHOLE axis at zero, narrowing to an empty list
  // means «the whole axis» to the engine, so the columns would come back whole. There is nothing to
  // hide there.
  const hiding = options.hideEmptyPeriods === true && emptyPeriods > 0 && moving.length > 0;
  const periodRefs = hiding ? moving : marked;
  // The first card does not read `periodRefs`: its axis comes from `toSeriesQuery`, which builds it
  // from the «Periodo» marks. So the pruning reaches it, the periods that are left are passed as
  // though they were marked —narrowing is exactly what a mark does—, instead of opening a second door
  // to the engine that could end up drawing a different axis from the rest of the screen.
  const axisSlots: PeriodSlot[] = hiding
    ? moving.map(({ frequency, index }) => ({ frequency, index }))
    : [...filters.periods];
  // The batch is repeated over the narrowed axis instead of being filtered by hand: it is the same
  // query the other cards make, so its coverage and its notices come out of the same rule and not out
  // of a second pruning that could diverge. The figures do not move —a month at zero adds zero—; what
  // changes is the axis.
  const totals = hiding
    ? runQuery(presetQuery(defaultCodes, context, { periods: periodRefs }))
    : statement;
  const periods = hiding ? moving : covered;
  const periodName = nameOf(periods);

  const revenue = sumOver(totals, REVENUE_ROOT);
  const expenseParts = defaultCodes.slice(1).map((root) => sumOver(totals, root));
  const expense = expenseParts.every((value) => value === null)
    ? null
    : expenseParts.reduce((sum: number, value) => sum + (value ?? 0), 0);
  const result = revenue !== null && expense !== null ? revenue - expense : null;

  // The evolution card draws the marked accounts (and centers); with nothing marked it falls
  // back to Ingresos vs Costos y Gastos — the same totals the tiles read.
  const evolutionCodes = filters.codes.length > 0 ? filters.codes : defaultCodes;
  const evolutionFilters = { ...filters, codes: evolutionCodes, periods: axisSlots };
  const evolution = runQuery(toSeriesQuery(evolutionFilters, context));
  // Marking an account and another that contains it is not just comparing two bars: the question that
  // produces that mark is what part of the first the second is. The percentage is computed ONCE and
  // the three readings come out of it — the bar's label, the tooltip and the footnote.
  const shares = markedShares(evolution.series, sources);
  const evolutionContext = {
    colorOf: colorResolver(evolutionFilters, context),
    periods: evolution.periods,
    shares: new Map(shares.map((share) => [share.seriesId, share])),
  };

  // The first card answers ONE of two questions, never both: what the marked accounts compare, or
  // —with a preset view chosen— what that view presents. That they are mutually exclusive is
  // guaranteed by `filters.ts`; here it is only chosen, and a plan that declares no lines leaves the
  // mark inert instead of emptying the card.
  const declaredLines =
    filters.preset === BUSINESS_LINES_PRESET ? buildBusinessLines(source) : null;
  // What the LEGEND left switched on. The switched off ones are not lost: they travel in the same set
  // so the balance counts them, and the list offered to switch them back on comes from below.
  const lineSet = declaredLines
    ? selectBusinessLines(declaredLines, options.hiddenLines ?? [])
    : null;
  // The query carries, besides the member accounts, the EXCLUDED ones and the whole section: they are
  // the two figures the note squares the reading against the statement with, and asking for them
  // separately would open the door to squaring against a different span from the one the bars draw.
  // Which establishments the view draws: the MARKED ones, which on switching it on are all the real
  // ones because `withPresetSelected` seeds them — that way what is drawn and what is marked are the
  // same and one is removed by unmarking it. Unmarking them all goes back to the resolved center, the
  // usual rule. It is the only card that reads several centers at once, and that is why the query
  // asks for them here.
  const lineCenters = filters.centerIds.length > 0 ? filters.centerIds : [context.activeCenterId];
  // What the breakdown leaves out is SAID: they are dollars that were in the consolidado and are no
  // longer in any column. The accounting system's catch-all is the only one the view leaves out on
  // its own — the rest of the absences are unmarkings in plain sight, in the dropdown itself.
  const omittedCenters = context.centers.filter(
    (center) => center.kind === "sin-centro" && !lineCenters.includes(center.id),
  );
  // The batch asks for the accounts of ALL the declared lines, not only the switched on ones: the
  // switched off ones enter the balance and the legend, and asking for them separately would open the
  // door to squaring against a different span from the one the bars draw.
  const lineBundle =
    declaredLines && declaredLines.lines.length > 0
      ? runQuery(
          compositionQuery(
            [
              ...declaredLines.lines.flatMap((line) => line.codes),
              ...declaredLines.excluded.map((entry) => entry.code),
              ...declaredLines.sectionCodes,
            ],
            context,
            { periods: periodRefs, centerIds: lineCenters },
          ),
        )
      : null;
  const centerLabels = new Map(context.sources.map((entry) => [entry.centerId, entry.centerName]));
  // Only the ones that move: the plan declares accounts at zero all year, and a legend item that draws
  // nothing on being switched on teaches you not to press the ones next to it. It is judged over the
  // SAME batch the bars draw, so what the legend offers and what is seen cannot drift apart.
  const lineLegend =
    declaredLines && lineBundle
      ? declaredLines.lines
          .filter((line) => {
            const total = addTotals(line.codes.map((code) => sumAllOver(lineBundle, code)));
            return total !== null && total !== 0;
          })
          .map((line) => ({ id: line.id, label: line.label }))
      : [];

  // Distribución: what an account is made of, period by period. The account is resolved by the same
  // figure as the center and the year — exactly one marked is that one, none or several is Ingresos —
  // and its children are queried with NO cap, because folding the tail into «Otros» requires seeing
  // them all first.
  const parent = resolveDistributionParent(source, filters.codes);
  const childCodes = parent ? childrenOf(source, parent.code) : [];
  const children = runQuery(compositionQuery(childCodes, context, { periods: periodRefs }));
  const distribution = foldDistribution(children.series);
  // The total travels through its own query and not by re-summing the bars: with «Otros» folded or a
  // negative child, the stack's ceiling and the account's total are not the same number.
  const parentTotal = parent
    ? (runQuery(presetQuery([parent.code], context, { periods: periodRefs })).series[0] ?? null)
    : null;
  // The amount is said by the line, once per column; what the stack adds is what PART of it each child
  // is, and that breakdown is computed just once for the label and the tooltip.
  const shareOfParent =
    parent && parentTotal ? distributionShares(distribution.series, parentTotal, parent.label) : [];
  const distributionContext = {
    colorOf: distributionColor(distribution.series),
    periods: children.periods,
    shares: new Map(shareOfParent.map((share) => [share.seriesId, share])),
  };
  const distributionNote = parent
    ? [
        distribution.series.length > 0
          ? `La línea es el total de ${parent.label}; las barras, sus cuentas hijas, con el porcentaje que cada una ocupa dentro de él.`
          : "",
        distribution.grouped > 0
          ? `«Otros» agrupa ${distribution.grouped} cuentas más pequeñas.`
          : "",
        distribution.idle > 0
          ? `${distribution.idle} ${distribution.idle === 1 ? "cuenta quedó fuera" : "cuentas quedaron fuera"} por no tener movimiento en ${periodName.toLowerCase()}.`
          : "",
      ]
        .filter(Boolean)
        .join(" ")
    : "Marca UNA cuenta con desglose en «Cuenta contable» para ver de qué está hecha.";

  // Composition and ranking keep their fixed question, but they intersect their universe with the
  // marked accounts — a marked expense account empties the revenue composition on purpose.
  const revenueLeaves = leavesOf(source, REVENUE_ROOT);
  const compositionCodes = intersectWithMarked(revenueLeaves, filters.codes);
  const composition = runQuery(
    compositionQuery(compositionCodes, context, { periods: periodRefs }),
  );
  // The cut is declared by the scale, not by a loose number: that way «Otros» always lands in the
  // last slot and no row is left without a hue.
  const slices = toPieSlices(amountsOver(composition), { maxSlices: CHART_COMPOSITION_MAX });
  const sliceColor = compositionColor(slices.slices.map((slice) => slice.code));
  const compositionEmptyNote =
    revenueLeaves.length > 0 && compositionCodes.length === 0
      ? "El filtro de cuentas marcadas no incluye ninguna cuenta de Ingresos."
      : undefined;

  // Ranking of expenses: sorted BEFORE the cut, so the largest cannot fall off the list — and
  // before the colors, so the first bar drawn takes the first slot.
  // The annex does not break down by MOVEMENT accounts when the open plan is the one that declares
  // its own: it asks for the SEVENTEEN codes of that sheet and for no other. It is decided with the
  // view switched on and not always because the ranking, which shares this batch, gives up its slot
  // to the annex's card — so no other card of Gráficos ever sees this universe.
  const annexPlan =
    filters.preset === EXPENSE_DISTRIBUTION_PRESET ? annexPlanOf(source, filters.codes) : null;
  const expenseLeaves = leavesOfAny(source, defaultCodes.slice(1));
  const rankingCodes = annexPlan
    ? annexPlan.rows.map((row) => row.code)
    : intersectWithMarked(expenseLeaves, filters.codes);
  const expenses = runQuery(compositionQuery(rankingCodes, context, { periods: periodRefs }));
  const ranking = topEntries(amountsOver(expenses), EXPENSE_RANKING_SIZE);
  const rankingColor = rankingColorOf(ranking.entries.map((entry) => entry.code));
  // The ANNEX: the ranking's same universe, but whole and with its two denominators. It reuses that
  // batch instead of asking for its own — two queries for the same breakdown could end up squaring
  // against different spans, which is exactly what the note claims does not happen.
  const annex =
    filters.preset === EXPENSE_DISTRIBUTION_PRESET
      ? buildExpenseDistribution(
          amountsOver(expenses),
          { expenses: expense, revenue },
          // With no declared plan it goes `null` and the breakdown is the usual one: each movement
          // account on its own, with its name from the plan and the tail folded by size.
          { annex: annexPlan },
        )
      : null;
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
  const range = periodRangeLabel(waterfall?.periods ?? []);

  // The annex's view takes TWO slots of the list: the first one, which is what every preset view
  // replaces, and the ranking's — because the ranking asks the same thing about the same universe,
  // and leaving both would print the same list twice. The revenue composition stays on the list on
  // purpose: the annex's second denominator is revenue, so having it on screen is the context for
  // the «% del ingreso» column.
  const [annexBars, annexPie] = annex
    ? expenseDistributionCards(annex, periodName, expenses.warnings, rankingEmptyNote)
    : [null, null];

  // The three that close the list are declared separately because the annex changes WHICH ones come
  // out —it takes the ranking and «Distribución» with it— while leaving the others in their same
  // order: taking them out of the literal is what avoids writing them twice.
  //
  // The composition is drawn in HORIZONTAL BARS and not in a pie, the same shape as the ranking
  // beside it: the breakdown already arrives ordered largest to smallest, and a bar says how much
  // each line weighs by its LENGTH —which is compared at a glance across aligned rows— whereas a pie
  // says it by an angle that has to be estimated. The pie's price was also the label: six small
  // slices write their names outside, with a guide line, piled on one edge; here each line has its
  // own row and its amount at the end of the bar. What is kept is the breakdown —«Otros» and the
  // excluded ones are still `toPieSlices`', with its footnote— and the warm colour set, which here
  // only has to tell six rows apart.
  //
  // The bars are ordered largest to smallest, and the table twin receives THAT list and not
  // `toPieSlices`' — which leaves «Otros» at the end because a pie draws it in the array's order.
  // Ordering just once is what stops the table's third row being the fifth bar when the folded tail
  // weighs more than a loose account. The COLOUR is still resolved over the unordered list, which is
  // what keeps «Otros» in the warm set's last slot.
  const compositionEntries = [...slices.slices].sort((a, b) => b.value - a.value);
  const composicionCard: ChartCardSpec = {
    id: "composicion",
    title: "Composición de los ingresos",
    guide: GUIDE_COMPOSITION,
    subtitle: periodName,
    option:
      compositionEntries.length > 0
        ? horizontalBarOption(compositionEntries, { colorOf: sliceColor })
        : null,
    table:
      compositionEntries.length > 0
        ? entryTable(compositionEntries, { colorOf: sliceColor })
        : EMPTY_TABLE,
    warnings: composition.warnings,
    // The excluded ones' label can no longer say «pastel»: the card is bars. The annex, which is
    // still a pie, keeps the default lead.
    ...withNote(compositionEmptyNote ?? excludedNote(slices.excluded, "Fuera del reparto")),
    // Six rows do not ask for a pie's height: at the ranking's density (~34 px per row) it would fall
    // short for a card, and at 420 px the bars swim in white.
    height: 320,
  };
  const rankingCard: ChartCardSpec = {
    id: "ranking",
    title: "Ranking de gastos",
    guide: GUIDE_RANKING,
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
    // Fifteen rows ask for the height of fifteen rows: at 280 px each bar drops to 17 px and the
    // account's label stops fitting next to its amount. It is the same density as before (~34 px per
    // row), not a bigger card.
    height: 520,
  };
  const cascadaCard: ChartCardSpec = {
    id: "cascada",
    title: "Del ingreso a la utilidad",
    guide: GUIDE_WATERFALL,
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
  };

  const distribucionCard: ChartCardSpec = {
    id: "distribucion",
    title: parent ? `Distribución de ${parent.label}` : "Distribución de una cuenta",
    guide: GUIDE_DISTRIBUTION,
    subtitle: `${distribution.series.length} ${distribution.series.length === 1 ? "cuenta" : "cuentas"} · ${periodName}`,
    option:
      distribution.series.length > 0 && parentTotal
        ? stackedTotalOption(distribution.series, parentTotal, distributionContext)
        : null,
    table:
      distribution.series.length > 0 && parentTotal
        ? stackedTotalTable(distribution.series, parentTotal, distributionContext)
        : EMPTY_TABLE,
    warnings: children.warnings,
    ...withNote(distributionNote || undefined),
    height: 320,
  };

  return {
    periods,
    periodName,
    emptyPeriods,
    annex,
    // Only when «Otros» is actually on screen: with marked accounts the breakdown is a slice on
    // purpose and there is no residual bar to open.
    annexResidualCodes: annexPlan && annex?.residual ? residualCodes(source, annexPlan) : [],
    annexShapes: annexBars && annexPie ? { barras: annexBars.id, pastel: annexPie.id } : null,
    lines: lineLegend,
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
      annexBars ??
        (lineSet && lineBundle
          ? businessLineCard(
              lineSet,
              lineBundle,
              periodName,
              lineCenters.map((id) => ({ id, label: centerLabels.get(id) ?? id })),
              omittedCenters.map((center) => center.name),
            )
          : {
              id: "evolucion",
              title: filters.codes.length > 0 ? "Comparación" : "Ingresos contra Costos y Gastos",
              guide: GUIDE_EVOLUTION,
              subtitle: `${evolution.series.length} ${evolution.series.length === 1 ? "serie" : "series"} · ${periodName}`,
              option:
                evolution.series.length > 0
                  ? seriesOptionFor("barras", evolution.series, evolutionContext)
                  : null,
              table: seriesTableFor("barras", evolution.series, evolutionContext),
              warnings: evolution.warnings,
              ...withNote(describeShares(shares)),
              height: 300,
            }),
      // The COMPOSITION precedes the ranking: both are readings of the same breakdown, but the
      // statement is understood better starting from what came in. The ranking, with more rows, ended
      // up at the bottom of a taller card, where the eye no longer reaches. Behind it comes
      // «Distribución», which opens the breakdown period by period, and the CASCADE closes by showing
      // the path from revenue to result. In the annex, the ranking gives up its place, keeping the
      // logical order: composition and then cascade. «Distribución» is omitted under the expense
      // annex, since its reading is already covered by the other cards.
      ...(annex
        ? [annexPie ?? rankingCard, composicionCard, cascadaCard]
        : [composicionCard, rankingCard, distribucionCard, cascadaCard]),
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
  const periods = coveredPeriods(expenses);
  const periodName = nameOf(periods);
  const expensesEmptyNote =
    expenseLeaves.length > 0 && expenseCodes.length === 0
      ? "El filtro de cuentas marcadas no incluye ninguna cuenta de Costos y Gastos."
      : undefined;

  // % over revenue of the largest expenses. Over a span it is `Σ cuenta ÷ Σ ingresos` and never
  // the average of each period's percentage — the same rule the vertical analysis applies to its
  // «Total año», and for the same reason: an average of ratios is not the ratio of the sums, and
  // a thin month would weigh as much as a full one.
  const topExpenses = topEntries(amountsOver(expenses)).entries;
  const revenue = sumOver(
    runQuery(presetQuery([REVENUE_ROOT], context, { periods: periodRefs })),
    REVENUE_ROOT,
  );
  // Ranked before the colors are resolved: the slot order has to match the drawn order, or the
  // first bar of the card comes out painted slot 6.
  const shareEntries = topEntries(
    revenue === null || revenue === 0
      ? []
      : topExpenses.map((entry) => ({ ...entry, value: (entry.value / revenue) * 100 })),
  ).entries;
  const shareColor = entryColor(shareEntries.map((entry) => entry.code));
  // A base of 0 or with no coverage empties the card with ONE line naming the span — never one
  // warning per account, which would bury the reason under the list it explains.
  const shareEmptyNote =
    topExpenses.length > 0 && (revenue === null || revenue === 0)
      ? `Los ingresos de ${periodName} no dan base para el porcentaje.`
      : undefined;

  // Variation against the previous period: the sign is the reading, so it goes out with an icon
  // and the signed value too, never as color alone.
  const lastPeriod = lastCoveredIndex(expenses);
  const variation = topByMagnitude(variationEntries(expenses, lastPeriod));
  const variationColor = signColorOf(variation.entries);
  // The one card that does NOT speak about the span: it compares two columns, so it names them.
  // Inheriting «Ene–Jun» here would announce a variation over six months that nothing computed.
  const variationName =
    periods.length === 0
      ? "Sin movimiento"
      : lastPeriod > 0
        ? `${periodLabel(expenses.periods[lastPeriod])} contra ${periodLabel(expenses.periods[lastPeriod - 1])}`
        : "Sin periodo anterior";

  const pareto = toPareto(amountsOver(expenses));
  const paretoColor = entryColor(pareto.entries.map((entry) => entry.code));

  return {
    periods,
    periodName,
    cards: [
      {
        id: "gastos-sobre-ingresos",
        title: "Gastos principales sobre ingresos",
        guide: GUIDE_EXPENSE_SHARE,
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
        ...withNote(expensesEmptyNote ?? shareEmptyNote),
        height: 300,
      },
      {
        id: "variacion",
        title: "Variación contra el periodo anterior",
        guide: GUIDE_VARIATION,
        subtitle: variationName,
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
        guide: GUIDE_PARETO,
        subtitle: `Pareto · ${periodName}`,
        option: pareto.entries.length > 0 ? paretoOption(pareto, { colorOf: paretoColor }) : null,
        table:
          pareto.entries.length > 0
            ? entryTable(pareto.entries, { colorOf: paretoColor })
            : EMPTY_TABLE,
        // The cut is said, as in the ranking: a list silently trimmed reads as the whole list, and
        // here the trim is of dozens of accounts.
        ...withNote(expensesEmptyNote ?? paretoNote(pareto)),
        height: 300,
      },
    ],
  };
}
