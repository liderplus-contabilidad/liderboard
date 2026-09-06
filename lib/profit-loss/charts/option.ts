/**
 * `Series[]` (or the engine's composition results) in, an ECharts option out. Every builder is
 * pure, so the rules that make a chart honest are testable without mounting a DOM:
 *
 * - A `null` point stays `null`. ECharts draws no mark for it and, with `connectNulls` off by
 *   default, no line crosses it either. Turning it into 0 would draw a collapse the file never
 *   recorded — the trap the whole coverage model exists to avoid.
 * - No builder returns two `yAxis`. The type forbids it (`ChartOption.yAxis` is one object),
 *   and the combo shares its single scale because bars and line are in the same unit.
 * - No builder writes a hex. Colors come from `colorOf`, strokes and ink from `lib/charts`.
 * - Amounts go through `formatCurrency` and periods through the engine's `periodLabel`; neither
 *   is re-implemented here.
 */
import {
  CHART_BAND,
  CHART_FONT,
  CHART_INK,
  CHART_LINES,
  CHART_MARK,
  CHART_PALETTE,
  CHART_SECTION,
  CHART_SIGN,
  CHART_SURFACE,
} from "@/lib/charts/palette";
export type { ChartTable, ChartTableRow } from "@/lib/charts/types";
import { sectionOf } from "../datos-sections";
import type {
  ChartAxis,
  ChartMarkArea,
  ChartMarkPoint,
  ChartTable,
  ChartLabel,
  ChartLegend,
  ChartOption,
  ChartParam,
  ChartSeries,
  ChartTooltip,
} from "@/lib/charts/types";
import {
  fitDirectLabel,
  labelDistance,
  labelHeadroom,
  type LabelFit,
} from "@/lib/charts/label-fit";
import { formatCurrency, formatNumber, formatPercent } from "@/lib/format";
import { periodLabel } from "../analytics/period";
import {
  OTHERS_CODE,
  toPctOfContainer,
  type AmountEntry,
  type ParetoResult,
  type PieResult,
} from "../analytics/structure";
import { seriesKeyId, type PeriodRef, type Series, type SeriesKey } from "../analytics/types";
import type { BreakdownRow } from "./account-breakdown";
import type { ChartType } from "./selection";
import type { MarkedShare } from "./share";
import { RESULT_CODE, type WaterfallStep } from "./waterfall";

/** What the Y values mean, which is all that changes between amounts, shares and indexes. */
export type ChartUnit = "moneda" | "porcentaje" | "indice";

/** Beyond four series a number per point stops being read and starts being texture. */
const MAX_DIRECT_LABELS = 4;

/**
 * And beyond this many MARKS — series × periods — the same thing happens for a different reason:
 * the count is fine but the room is not. Two series over twelve months is twenty-four amounts on
 * one axis, which at «$144,844» wide leaves them abutting rather than overlapping, so
 * `labelLayout.hideOverlap` never fires and the row prints as one run of digits.
 *
 * It no longer rules the GROUPED BAR, which answers that width with `lib/charts/label-fit`'s rows
 * instead of with silence. What is left under it is what has no rows to spread into: the percentage
 * of a marked account (`sharesFit`) and the line over a stack, both of which ride on bars that are
 * already carrying something else.
 */
const MAX_DIRECT_LABEL_MARKS = 14;

/** Whether a per-mark amount can still be read on this many series over this many points. */
function fitsDirectLabels(seriesCount: number, points: number): boolean {
  return seriesCount <= MAX_DIRECT_LABELS && seriesCount * points <= MAX_DIRECT_LABEL_MARKS;
}

/** Whether a per-mark amount can still be read on this many series over this many periods. */
function labelsFit(seriesCount: number, points: number, context: SeriesOptionContext): boolean {
  return (context.labels ?? true) && fitsDirectLabels(seriesCount, points);
}

/**
 * The percentage over the containing account has its OWN BUDGET, and it is measured against the bars
 * that carry it and not against all of them. A parent and a child over twelve months are 24 marks —
 * no label fits—, but only the child carries a percentage, so there are 12 and they do fit: over the
 * full year each child bar's % is read and no amount, and on narrowing «Periodo» the amount reappears
 * above. Nothing that used to be visible stops being visible; this only adds.
 */
function sharesFit(sharedCount: number, points: number, context: SeriesOptionContext): boolean {
  return (
    (context.labels ?? true) &&
    sharedCount > 0 &&
    sharedCount <= MAX_DIRECT_LABELS &&
    sharedCount * points <= MAX_DIRECT_LABEL_MARKS
  );
}

/**
 * Inside a STACK the percentage is not measured against `sharesFit`'s budget, and that is why it does
 * not go through it: a stack draws ONE column per period, so its labels are spread out vertically
 * —each inside its own piece— and there is no cast squeezing them sideways. What limits here is the
 * segment's HEIGHT, which is its own percentage: below this threshold the number is taller than the
 * piece containing it, so it switches off instead of overflowing it. The tooltip still says it, which
 * is where it is never missing.
 */
const MIN_STACK_LABEL_SHARE = 5;

/** The percentages a segment prints inside itself, with the ones that do not fit already pruned. */
function stackShares(
  series: Series,
  context: SeriesOptionContext,
): readonly (number | null)[] | undefined {
  const share = shareOf(series, context);
  if (!share || context.labels === false) {
    return undefined;
  }
  const legible = share.values.map((value) =>
    value !== null && Math.abs(value) >= MIN_STACK_LABEL_SHARE ? value : null,
  );
  return legible.some((value) => value !== null) ? legible : undefined;
}

/** How many of the drawn series fall inside another marked one — the budget's cast. */
function sharedCountOf(series: readonly Series[], context: SeriesOptionContext): number {
  return context.shares ? series.filter((entry) => shareOf(entry, context)).length : 0;
}

function shareOf(series: Series, context: SeriesOptionContext): MarkedShare | undefined {
  return context.shares?.get(seriesKeyId(series.key));
}

/** The fragment of `rich` that paints the percentage: an annotation under the figure, not the figure. */
const SHARE_RICH_KEY = "share";

/** Below two series there is nothing to tell apart, so the title carries the name. */
const MIN_LEGEND_SERIES = 2;

/** Charts whose X axis is the period. */
export interface SeriesOptionContext {
  /** The only way a series gets a color; comes from `colorResolver`. */
  colorOf: (key: SeriesKey) => string;
  periods: PeriodRef[];
  /** Adds the year to the period labels; only when the query spans several. */
  multiYear?: boolean;
  unit?: ChartUnit;
  /**
   * Draw the value over each mark. Default true, and what a grouped bar chart does at any density
   * (`fitGroupedLabel`). Set false where the card is not the place to read the figure: the account's
   * ficha in the side panel, whose whole table of amounts is right under the chart.
   */
  labels?: boolean;
  /**
   * By `seriesKeyId`, the percentage that series takes up within the marked account containing it
   * (`markedShares`). Absent — which is the case for almost the whole app — the label and the tooltip
   * come out exactly as they used to.
   */
  shares?: ReadonlyMap<string, MarkedShare>;
}

/** Charts whose axis is a set of accounts within one period. */
export interface EntryOptionContext {
  colorOf: (code: string) => string;
  unit?: ChartUnit;
}

/**
 * The single value formatter every label, tooltip and table twin goes through.
 *
 * Amounts carry TWO DECIMALS, exactly like the Datos table —the same
 * `formatCurrency({ cents: true })`—, because a chart's figure is checked against the accountant's
 * sheet: `$204,045` against `204.045,51` forces them to wonder whether what is missing is cents or an
 * incomplete upload, and that doubt costs more than the width the `.51` takes up.
 */
export function formatChartValue(value: number, unit: ChartUnit = "moneda"): string {
  switch (unit) {
    case "porcentaje":
      return formatPercent(value);
    case "indice":
      return formatNumber(Math.round(value * 10) / 10);
    default:
      return formatCurrency(value, { cents: true });
  }
}

/**
 * The same for the AXIS' ticks, which is the only place the amount goes WITHOUT cents.
 *
 * An axis is not a figure anybody checks: it is the scale against which a bar's height is estimated,
 * and six labels of «$204,045.51» eat the width the drawing has left to say something the tooltip and
 * the table already say exactly. It is the rule Ocupaciones already had written in `formatMetric`
 * («right for an axis, wrong for a figure someone compares against their own spreadsheet»), and the
 * reason Datos does not need this case: a table has no axis.
 */
export function formatAxisValue(value: number, unit: ChartUnit = "moneda"): string {
  return unit === "moneda" ? formatCurrency(value) : formatChartValue(value, unit);
}

/** Vertical bars — one series is an evolution, several are a grouped comparison. */
export function barOption(series: Series[], context: SeriesOptionContext): ChartOption {
  const sharedCount = sharedCountOf(series, context);
  const base = chrome(series.length);
  // Every bar carries its amount, written flat: the only cap left is the one on the SERIES —beyond
  // four, a figure per point stops being read and becomes texture— because the rows are what absorb
  // the density of the axis, however many periods it draws.
  const rows = (context.labels ?? true) && series.length > 0 && series.length <= MAX_DIRECT_LABELS;
  const fit = fitDirectLabel(series[0]?.points.length ?? 0);
  return {
    ...base,
    ...(rows
      ? {
          grid: {
            ...base.grid,
            top: labelHeadroom(series.length, fit, Number(base.grid?.top ?? 16)),
          },
        }
      : {}),
    xAxis: periodAxis(context),
    yAxis: valueAxis(context.unit),
    tooltip: axisTooltip("shadow", context.unit, context, tooltipCodes(seriesCodes(series))),
    series: series.map((entry, index) =>
      barSeries(entry, series.length, context, {
        sharedCount,
        ...(rows ? { row: { index, fit } } : {}),
      }),
    ),
  };
}

/** The stack's name. Just one: every series accumulates in the same column. */
const STACK_ID = "total";

/** The id of the total's line, which the option and its table twin have to name alike. */
function totalLineId(total: Series): string {
  return `${seriesKeyId(total.key)}|total`;
}

/** Stacked bars — what a total is made of, period by period. */
export function stackedOption(series: Series[], context: SeriesOptionContext): ChartOption {
  return {
    ...chrome(series.length),
    xAxis: periodAxis(context),
    yAxis: valueAxis(context.unit),
    tooltip: axisTooltip("shadow", context.unit, undefined, tooltipCodes(seriesCodes(series))),
    series: series.map((entry) => ({
      ...barSeries(entry, series.length, context, { stacked: true }),
      stack: STACK_ID,
    })),
  };
}

/**
 * The stack of an account with the LINE of its total above it — what it is made of, period by period.
 * A single axis and a single unit, like the combo: the line is a reading of the same entity, so it
 * takes a shade of ink and not a slot of the palette, which is identity.
 *
 * The line is neither decorative nor redundant with the stack's ceiling. A child with a negative
 * balance —`4.1.4 Rebajas y/o Descuentos` is one— stacks DOWNWARDS, so the net is at no edge; and
 * with the tail folded into «Otros» it is still the real total. It is also the only thing that prints
 * an AMOUNT per column: inside a segment nothing but a short figure fits.
 *
 * And for that very reason it stacks WITHOUT the 2 px seams that separate every contiguous fill in
 * this app: a column that already declares its total is one single figure broken down, not several
 * put in a row.
 *
 * That broken-down figure is also the reason each segment prints its PERCENTAGE within the total
 * (`distributionShares`, hung off the context like any other `shares`): the amount is said by the
 * line, once per column, and what the stack adds is what part of it each child is — reading it by
 * subtracting amounts by eye is exactly the work the card exists to spare. The tooltip repeats it
 * segment by segment and naming the base, which is where the whole phrase does fit.
 */
export function stackedTotalOption(
  series: Series[],
  total: Series,
  context: SeriesOptionContext,
): ChartOption {
  const totalId = totalLineId(total);
  return {
    ...chrome(series.length + 1),
    xAxis: periodAxis(context),
    yAxis: valueAxis(context.unit),
    tooltip: axisTooltip(
      "shadow",
      context.unit,
      context,
      tooltipCodes([...seriesCodes(series), [totalId, total.key.code]]),
    ),
    series: [
      ...series.map((entry) => ({
        ...barSeries(entry, series.length, context, {
          stacked: true,
          seamless: true,
          shares: stackShares(entry, context),
        }),
        stack: STACK_ID,
      })),
      {
        id: totalId,
        type: "line",
        name: total.label,
        data: total.points.map((point) => point.value),
        lineStyle: { color: CHART_INK.strong, width: CHART_MARK.lineWidth, type: "solid" },
        itemStyle: { color: CHART_INK.strong },
        symbol: "circle",
        symbolSize: CHART_MARK.symbolSize,
        smooth: false,
        // It is measured as ONE series and not as the ninth: it is the only one carrying a figure, so
        // what decides whether it fits is its own mark count, not that of the stack below.
        label: directLabel(labelsFit(1, total.points.length, context), context.unit, "top"),
        labelLayout: { hideOverlap: true },
        z: 3,
      },
    ],
  };
}

/**
 * The stack's table twin: the children and, closing, the total in ink and with weight. `emphasis` is
 * what separates a total from what it totals when both are rows of the same table.
 */
export function stackedTotalTable(
  series: Series[],
  total: Series,
  context: SeriesOptionContext,
): ChartTable {
  const table = seriesTable(series, context);
  return {
    columns: table.columns,
    rows: [
      ...table.rows,
      {
        id: totalLineId(total),
        label: total.label,
        color: CHART_INK.strong,
        emphasis: true,
        ...sublabelFor(total.key.code),
        values: total.points.map((point) =>
          point.value === null ? null : formatChartValue(point.value, context.unit),
        ),
      },
    ],
  };
}

/**
 * 100% stacked bars. The percentages come from `toPctOfContainer` — each account against the
 * parent the engine rolled up — and NOT from re-adding the visible series. Picking 3 of a
 * parent's 8 children therefore draws three shares that correctly fall short of 100.
 */
export function hundredPercentOption(series: Series[], context: SeriesOptionContext): ChartOption {
  // No `sharedCount` and no context in the tooltip on purpose: here the values ALREADY are the
  // percentage over the container, and annotating a second percentage of the same container on top
  // would be writing «28.4 % · 100 % de Ingresos» over every bar.
  const shares = hundredPercentSeries(series);
  return {
    ...chrome(shares.length),
    xAxis: periodAxis(context),
    yAxis: { ...valueAxis("porcentaje"), max: 100 },
    tooltip: axisTooltip("shadow", "porcentaje", undefined, tooltipCodes(seriesCodes(shares))),
    series: shares.map((entry) => ({
      ...barSeries(entry, shares.length, { ...context, unit: "porcentaje" }, { stacked: true }),
      stack: STACK_ID,
    })),
  };
}

/**
 * A series of a chart whose X axis is the CATEGORIES and not the periods: one value per category, in
 * the axis' order. It is the shape needed by a reading where what is compared within each bar are the
 * months or the centers, and not the other way round.
 */
export interface CategorySeries {
  id: string;
  label: string;
  values: (number | null)[];
}

export interface CategoryOptionContext {
  colorOf: (id: string) => string;
  unit?: ChartUnit;
}

/**
 * Grouped bars with the CATEGORIES on the X axis — the rotated axis.
 *
 * It exists because a reading of six business lines over twelve months crushes the five that are not
 * hospedaje against the axis: they share a group with a bar a hundred times larger and they have
 * neither a label of their own nor room for their figure. Rotating the axis, each category has its gap
 * and its name even if its bar measures two pixels, and what is compared within it —the months, the
 * centers— is whatever the user has marked. No scale fixes the difference in size; what fixes it is
 * the small one no longer competing for the large one's space.
 *
 * With one or two series per category the amount goes ABOVE each bar (the same mark budget as the
 * rest of the app), which is what makes a short bar legible: the number is read. With more, the
 * tooltip and the table twin say it.
 */
export function categoryBarOption(
  categories: string[],
  series: CategorySeries[],
  context: CategoryOptionContext,
  groups: readonly { label: string; span: number }[] = [],
): ChartOption {
  const labels = fitsDirectLabels(series.length, categories.length);
  const chromeOf = chrome(series.length);
  return {
    ...chromeOf,
    ...(groups.length > 0
      ? {
          grid: {
            ...chromeOf.grid,
            bottom: Number(chromeOf.grid?.bottom ?? 8) + GROUP_BAND_HEIGHT,
          },
        }
      : {}),
    xAxis:
      groups.length > 0
        ? [categoryAxis(categories), groupBandAxis(categories.length, groups)]
        : categoryAxis(categories),
    yAxis: valueAxis(context.unit),
    tooltip: axisTooltip("shadow", context.unit),
    series: series.map((entry, index) => ({
      id: entry.id,
      type: "bar" as const,
      name: entry.label,
      data: [...entry.values],
      // The band goes on the FIRST series and only once: it is background of the chart, not of a
      // series, and repeating it on each one would darken it as many times as there are series.
      ...(index === 0 && groups.length > 1 ? { markArea: groupBands(groups) } : {}),
      itemStyle: {
        color: context.colorOf(entry.id),
        borderRadius: [CHART_MARK.radius, CHART_MARK.radius, 0, 0] as [
          number,
          number,
          number,
          number,
        ],
        ...(series.length > 1 ? { borderColor: CHART_SURFACE, borderWidth: CHART_MARK.gap } : {}),
      },
      label: directLabel(labels, context.unit),
      labelLayout: { hideOverlap: true },
    })),
  };
}

/**
 * How far the real axis drops to make room for the group line, and how far the latter separates from
 * it.
 */
const GROUP_BAND_HEIGHT = 18;

/**
 * The line that names the GROUP under its columns: a second category axis, with no line, no ticks and
 * no series tied to it — it is not a scale, it is a label spanning several columns.
 *
 * The name is written in the CENTRE of its span and the rest of its positions go blank, which is what
 * makes it look like a heading and not a per-column label. With an even span there is no exact centre
 * and it falls on the left column of the middle: shifting it half a column width would require
 * measuring the chart, and this is decided without rendering anything.
 */
function groupBandAxis(
  columns: number,
  groups: readonly { label: string; span: number }[],
): ChartAxis {
  const data = Array.from({ length: columns }, () => "");
  let start = 0;
  for (const group of groups) {
    data[start + Math.floor((group.span - 1) / 2)] = group.label;
    start += group.span;
  }
  return {
    type: "category",
    data,
    position: "bottom",
    offset: GROUP_BAND_HEIGHT,
    axisLine: { show: false },
    axisTick: { show: false },
    splitLine: { show: false },
    axisLabel: {
      show: true,
      interval: 0,
      color: CHART_INK.strong,
      fontSize: 11.5,
      fontWeight: 600,
      hideOverlap: false,
    },
  };
}

/**
 * From where to where each group reaches, said with a background band on the ODD ones — the reading
 * of a table with alternating rows, which is the one anybody already knows how to read.
 *
 * They alternate instead of all being painted because what makes the cut visible is the CHANGE, and a
 * dividing line per group would add verticals to a grid that already has horizontals. The ends are
 * column indices and not labels: the same establishment appears in several groups, so a range by name
 * would hook the first appearance and not this span's.
 */
function groupBands(groups: readonly { label: string; span: number }[]): ChartMarkArea {
  const data: [ChartMarkPoint, ChartMarkPoint][] = [];
  let start = 0;
  groups.forEach((group, index) => {
    if (index % 2 === 1) {
      data.push([{ xAxis: start }, { xAxis: start + group.span - 1 }]);
    }
    start += group.span;
  });
  return { silent: true, itemStyle: { color: CHART_BAND }, data };
}

/** The group each column belongs to, expanded from the spans. */
function groupLabels(
  columns: number,
  groups: readonly { label: string; span: number }[],
): (string | undefined)[] {
  const out: (string | undefined)[] = Array.from({ length: columns }, () => undefined);
  let start = 0;
  for (const group of groups) {
    for (let i = 0; i < group.span; i += 1) {
      out[start + i] = group.label;
    }
    start += group.span;
  }
  return out;
}

/**
 * The rotated axis' table twin: one row per category and one column per thing compared, which is the
 * exact shape of the accountant's sheet —category × establishment— and the only reading where a small
 * figure reads just as well as a large one.
 */
export function categoryTable(
  categories: string[],
  series: CategorySeries[],
  context: CategoryOptionContext,
  groups: readonly { label: string; span: number }[] = [],
): ChartTable {
  const groupOf = groupLabels(categories.length, groups);
  return {
    columns: series.map((entry) => entry.label),
    rows: categories.map((label, index) => ({
      id: `${groupOf[index] ?? ""}|${label}`,
      label,
      // The group goes as a SUBLABEL and not stuck to the name: in the table there is room for both,
      // and that way the row reads just like its column in the chart.
      ...(groupOf[index] === undefined ? {} : { sublabel: groupOf[index] }),
      values: series.map((entry) => {
        const value = entry.values[index];
        return value === null || value === undefined ? null : formatChartValue(value, context.unit);
      }),
    })),
  };
}

/**
 * The shares a 100% stack draws. Exported so the card's table twin reads the SAME numbers as
 * the chart — the table has to show the transformed values, not the amounts behind them.
 */
export function hundredPercentSeries(series: Series[]): Series[] {
  return series.map(toPctOfContainer);
}

/** Lines — trends and, above all, índice base 100, where the shapes are what compare. */
export function lineOption(series: Series[], context: SeriesOptionContext): ChartOption {
  const sharedCount = sharedCountOf(series, context);
  return {
    ...chrome(series.length),
    xAxis: periodAxis(context),
    yAxis: valueAxis(context.unit),
    tooltip: axisTooltip("cross", context.unit, context, tooltipCodes(seriesCodes(series))),
    series: series.map((entry) => lineSeries(entry, series.length, context, sharedCount)),
  };
}

/**
 * Bars with a line on top, sharing ONE axis and one unit: the amount with its moving average,
 * or with the same period a year earlier. The overlay takes an ink tone rather than a palette
 * slot, because it is a reading of the same entity and not a second one.
 */
export function comboOption(
  bars: Series,
  overlay: Series,
  overlayLabel: string,
  context: SeriesOptionContext,
): ChartOption {
  return {
    ...chrome(MIN_LEGEND_SERIES),
    xAxis: periodAxis(context),
    yAxis: valueAxis(context.unit),
    tooltip: axisTooltip("cross", context.unit, undefined, tooltipCodes(seriesCodes([bars]))),
    series: [
      barSeries(bars, 1, context),
      {
        id: `${seriesKeyId(overlay.key)}|overlay`,
        type: "line",
        name: overlayLabel,
        data: overlay.points.map((point) => point.value),
        lineStyle: { color: CHART_INK.strong, width: CHART_MARK.lineWidth, type: "solid" },
        itemStyle: { color: CHART_INK.strong },
        symbol: "circle",
        symbolSize: CHART_MARK.symbolSize,
        smooth: false,
        label: { show: false },
        z: 3,
      },
    ],
  };
}

/**
 * Horizontal bars ordered largest first — the ranking of a period, and the shape
 * `toPctOfRevenue` gets so the account names have room to be read.
 */
export function horizontalBarOption(
  entries: AmountEntry[],
  context: EntryOptionContext & { labelWidth?: number },
): ChartOption {
  const ranked = [...entries].sort((a, b) => b.value - a.value);
  const unit = context.unit;
  // The label channel is fixed for the usual reason —measuring the real text would require a canvas—,
  // but it is not the SAME everywhere: the ranking lives at full width and the breakdown in a window
  // that can be made wider, so whoever draws declares how much room it has.
  const labelWidth = context.labelWidth ?? ROW_LABEL_WIDTH;

  return {
    ...chrome(1),
    grid: { ...CATEGORY_ROW_GRID, left: labelWidth + 14 },
    xAxis: valueAxis(unit),
    yAxis: {
      ...categoryAxis(ranked.map((entry) => entry.label)),
      // Category axes run bottom-up; inverting puts the largest bar on the first row.
      inverse: true,
      axisLabel: { ...ROW_AXIS_LABEL, width: labelWidth },
    },
    tooltip: axisTooltip("shadow", unit, undefined, categoryCodes(ranked)),
    series: [
      {
        id: "ranking",
        type: "bar",
        name: "Monto",
        data: ranked.map((entry) => ({
          value: entry.value,
          itemStyle: {
            color: context.colorOf(entry.code),
            borderRadius: [0, CHART_MARK.radius, CHART_MARK.radius, 0],
          },
        })),
        barMaxWidth: CHART_MARK.barMaxWidth,
        emphasis: { focus: "series" },
        label: directLabel(true, unit, "right"),
        labelLayout: { hideOverlap: true },
      },
    ],
  };
}

/**
 * VERTICAL bars, one per entry, with the figure above — the mirror of `horizontalBarOption`.
 *
 * It exists because it is the shape the firm draws its expense annex in by hand, and that shape is
 * not a whim of theirs: with the categories along the bottom the eye scans the row of figures in one
 * sweep, which is what one does when checking against the sheet. The price is the label — «EMPLEADOS
 * M.O.I. / ADMISIONES / CAJA / INFORMACION» does not fit under a column—, and it is paid by SPLITTING
 * it into several lines (`overflow: "break"`) instead of rotating it: a diagonal label axis forces
 * tilting one's head to read seventeen names, and their own Excel splits them the same way.
 *
 * `interval: 0` is what forces drawing them ALL. Without it, ECharts thins the axis when they do not
 * fit and skips every other one: there would be seventeen bars with nine names, and the eight
 * unlabelled ones could not be identified by anything — which is worse than a cramped label.
 */
export function verticalBarOption(
  entries: AmountEntry[],
  context: EntryOptionContext & { labelWidth?: number },
): ChartOption {
  const ranked = [...entries].sort((a, b) => b.value - a.value);
  const unit = context.unit;

  return {
    ...chrome(1),
    grid: COLUMN_GRID,
    xAxis: {
      ...categoryAxis(ranked.map((entry) => entry.label)),
      axisLabel: {
        color: CHART_INK.muted,
        fontSize: 10,
        width: context.labelWidth ?? COLUMN_LABEL_WIDTH,
        overflow: "break",
        // All of them, without thinning: a bar with no name cannot be identified by anything else.
        interval: 0,
        hideOverlap: false,
      },
    },
    yAxis: valueAxis(unit),
    // With the account CODE in the header: the axis only fits the label, and truncated at that, so
    // the tooltip is where the accountant identifies the row of their plan. It is read off `ranked`
    // and not `entries` because the drawn order is the ordered one, and `byCategory` goes by index.
    tooltip: axisTooltip("shadow", unit, undefined, categoryCodes(ranked)),
    series: [
      {
        id: "distribucion",
        type: "bar",
        name: "Monto",
        data: ranked.map((entry) => ({
          value: entry.value,
          itemStyle: {
            color: context.colorOf(entry.code),
            borderRadius: [CHART_MARK.radius, CHART_MARK.radius, 0, 0],
          },
        })),
        barMaxWidth: CHART_MARK.barMaxWidth,
        emphasis: { focus: "series" },
        // The figure above its bar, as in the accountant's sheet: it is what is checked, and the
        // smallest column of a real annex measures two pixels and without its number says nothing.
        label: directLabel(true, unit, "top"),
        labelLayout: { hideOverlap: true },
      },
    ],
  };
}

/**
 * One account against the TOTALS that contain it, as PART OF A WHOLE: one row per total, the bar
 * filled up to what that account weighs and the rest in a recessive fill up to 100 %.
 *
 * It is the shape that answers «what part does it take up», and the choice is in the REST: without it
 * a bar at 27.4 % over a self-scaling axis reads as just any figure, and one has to go and look at the
 * axis to know what it is against. With the rest drawn, the whole is in sight and the reading is
 * immediate — the axis stops being needed and that is why it goes fixed at 100.
 *
 * Each bar carries its AMOUNT and below it its percentage, with the same two-line `rich` the nested
 * accounts use: the amount is the figure checked against the sheet and the percentage the reading the
 * row adds. They go JUST TO THE RIGHT of the fill and not inside it, and that was tried the other way
 * round first: inside, `$307,005.37` does not fit in a 27 % bar and comes out clipped, and the
 * threshold deciding when it fits would depend on the text's width, which cannot be measured without a
 * canvas. To the right they fall over the recessive fill, which is light, so they are read in normal
 * ink and there is no case to resolve.
 *
 * The rest is NOT labelled: its percentage is the complement of the one already written, and saying
 * «72.6 %» next to «27.4 %» is the same figure twice competing with the one that matters.
 */
export interface ShareOfTotalRow {
  id: string;
  /** What it is measured against: «Del total de costos y gastos». */
  label: string;
  value: number;
  /** The whole. `null` leaves the row out: there is nothing to measure against, which is not the same
   *  as 0 %. */
  total: number | null;
}

export function shareOfTotalOption(
  rows: readonly ShareOfTotalRow[],
  context: { colorOf: (id: string) => string },
): ChartOption {
  const drawn = rows.filter((row): row is ShareOfTotalRow & { total: number } => {
    return row.total !== null && row.total !== 0;
  });
  const shares = drawn.map((row) => (row.value / row.total) * 100);

  return {
    animationDuration: 320,
    textStyle: { fontFamily: CHART_FONT },
    grid: SHARE_ROW_GRID,
    xAxis: {
      ...valueAxis("porcentaje"),
      // Fixed at 100: the axis of a part-of-a-whole does not self-scale, or the same fill would say
      // different things in two rows and comparing them would stop being possible.
      min: 0,
      max: 100,
      axisLabel: { show: false },
      splitLine: { show: false },
    },
    yAxis: {
      ...categoryAxis(drawn.map((row) => row.label)),
      inverse: true,
      axisLine: { show: false },
      axisLabel: { color: CHART_INK.muted, fontSize: 11.5, width: SHARE_LABEL_WIDTH },
    },
    tooltip: axisTooltip("shadow", "porcentaje"),
    series: [
      {
        id: "parte",
        type: "bar",
        name: "Esta cuenta",
        stack: "todo",
        data: drawn.map((row, index) => ({
          value: shares[index],
          itemStyle: {
            color: context.colorOf(row.id),
            borderRadius: [CHART_MARK.radius, 0, 0, CHART_MARK.radius],
          },
        })),
        barMaxWidth: 30,
        label: {
          show: true,
          position: "right",
          color: CHART_INK.strong,
          fontSize: 11,
          formatter: (param) => {
            const row = drawn[param.dataIndex];
            const share = shares[param.dataIndex];
            return `{monto|${formatChartValue(row.value)}}\n{${SHARE_RICH_KEY}|${formatPercent(share)}}`;
          },
          rich: {
            monto: { color: CHART_INK.strong, fontSize: 11, lineHeight: 14 },
            // Fainter than the amount, the same hierarchy as in the nested accounts: the percentage is
            // the annotation over the bar, not the bar's figure.
            [SHARE_RICH_KEY]: { color: CHART_INK.muted, fontSize: 10, lineHeight: 12 },
          },
        },
        labelLayout: { hideOverlap: true },
      },
      {
        id: "resto",
        type: "bar",
        name: "Resto",
        stack: "todo",
        // Recessive and SILENT: it exists so the whole can be seen, not to be read — highlighting it
        // on hover would invite comparing it with the part, and it is not an entity.
        silent: true,
        data: drawn.map((_, index) => ({
          value: 100 - shares[index],
          itemStyle: {
            color: CHART_BAND,
            borderRadius: [0, CHART_MARK.radius, CHART_MARK.radius, 0],
          },
        })),
        barMaxWidth: 30,
        label: { show: false },
      },
    ],
  };
}

/** The table twin: the amount, its part and the whole it is measured against. */
/**
 * The table twin of an account's BREAKDOWN: code, amount and what part of the parent it is.
 *
 * It does not cut —it receives `all` and not `rows`—, which is what keeps the drawing's cut from
 * hiding a figure: the same division of labour as the annex, where the bars reduce and the table is
 * the whole list. And it carries no colour dot, because there every bar goes in the same hue and a dot
 * per row would promise a distinction that does not exist.
 */
export function breakdownTable(rows: readonly BreakdownRow[], base: string): ChartTable {
  return {
    // The header NAMES the denominator instead of saying «% de la cuenta»: a percentage that does not
    // say what it is measured against forces deducing it from the window's title, and that is exactly
    // the kind of computation nobody does and everybody assumes. It is the rule the annex already
    // applies in its two columns («% del gasto», «% del ingreso»).
    columns: ["Valor", `% de ${base}`],
    rows: rows.map((row) => ({
      id: row.code,
      label: row.label,
      sublabel: row.code,
      values: [
        formatCurrency(row.value, { cents: true }),
        row.share === null ? null : formatChartValue(row.share, "porcentaje"),
      ],
    })),
  };
}

export function shareOfTotalTable(
  rows: readonly ShareOfTotalRow[],
  context: { colorOf: (id: string) => string },
): ChartTable {
  return {
    columns: ["Monto", "% del total", "Total"],
    rows: rows
      .filter((row): row is ShareOfTotalRow & { total: number } => row.total !== null)
      .map((row) => ({
        id: row.id,
        label: row.label,
        color: context.colorOf(row.id),
        values: [
          formatChartValue(row.value),
          row.total === 0 ? null : formatPercent((row.value / row.total) * 100),
          formatChartValue(row.total),
        ],
      })),
  };
}

/** Up and down as glyphs, so the sign of a variation is never carried by color alone. */
const SIGN_MARK = { up: "▲", down: "▼" } as const;

/** The sign tokens as an entry color resolver, so a table twin matches its signed bars. */
export function signColorOf(entries: readonly AmountEntry[]): (code: string) => string {
  const byCode = new Map(entries.map((entry) => [entry.code, entry.value]));
  return (code) => ((byCode.get(code) ?? 0) < 0 ? CHART_SIGN.negative : CHART_SIGN.positive);
}

/**
 * Signed horizontal bars. `--color-positive` and `--color-negative` are the ONE place those
 * tokens appear as a fill, and they never travel alone: each bar carries an arrow and its
 * signed amount, because a reader who cannot separate the two hues still has to be able to
 * tell a rise from a fall.
 */
export function variationBarOption(
  entries: AmountEntry[],
  context: { unit?: ChartUnit } = {},
): ChartOption {
  const ranked = [...entries].sort((a, b) => b.value - a.value);

  return {
    ...chrome(1),
    grid: CATEGORY_ROW_GRID,
    xAxis: valueAxis(context.unit),
    yAxis: {
      ...categoryAxis(ranked.map((entry) => entry.label)),
      inverse: true,
      axisLabel: ROW_AXIS_LABEL,
    },
    tooltip: axisTooltip("shadow", context.unit, undefined, categoryCodes(ranked)),
    series: [
      {
        id: "variacion",
        type: "bar",
        name: "Variación",
        data: ranked.map((entry) => ({
          value: entry.value,
          itemStyle: {
            color: entry.value < 0 ? CHART_SIGN.negative : CHART_SIGN.positive,
            borderRadius: CHART_MARK.radius,
          },
        })),
        barMaxWidth: CHART_MARK.barMaxWidth,
        emphasis: { focus: "series" },
        label: {
          show: true,
          position: "right",
          color: CHART_INK.strong,
          fontSize: 10.5,
          distance: 6,
          formatter: (param) =>
            param.value === null
              ? ""
              : `${param.value < 0 ? SIGN_MARK.down : SIGN_MARK.up} ${formatChartValue(param.value, context.unit)}`,
        },
        labelLayout: { hideOverlap: true },
      },
    ],
  };
}

/**
 * The PIE, fed by `toPieSlices` — which is what folds the tail into «Otros» and sets aside the
 * non-positive entries. `4.1.4 Rebaja y/o Descuentos sobre Ventas` is negative and would draw a
 * negative angle; it comes back in `excluded` so the card can name it in its footnote.
 *
 * With no hole, and that is a decision: a ring's hole exists to put the TOTAL in the middle, which is
 * the only thing a pie cannot say, and no card puts it there —the annex's total lives in its footnote
 * and in the table twin's closing row—. An empty ring spends the circle's centre on nothing and, by
 * narrowing each slice to a band, states the breakdown worse than the pie the firm draws in its own
 * annex.
 */
export function pieOption(result: PieResult, context: EntryOptionContext): ChartOption {
  return {
    animationDuration: 320,
    textStyle: { fontFamily: CHART_FONT },
    tooltip: {
      trigger: "item",
      ...TOOLTIP_CHROME,
      formatter: (params) => {
        const param = (Array.isArray(params) ? params[0] : params) as ChartParam | undefined;
        if (!param || param.value === null) {
          return "";
        }
        const share = param.percent === undefined ? "" : ` · ${formatPercent(param.percent)}`;
        // The slice is the account, so the code goes in its name — and «Otros», which is the tail's
        // fold and not an account, is left without one by `accountCodeOf`.
        const name = withCode(
          param.name,
          accountCodeOf(result.slices[param.dataIndex]?.code ?? ""),
        );
        return `${name}<br/>${param.marker ?? ""} ${formatChartValue(param.value, context.unit)}${share}`;
      },
    },
    legend: legendFor(result.slices.length),
    series: [
      {
        id: "composicion",
        type: "pie",
        radius: ["0%", "74%"],
        center: ["50%", "44%"],
        data: result.slices.map((slice) => ({
          id: slice.code,
          name: slice.label,
          value: slice.value,
          itemStyle: {
            color: context.colorOf(slice.code),
            borderColor: CHART_SURFACE,
            borderWidth: CHART_MARK.gap,
          },
        })),
        label: {
          show: true,
          position: "outside",
          color: CHART_INK.muted,
          fontSize: 11,
          formatter: (param) =>
            param.percent === undefined
              ? param.name
              : `${param.name} · ${formatPercent(param.percent)}`,
        },
        labelLayout: { hideOverlap: true },
        emphasis: { focus: "series" },
      },
    ],
  };
}

/**
 * Concentration of spend. The textbook Pareto is a double axis — bars of amount plus a line of
 * cumulative percentage — which is exactly what this change rules out. Here the cumulative
 * rides each bar as a direct label and the 80% cut is a reference line between two categories,
 * so it reads the same and invents no second scale.
 */
export function paretoOption(result: ParetoResult, context: EntryOptionContext): ChartOption {
  const cut = result.entries.findIndex((entry) => entry.cumulativePct >= 80);

  return {
    ...chrome(1),
    grid: CATEGORY_ROW_GRID,
    xAxis: valueAxis(context.unit),
    yAxis: {
      ...categoryAxis(result.entries.map((entry) => entry.label)),
      inverse: true,
      axisLabel: ROW_AXIS_LABEL,
    },
    tooltip: axisTooltip("shadow", context.unit, undefined, categoryCodes(result.entries)),
    series: [
      {
        id: "pareto",
        type: "bar",
        name: "Gasto",
        data: result.entries.map((entry) => ({
          value: entry.value,
          itemStyle: {
            color: context.colorOf(entry.code),
            borderRadius: [0, CHART_MARK.radius, CHART_MARK.radius, 0],
          },
        })),
        barMaxWidth: CHART_MARK.barMaxWidth,
        emphasis: { focus: "series" },
        label: {
          show: true,
          position: "right",
          color: CHART_INK.muted,
          fontSize: 11,
          distance: 6,
          formatter: (param) => {
            const entry = result.entries[param.dataIndex];
            return entry
              ? `${formatCurrency(entry.value)} · ${formatPercent(entry.cumulativePct)}`
              : "";
          },
        },
        labelLayout: { hideOverlap: true },
        ...(cut >= 0 && cut < result.entries.length - 1
          ? {
              markLine: {
                silent: true,
                symbol: "none",
                // Half a slot below the last bar inside the 80%: the line sits between rows.
                data: [{ yAxis: cut + 0.5, name: "80 %" }],
                label: {
                  show: true,
                  position: "insideEndTop",
                  formatter: "80 % del gasto",
                  color: CHART_INK.faint,
                  fontSize: 10.5,
                },
                lineStyle: { color: CHART_INK.faint, width: 1, type: "dashed" },
              },
            }
          : {}),
      },
    ],
  };
}

/* -------------------------------------------------------------------- cascada */

/** The four stacked series: two transparent bases and the two visible halves of a step. */
const WATERFALL_SERIES = {
  basePositive: "cascada-base-positivo",
  positive: "cascada-positivo",
  baseNegative: "cascada-base-negativo",
  negative: "cascada-negativo",
} as const;

const WATERFALL_STACK = "cascada";

/** The plot the layout below assumes: the narrowest card that draws a cascade (A4). */
const WATERFALL_PLOT = 780;

/** What fits per category, never more than an account name needs. */
function waterfallLabelWidth(steps: number): number {
  return Math.max(48, Math.min(84, Math.floor(WATERFALL_PLOT / Math.max(steps, 1))));
}

/** Headroom before the axis is rounded, so the tallest bar does not touch the plot edge. */
const AXIS_PADDING = 1.02;

type WaterfallSide = "positivo" | "negativo";

/**
 * The cascade: bars and nothing but bars, all in one stack, with the stretch below each step
 * painted transparent. That is the whole recipe — `BarChart` is already registered and no new
 * chart type enters the bundle.
 *
 * **Why four series and not two.** A stack accumulates each sign on its own side, so a segment
 * that crosses zero — the expense that turns a profit into a loss — cannot be a single bar. It
 * is drawn as the part above the axis plus the part below, each one stacked on its own base.
 * For every other step one of the two halves is `null` and nothing is drawn.
 *
 * Colors mark a ROLE here (opening total, what left, how it closed), never an entity, which is
 * why slot 1 and the sign tokens are read directly instead of through `colorForEntity`: a
 * cascade consumes no categorical slot and cannot collide with the color of a series.
 */
export function waterfallOption(steps: WaterfallStep[]): ChartOption {
  const pieces = steps.map(piecesOf);
  const { min, max } = waterfallExtent(steps);

  const base = (side: WaterfallSide): ChartSeries => ({
    id: side === "positivo" ? WATERFALL_SERIES.basePositive : WATERFALL_SERIES.baseNegative,
    type: "bar",
    stack: WATERFALL_STACK,
    data: pieces.map((piece) => (side === "positivo" ? piece.basePositive : piece.baseNegative)),
    itemStyle: { color: "transparent" },
    barMaxWidth: CHART_MARK.barMaxWidth,
    // Not in the legend, not in the tooltip, not labelled: it is the hole a step floats over.
    label: { show: false },
    silent: true,
  });

  const fill = (side: WaterfallSide): ChartSeries => ({
    id: side === "positivo" ? WATERFALL_SERIES.positive : WATERFALL_SERIES.negative,
    type: "bar",
    stack: WATERFALL_STACK,
    data: pieces.map((piece, index) => ({
      value: side === "positivo" ? piece.positive : piece.negative,
      itemStyle: { color: waterfallColor(steps[index]) },
    })),
    barMaxWidth: CHART_MARK.barMaxWidth,
    label: {
      show: true,
      // ABOVE the bar, not inside. The design asked for it inside, and inside it was clipped: a bar's
      // width is capped by `barMaxWidth`, so «$206,570» does not fit however many steps are removed,
      // and it came out printed as «$206,57». A half figure is worse than one out of place, and above
      // `hideOverlap` can also drop the one that does not fit.
      position: "top",
      color: CHART_INK.strong,
      fontSize: 10.5,
      // The bar's height is the SIZE of the step; what the label says is the step's own signed
      // amount, so an expense of 56.000 reads as −$56.000 however tall its bar is.
      formatter: (param) => {
        const step = steps[param.dataIndex];
        const piece = pieces[param.dataIndex];
        return step && piece?.carrier === side ? formatCurrency(step.value) : "";
      },
    },
    labelLayout: { hideOverlap: true },
  });

  return {
    ...chrome(1),
    xAxis: {
      ...categoryAxis(steps.map((step) => step.label)),
      // Account names are long and every step must be named: they wrap instead of being
      // dropped by `hideOverlap`, and `outerBoundsContain` shrinks the plot to fit them.
      //
      // The width COMES FROM THE NUMBER OF STEPS. It was fixed at 84 px, which is what a ten-step
      // cascade in a wide card gives; with twelve on an A4 page each category has less than that and
      // the names ride over each other («IngresosOtros GastosComisiones…»).
      axisLabel: {
        color: CHART_INK.muted,
        fontSize: 10.5,
        interval: 0,
        width: waterfallLabelWidth(steps.length),
        overflow: "break",
        hideOverlap: false,
      },
    },
    yAxis: { ...valueAxis("moneda"), min, max },
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "shadow", lineStyle: { color: CHART_LINES.axis, width: 1 } },
      ...TOOLTIP_CHROME,
      // Read off the STEP and not off the params, which is how the transparent base — a series
      // like any other to the renderer — never gets a row of its own.
      formatter: (params) => {
        const first = Array.isArray(params) ? params[0] : params;
        const step = first ? steps[first.dataIndex] : undefined;
        if (!step) {
          return "";
        }
        return step.kind === "total"
          ? `${step.label}<br/>${formatCurrency(step.value)}`
          : `${step.label}<br/>${formatCurrency(step.value)} · acumulado ${formatCurrency(step.end)}`;
      },
    },
    series: [
      base("positivo"),
      base("negativo"),
      { ...fill("positivo"), markLine: connectors(steps) },
      fill("negativo"),
    ],
  };
}

/** The table twin: what each step took away, and where the statement stood after it. */
export function waterfallTable(steps: WaterfallStep[]): ChartTable {
  return {
    columns: ["Monto", "Acumulado"],
    rows: steps.map((step) => ({
      id: step.code,
      label: step.label,
      color: waterfallColor(step),
      values: [formatCurrency(step.value), formatCurrency(step.end)],
    })),
  };
}

/** The two halves of a step and the base each one floats on. */
interface WaterfallPieces {
  basePositive: number | null;
  positive: number | null;
  baseNegative: number | null;
  negative: number | null;
  /** Which half carries the direct label: the visible one, or the closing one when both are. */
  carrier: WaterfallSide;
}

function piecesOf(step: WaterfallStep): WaterfallPieces {
  const low = Math.min(step.start, step.end);
  const high = Math.max(step.start, step.end);
  const basePositive = Math.max(low, 0);
  const positive = Math.max(high, 0) - basePositive;
  const baseNegative = Math.min(high, 0);
  const negative = Math.min(low, 0) - baseNegative;

  return {
    basePositive: drawn(basePositive),
    positive: drawn(positive),
    baseNegative: drawn(baseNegative),
    negative: drawn(negative),
    carrier: negative !== 0 && (positive === 0 || step.value < 0) ? "negativo" : "positivo",
  };
}

/** A zero-height piece is `null`, so the renderer draws nothing rather than a hairline. */
function drawn(value: number): number | null {
  return value === 0 ? null : value;
}

/**
 * A total takes slot 1 of the palette — it is the brand's own bar and says "this is how much
 * there is" — except the closing one, which takes the sign of the result, because whether the
 * period ended up or down is the reading it exists for. A step takes the sign of its own
 * amount: expenses fall and are red, and a credited group that rises is not painted as a loss.
 */
function waterfallColor(step: WaterfallStep): string {
  if (step.kind === "total" && step.code !== RESULT_CODE) {
    const section = sectionOf(step.code);
    return section ? CHART_SECTION[section] : CHART_PALETTE[0];
  }
  return step.value < 0 ? CHART_SIGN.negative : CHART_SIGN.positive;
}

/** The thin line from the close of one step to the start of the next — what makes it a cascade. */
function connectors(steps: WaterfallStep[]): ChartSeries["markLine"] {
  return {
    silent: true,
    symbol: "none",
    label: { show: false },
    lineStyle: { color: CHART_INK.faint, width: 1, type: "solid" },
    data: steps
      .slice(0, -1)
      .map((step, index) => [{ coord: [index, step.end] }, { coord: [index + 1, step.end] }]),
  };
}

/**
 * The scale comes from every `start` and `end` there is, zero included — a period that closes
 * in a loss has to fit under the axis, and a scale derived from the visible bar heights alone
 * would cut it off.
 */
function waterfallExtent(steps: WaterfallStep[]): { min: number; max: number } {
  const bounds = steps.flatMap((step) => [step.start, step.end]);
  return {
    min: niceBound(Math.min(0, ...bounds) * AXIS_PADDING, "floor"),
    max: niceBound(Math.max(0, ...bounds) * AXIS_PADDING, "ceil"),
  };
}

/** Rounds out to a step of one order of magnitude below the value, so the ticks stay round. */
function niceBound(value: number, direction: "floor" | "ceil"): number {
  if (value === 0) {
    return 0;
  }
  const step = 10 ** (Math.floor(Math.log10(Math.abs(value))) - 1);
  return (direction === "ceil" ? Math.ceil(value / step) : Math.floor(value / step)) * step;
}

/* ------------------------------------------------------------- shape dispatchers */

/**
 * The chart type the user picked, resolved to its builder. Both tabs go through this so a new
 * shape is wired once; `sanitizeSelection` has already clamped the type to one the
 * transformation admits, so the fall-through is a default and not a silent substitution.
 */
export function seriesOptionFor(
  chartType: ChartType,
  series: Series[],
  context: SeriesOptionContext,
): ChartOption {
  switch (chartType) {
    case "barras-apiladas":
      return stackedOption(series, context);
    case "barras-100":
      return hundredPercentOption(series, context);
    case "linea":
      return lineOption(series, context);
    default:
      return barOption(series, context);
  }
}

/** The table twin of the same shape — 100% stacks must show shares, not the amounts. */
export function seriesTableFor(
  chartType: ChartType,
  series: Series[],
  context: SeriesOptionContext,
): ChartTable {
  return chartType === "barras-100"
    ? seriesTable(hundredPercentSeries(series), { ...context, unit: "porcentaje" })
    : seriesTable(series, context);
}

/* -------------------------------------------------------------------- table twin */

/**
 * The same series as rows and the same periods as columns. Three of the eight palette slots
 * fall below 3:1 against white — unavoidable in a categorical eight — so a readable numeric
 * twin is not a nicety. It is also the only place a transformed chart's numbers exist at all:
 * índice 100, variación and YTD are nowhere in the Datos tab.
 */
export function seriesTable(series: Series[], context: SeriesOptionContext): ChartTable {
  return {
    columns: context.periods.map((period) => periodLabel(period, { multiYear: context.multiYear })),
    rows: series.map((entry) => ({
      id: seriesKeyId(entry.key),
      label: entry.label,
      ...sublabelFor(entry.key.code),
      color: context.colorOf(entry.key),
      values: entry.points.map((point) =>
        point.value === null ? null : formatChartValue(point.value, context.unit),
      ),
    })),
  };
}

/** The twin of an entry-based card: one row per account, one column with its amount. */
export function entryTable(
  entries: AmountEntry[],
  context: EntryOptionContext,
  valueHeader = "Monto",
): ChartTable {
  return {
    columns: [valueHeader],
    rows: [...entries]
      .sort((a, b) => b.value - a.value)
      .map((entry) => ({
        id: entry.code,
        label: entry.label,
        ...sublabelFor(entry.code),
        color: context.colorOf(entry.code),
        values: [formatChartValue(entry.value, context.unit)],
      })),
  };
}

/* ------------------------------------------------------------------ shared pieces */

/**
 * Row charts reserve their left gutter EXPLICITLY instead of letting the layout shrink to fit.
 * `outerBoundsContain: "axisLabel"` does not account for a width-capped label, so an account
 * name long enough to be truncated ended up drawn past the left edge and clipped at the START
 * — "Mantenimiento Equipos" reading as "lantenimiento Equipos". A fixed gutter wider than the
 * label cap cannot do that.
 */
const ROW_LABEL_WIDTH = 150;
const CATEGORY_ROW_GRID = {
  left: ROW_LABEL_WIDTH + 14,
  right: 84,
  top: 8,
  bottom: 8,
  outerBoundsMode: "none",
} as const;

/**
 * The channel of the «part of a whole» row. Much narrower than the ranking's because its label is not
 * an account name but what it is measured against —two rows, short and familiar text—, and here every
 * pixel counts: this lives in the side panel, which is 440 px, and between the channel and the
 * figure's gap the bar can be robbed of all the width it has to say anything.
 */
const SHARE_LABEL_WIDTH = 106;
const SHARE_ROW_GRID = {
  left: SHARE_LABEL_WIDTH + 14,
  // The amount and its percentage are written to the right of the fill, so the bar cannot reach the
  // edge: without this gap, the fullest row would print its figure outside the card.
  right: 104,
  top: 10,
  bottom: 10,
  outerBoundsMode: "none",
} as const;

const ROW_AXIS_LABEL = {
  color: CHART_INK.muted,
  fontSize: 11.5,
  width: ROW_LABEL_WIDTH,
  overflow: "truncate",
} as const;

/**
 * The width given to each label under its column before splitting it into lines, and the gap the grid
 * reserves for it below. They are fixed for the same reason as `CATEGORY_ROW_GRID`'s channel:
 * measuring the real text would require a canvas, so a bound is reserved and it is split against it.
 */
const COLUMN_LABEL_WIDTH = 74;
const COLUMN_GRID = {
  left: 8,
  right: 16,
  top: 28,
  // Four label lines at 10 px, which is what the longest name of a real annex asks for.
  bottom: 62,
  outerBoundsMode: "same",
  outerBoundsContain: "axisLabel",
} as const;

const TOOLTIP_CHROME: Omit<ChartTooltip, "trigger" | "formatter"> = {
  backgroundColor: CHART_SURFACE,
  borderColor: CHART_LINES.axis,
  borderWidth: 1,
  padding: [8, 10],
  textStyle: { color: CHART_INK.strong, fontSize: 12 },
  // Inside the CARD, not inside the window — see `ChartTooltip.confine`. It goes here and not in each
  // tooltip because the clipping belongs to the card and every card is the same one.
  confine: true,
};

/** Everything a cartesian chart shares: font, animation, plot box and legend. */
function chrome(
  seriesCount: number,
): Pick<ChartOption, "animationDuration" | "textStyle" | "grid" | "legend"> {
  const legend = legendFor(seriesCount);
  return {
    animationDuration: 320,
    textStyle: { fontFamily: CHART_FONT },
    grid: {
      left: 8,
      right: 16,
      top: 16,
      bottom: legend.show ? 28 : 8,
      outerBoundsMode: "same",
      outerBoundsContain: "axisLabel",
    },
    legend,
  };
}

function legendFor(seriesCount: number): ChartLegend {
  return {
    show: seriesCount >= MIN_LEGEND_SERIES,
    type: "scroll",
    bottom: 0,
    icon: "roundRect",
    itemWidth: 10,
    itemHeight: 10,
    itemGap: 14,
    textStyle: { color: CHART_INK.muted, fontSize: 11.5 },
  };
}

function periodAxis(context: SeriesOptionContext): ChartAxis {
  return categoryAxis(
    context.periods.map((period) => periodLabel(period, { multiYear: context.multiYear })),
  );
}

function categoryAxis(labels: string[]): ChartAxis {
  return {
    type: "category",
    data: labels,
    axisLine: { show: true, lineStyle: { color: CHART_LINES.axis, width: 1, type: "solid" } },
    axisTick: { show: false },
    splitLine: { show: false },
    axisLabel: { color: CHART_INK.muted, fontSize: 11, hideOverlap: true },
  };
}

/** One recessive tone, continuous stroke: the grid must sit behind the marks, not compete. */
function valueAxis(unit: ChartUnit = "moneda"): ChartAxis {
  return {
    type: "value",
    axisLine: { show: false },
    axisTick: { show: false },
    splitLine: { show: true, lineStyle: { color: CHART_LINES.grid, width: 1, type: "solid" } },
    axisLabel: {
      color: CHART_INK.faint,
      fontSize: 11,
      formatter: (value) => formatAxisValue(Number(value), unit),
    },
  };
}

/**
 * The account code something of the plan is named with, or `undefined` when what is drawn is not an
 * account.
 *
 * It is one line because only one thing can be wrong: `OTHERS_CODE` is the tail's fold —the pie's and
 * the stack's—, and writing it would claim the accountant has an account called «otros». Everything
 * else that arrives here already comes from the tree (`SeriesKey.code`, `AmountEntry.code`), so there
 * is nothing to validate against the source.
 */
function accountCodeOf(code: string): string | undefined {
  return code === OTHERS_CODE || code.length === 0 ? undefined : code;
}

/**
 * The name preceded by its code, which is the chart of accounts' order and the Datos table's, where
 * the code column goes to the left of the name.
 */
function withCode(label: string, code: string | undefined): string {
  return code === undefined ? label : `${code} · ${label}`;
}

/**
 * Where the code falls inside a tooltip, which is not the same in the two card shapes.
 *
 * When the account IS the series —the evolution, the comparison, the stack— there is one row per
 * series and the code goes in its own. When the account is the axis' CATEGORY —the ranking, the
 * variation, the pareto—, the series is called «Monto» and the account's name is the tooltip's first
 * line, so that is where it has to go. One same formatter and two places; no builder passes both,
 * because no chart is of both shapes at once.
 */
interface TooltipCodes {
  /** By `seriesId`. */
  bySeries?: ReadonlyMap<string, string>;
  /** By category index, in the order they are drawn. */
  byCategory?: readonly (string | undefined)[];
}

/**
 * The code as a `sublabel` of a table twin's row — absent when there is no account to name. It goes
 * under the name and not stuck to it because in the table there is room for both, the same rule
 * Sueldos por Áreas hangs the job title under the employee with.
 */
function sublabelFor(code: string): { sublabel?: string } {
  const account = accountCodeOf(code);
  return account === undefined ? {} : { sublabel: account };
}

/** The `(series id, code)` pairs of a batch, with the id each series carries when drawn. */
function seriesCodes(series: readonly Series[]): [string, string][] {
  return series.map((entry) => [seriesKeyId(entry.key), entry.key.code]);
}

/** The tooltip's map, without the series that name no account. */
function tooltipCodes(pairs: readonly (readonly [string, string])[]): TooltipCodes {
  const bySeries = new Map<string, string>();
  for (const [id, code] of pairs) {
    const code_ = accountCodeOf(code);
    if (code_ !== undefined) {
      bySeries.set(id, code_);
    }
  }
  return { bySeries };
}

/** The same for a category axis, where the datum's index IS the position on the axis. */
function categoryCodes(entries: readonly { code: string }[]): TooltipCodes {
  return { byCategory: entries.map((entry) => accountCodeOf(entry.code)) };
}

/**
 * A tooltip that omits the series with no coverage instead of reporting `$0` for them, and
 * renders nothing at all when a period has no covered series. `axis` trigger also makes the
 * whole column sensitive, which is how the hit area ends up larger than the mark.
 *
 * It is the only place the percentage comes out NAMING its base («28.4 % de Ingresos»): on the bar
 * that phrase does not fit in twelve columns, and here width is plentiful. It comes out whenever it
 * exists, including when the axis was too cramped to print it above the bar.
 *
 * And it is where the account's CODE comes out, which in the chart is nowhere else: on the axis it
 * would eat the label channel —150 px in the horizontal bar ones— and would truncate the names, so it
 * is paid for on hover, which is when one asks about a particular account to check it against the
 * plan.
 */
function axisTooltip(
  pointer: "shadow" | "cross",
  unit: ChartUnit = "moneda",
  context?: SeriesOptionContext,
  codes: TooltipCodes = {},
): ChartTooltip {
  return {
    trigger: "axis",
    axisPointer: { type: pointer, lineStyle: { color: CHART_LINES.axis, width: 1 } },
    ...TOOLTIP_CHROME,
    formatter: (params) => {
      const list = Array.isArray(params) ? params : [params];
      const covered = list.filter((param) => param.value !== null && param.value !== undefined);
      if (covered.length === 0) {
        return "";
      }
      const rows = covered.map((param) => {
        const share = param.seriesId ? context?.shares?.get(param.seriesId) : undefined;
        const value = share?.values[param.dataIndex];
        const suffix =
          share && value !== null && value !== undefined
            ? ` · ${formatPercent(value)} de ${share.baseLabel}`
            : "";
        const name = withCode(
          param.seriesName ?? "",
          param.seriesId === undefined ? undefined : codes.bySeries?.get(param.seriesId),
        );
        return `${param.marker ?? ""} ${name}: ${formatChartValue(param.value as number, unit)}${suffix}`;
      });
      // The first line is the PERIOD in the series ones and the ACCOUNT in the category ones: only the
      // second carries a code, and that is why `byCategory` is read here and not in the rows.
      const head = withCode(covered[0].name, codes.byCategory?.[covered[0].dataIndex]);
      return [head, ...rows].join("<br/>");
    },
  };
}

function barSeries(
  series: Series,
  seriesCount: number,
  context: SeriesOptionContext,
  options: {
    stacked?: boolean;
    seamless?: boolean;
    sharedCount?: number;
    /**
     * The percentages already decided by the caller, skipping `shareLabelFor`. Only the stack with a
     * total passes them, whose budget is each segment's height and not the axis' cast.
     */
    shares?: readonly (number | null)[];
    /**
     * The row of figures this series writes on, when the caller decided that every bar carries its
     * amount (`barOption`). Absent — a stack, a 100 % stack — the old density budget still rules.
     */
    row?: { index: number; fit: LabelFit };
  } = {},
): ChartSeries {
  const stacked = options.stacked ?? false;
  // Contiguous fills — stacked segments, grouped bars — are separated by 2px of the surface.
  //
  // `seamless` is the exception, and only a stack that already carries a TOTAL above it asks for it:
  // there the column is one single figure broken down, not several put in a row, and those seams
  // split it into loose pieces. What separates one segment from the next becomes the colour step,
  // which its ordered scale already guarantees.
  const separation =
    (stacked && !options.seamless) || (!stacked && seriesCount > 1)
      ? { borderColor: CHART_SURFACE, borderWidth: CHART_MARK.gap }
      : {};

  return {
    id: seriesKeyId(series.key),
    type: "bar",
    name: series.label,
    data: series.points.map((point) => point.value),
    itemStyle: {
      color: context.colorOf(series.key),
      borderRadius: stacked ? 0 : [CHART_MARK.radius, CHART_MARK.radius, 0, 0],
      ...separation,
    },
    barMaxWidth: CHART_MARK.barMaxWidth,
    emphasis: { focus: "series" },
    label: directLabel(
      options.row ? true : labelsFit(seriesCount, series.points.length, context),
      context.unit,
      stacked ? "inside" : "top",
      options.shares ?? shareLabelFor(series, context, options.sharedCount ?? 0),
      options.row
        ? {
            fontSize: options.row.fit.fontSize,
            distance: labelDistance(options.row.index, options.row.fit),
            cents: options.row.fit.cents,
          }
        : {},
    ),
    // The rows already keep one series' figures off the next one's; what `hideOverlap` still drops is
    // a collision INSIDE a row, which is two adjacent columns of an axis narrower than the fit
    // assumed. Dropping one there is better than printing the two as a single run of digits.
    labelLayout: { hideOverlap: true },
  };
}

function lineSeries(
  series: Series,
  seriesCount: number,
  context: SeriesOptionContext,
  sharedCount = 0,
): ChartSeries {
  const color = context.colorOf(series.key);
  return {
    id: seriesKeyId(series.key),
    type: "line",
    name: series.label,
    data: series.points.map((point) => point.value),
    lineStyle: { color, width: CHART_MARK.lineWidth, type: "solid" },
    itemStyle: { color },
    symbol: "circle",
    symbolSize: CHART_MARK.symbolSize,
    smooth: false,
    emphasis: { focus: "series" },
    label: directLabel(
      labelsFit(seriesCount, series.points.length, context),
      context.unit,
      "top",
      shareLabelFor(series, context, sharedCount),
    ),
    labelLayout: { hideOverlap: true },
  };
}

/**
 * The percentages this series will print under its amount, or `undefined` if it carries none —
 * because it falls inside no marked account, or because its cast does not fit on the axis.
 */
function shareLabelFor(
  series: Series,
  context: SeriesOptionContext,
  sharedCount: number,
): readonly (number | null)[] | undefined {
  const share = shareOf(series, context);
  return share && sharesFit(sharedCount, series.points.length, context) ? share.values : undefined;
}

/**
 * The direct label of a mark. `hideOverlap` in `labelLayout` is what drops one that does not
 * fit rather than drawing it clipped, and the empty string for a `null` keeps an uncovered
 * period from printing a value it does not have.
 *
 * `shares` adds a SECOND line with what the account takes up within the marked one containing it. The
 * two lines are independent: with a cramped axis the amount switches off and the percentage stays —it
 * is shorter and it is the reading that was asked for—, and a bar whose percentage cannot be computed
 * (a zero base, a period with no coverage) prints its amount and nothing below.
 */
function directLabel(
  show: boolean,
  unit: ChartUnit = "moneda",
  position: ChartLabel["position"] = "top",
  shares?: readonly (number | null)[],
  /**
   * What the fit decided, when the caller has one (`fitGroupedLabel`): the body, the row it is
   * written on and whether the cents still fit. Empty is the label as it has always been.
   */
  fit: { fontSize?: number; distance?: number; cents?: boolean } = {},
): ChartLabel {
  const inside = position === "inside";
  return {
    show: show || shares !== undefined,
    position,
    // Ink, never the series color — an inside label sits on a saturated fill, hence `onFill`.
    color: inside ? CHART_INK.onFill : CHART_INK.strong,
    fontSize: fit.fontSize ?? 10.5,
    ...(fit.distance === undefined ? {} : { distance: fit.distance }),
    ...(shares
      ? {
          rich: {
            // Fainter than the amount: the percentage is an annotation over the bar, not the bar's
            // figure. Over a saturated fill `onFill` wins, which is the only one that reads.
            [SHARE_RICH_KEY]: {
              color: inside ? CHART_INK.onFill : CHART_INK.muted,
              fontSize: 10,
              lineHeight: 13,
            },
          },
        }
      : {}),
    formatter: (param) => {
      const amount =
        show && param.value !== null && param.value !== undefined
          ? // Without cents it is the AXIS' rounding and not a second one: rounding an amount twice
            // in the app is how two figures that should be the same end up differing by a cent.
            (fit.cents === false ? formatAxisValue : formatChartValue)(param.value, unit)
          : "";
      const share = shares?.[param.dataIndex];
      if (share === null || share === undefined) {
        return amount;
      }
      const pct = `{${SHARE_RICH_KEY}|${formatPercent(share)}}`;
      return amount === "" ? pct : `${amount}\n${pct}`;
    },
  };
}
