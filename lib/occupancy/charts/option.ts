/**
 * `OccupancyBundle` in, an ECharts option out. Pure, so the rules that keep a chart honest are
 * testable without a DOM:
 *
 * - A `null` point stays `null`: no mark, and no line drawn across it.
 * - No builder returns two `yAxis` — the métrica is single precisely so one scale is enough.
 * - No builder writes a hex: colors come from `colorOf`, ink and strokes from `lib/charts`.
 */
import {
  CHART_FONT,
  CHART_INK,
  CHART_LINES,
  CHART_MARK,
  CHART_SURFACE,
  colorForEntity,
} from "@/lib/charts/palette";
import type {
  ChartAxis,
  ChartLegend,
  ChartOption,
  ChartParam,
  ChartTable,
  ChartTooltip,
} from "@/lib/charts/types";
import { formatCurrency, formatNumber, formatPercent } from "@/lib/format";
import type { ChannelEntry } from "../analytics/breakdown";
import {
  occupancySeriesId,
  type MetricUnit,
  type OccupancyBundle,
  type OccupancySeriesKey,
} from "../analytics/types";

/** Beyond this a legend is noise: one series is named by the card's own subtitle. */
const MIN_LEGEND_SERIES = 2;

/** Past this many columns a label per bar stops being read and becomes texture. */
const MAX_DIRECT_LABELS = 14;

/**
 * How few columns a COMPARISON needs before grouped bars beat lines. Narrowing to one day is
 * the case this exists for: a line of a single point draws nothing at all.
 */
const FEW_COLUMNS = 6;

export interface SeriesOptionContext {
  /** The only way a series gets a color; comes from `colorResolver`. */
  colorOf: (key: OccupancySeriesKey) => string;
}

/** Past this an amount no longer needs its cents, and they crowd an axis label. */
const CENTS_FIT_BELOW = 1000;

/**
 * The single value formatter every axis, label, tooltip and table cell goes through.
 *
 * A ratio arrives as a fraction (0.298) and `formatPercent` speaks in percentage points, so the
 * ×100 lives here. Money keeps its cents while it fits: an ADR of $82,89 rounded to $83 loses
 * exactly the precision the figure exists for, while a year's revenue does not need them.
 */
export function formatMetric(value: number | null, unit: MetricUnit): string | null {
  if (value === null || !Number.isFinite(value)) {
    return null;
  }
  switch (unit) {
    case "percent":
      return formatPercent(value * 100);
    case "currency":
      return formatCurrency(value, { cents: Math.abs(value) < CENTS_FIT_BELOW });
    default:
      return formatNumber(Math.round(value * 100) / 100);
  }
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

function categoryAxis(labels: string[]): ChartAxis {
  return {
    type: "category",
    data: labels,
    axisLine: { show: true, lineStyle: { color: CHART_LINES.axis, width: 1, type: "solid" } },
    axisTick: { show: false },
    splitLine: { show: false },
    // A year read day by day is 365 categories: ECharts thins them out rather than overprint.
    axisLabel: { color: CHART_INK.muted, fontSize: 11, hideOverlap: true },
  };
}

function valueAxis(unit: MetricUnit): ChartAxis {
  return {
    type: "value",
    axisLine: { show: false },
    axisTick: { show: false },
    splitLine: { show: true, lineStyle: { color: CHART_LINES.grid, width: 1, type: "solid" } },
    axisLabel: {
      color: CHART_INK.faint,
      fontSize: 11,
      formatter: (value) => formatMetric(Number(value), unit) ?? "",
    },
  };
}

const TOOLTIP_CHROME: Omit<ChartTooltip, "trigger" | "formatter"> = {
  backgroundColor: CHART_SURFACE,
  borderColor: CHART_LINES.axis,
  borderWidth: 1,
  padding: [8, 10],
  textStyle: { color: CHART_INK.strong, fontSize: 12 },
};

function axisTooltip(unit: MetricUnit, pointer: "shadow" | "line"): ChartTooltip {
  return {
    ...TOOLTIP_CHROME,
    trigger: "axis",
    axisPointer: { type: pointer, lineStyle: { color: CHART_LINES.axis, width: 1 } },
    formatter: (params) => {
      const rows = Array.isArray(params) ? params : [params];
      const head = rows[0]?.name ?? "";
      const body = rows
        .map((row) => {
          const value = formatMetric(row.value === null ? null : Number(row.value), unit);
          return `${row.marker ?? ""}${row.seriesName ?? ""} <b>${value ?? "—"}</b>`;
        })
        .join("<br>");
      return `${head}<br>${body}`;
    },
  };
}

/**
 * When the axis collapses to ONE column, the thing that varies stops being the date and becomes
 * the series: «el 5 de enero de 2025 contra el de 2026» is two entities, not two readings of one
 * date. Leaving «5 ene» on the axis would label both bars with the same date and hide the
 * comparison in the legend, so the entities take the axis and the date moves to the card's
 * subtitle.
 */
function entityOption(bundle: OccupancyBundle, context: SeriesOptionContext): ChartOption {
  const unit = bundle.metric.unit;
  return {
    ...chrome(1),
    xAxis: categoryAxis(bundle.series.map((entry) => entry.label)),
    yAxis: valueAxis(unit),
    tooltip: {
      ...TOOLTIP_CHROME,
      trigger: "item",
      formatter: (params) => {
        const row = Array.isArray(params) ? params[0] : params;
        const value = formatMetric(row.value === null ? null : Number(row.value), unit);
        return `${row.name}<br><b>${value ?? "—"}</b>`;
      },
    },
    series: [
      {
        id: "comparacion",
        name: bundle.metric.label,
        type: "bar",
        data: bundle.series.map((entry) => ({
          value: entry.values[0],
          itemStyle: {
            color: context.colorOf(entry.key),
            borderRadius: [CHART_MARK.radius, CHART_MARK.radius, 0, 0],
          },
        })),
        barMaxWidth: CHART_MARK.barMaxWidth,
        label: {
          show: true,
          position: "top",
          color: CHART_INK.muted,
          fontSize: 11,
          formatter: (param: ChartParam) =>
            formatMetric(param.value === null ? null : Number(param.value), unit) ?? "",
        },
      },
    ],
  };
}

/**
 * The main card. Bars when a single series is read month by month — that is the shape you click
 * to drill into — and lines whenever there is a comparison or a daily axis, where 365 bars per
 * series would be a solid block of ink.
 */
export function seriesOption(bundle: OccupancyBundle, context: SeriesOptionContext): ChartOption {
  if (bundle.axis.length === 1 && bundle.series.length > 1) {
    return entityOption(bundle, context);
  }
  const labels = bundle.axis.map((point) => point.label);
  const unit = bundle.metric.unit;
  const asBars =
    bundle.axis.length <= (bundle.series.length === 1 ? MAX_DIRECT_LABELS : FEW_COLUMNS);

  return {
    ...chrome(bundle.series.length),
    xAxis: categoryAxis(labels),
    yAxis: valueAxis(unit),
    tooltip: axisTooltip(unit, asBars ? "shadow" : "line"),
    series: bundle.series.map((entry) => {
      const color = context.colorOf(entry.key);
      return asBars
        ? {
            id: occupancySeriesId(entry.key),
            name: entry.label,
            type: "bar" as const,
            data: entry.values,
            itemStyle: { color, borderRadius: [CHART_MARK.radius, CHART_MARK.radius, 0, 0] },
            barMaxWidth: CHART_MARK.barMaxWidth,
            label: {
              show: true,
              position: "top" as const,
              color: CHART_INK.muted,
              fontSize: 11,
              formatter: (param: ChartParam) =>
                formatMetric(param.value === null ? null : Number(param.value), unit) ?? "",
            },
          }
        : {
            id: occupancySeriesId(entry.key),
            name: entry.label,
            type: "line" as const,
            data: entry.values,
            smooth: false,
            symbolSize: bundle.axis.length > 60 ? 0 : CHART_MARK.symbolSize,
            lineStyle: { color, width: CHART_MARK.lineWidth },
            itemStyle: { color },
          };
    }),
  };
}

export function seriesTable(bundle: OccupancyBundle, context: SeriesOptionContext): ChartTable {
  return {
    columns: bundle.axis.map((point) => point.label),
    rows: bundle.series.map((entry) => ({
      id: occupancySeriesId(entry.key),
      label: entry.label,
      color: context.colorOf(entry.key),
      values: entry.values.map((value) => formatMetric(value, bundle.metric.unit)),
    })),
  };
}

const CHANNEL_LABEL_WIDTH = 150;

/**
 * Nights per channel, largest on top. Horizontal because a channel's name is words, and words
 * rotated 45° under an axis are not read.
 */
export function channelOption(
  entries: readonly ChannelEntry[],
  order: readonly string[],
): ChartOption {
  return {
    animationDuration: 320,
    textStyle: { fontFamily: CHART_FONT },
    grid: { left: CHANNEL_LABEL_WIDTH + 14, right: 84, top: 8, bottom: 8, outerBoundsMode: "none" },
    legend: { show: false },
    xAxis: {
      type: "value",
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { show: true, lineStyle: { color: CHART_LINES.grid, width: 1, type: "solid" } },
      axisLabel: { color: CHART_INK.faint, fontSize: 11 },
    },
    yAxis: {
      type: "category",
      data: entries.map((entry) => entry.name),
      inverse: true,
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { show: false },
      axisLabel: {
        color: CHART_INK.muted,
        fontSize: 11.5,
        width: CHANNEL_LABEL_WIDTH,
        overflow: "truncate",
      },
    },
    tooltip: {
      ...TOOLTIP_CHROME,
      trigger: "item",
      formatter: (params) => {
        const row = Array.isArray(params) ? params[0] : params;
        return `${row.name}<br><b>${formatNumber(Number(row.value ?? 0))}</b> noches`;
      },
    },
    series: [
      {
        id: "canales",
        name: "Noches",
        type: "bar",
        // Per-datum color: each channel keeps its slot across the tab, like any other entity.
        data: entries.map((entry) => ({
          value: entry.nights,
          itemStyle: {
            color: colorForEntity(entry.id, order),
            borderRadius: [0, CHART_MARK.radius, CHART_MARK.radius, 0],
          },
        })),
        barMaxWidth: CHART_MARK.barMaxWidth,
        label: {
          show: true,
          position: "right",
          distance: 6,
          color: CHART_INK.muted,
          fontSize: 11,
          formatter: (param: ChartParam) => formatNumber(Number(param.value ?? 0)),
        },
      },
    ],
  };
}

export function channelTable(
  entries: readonly ChannelEntry[],
  order: readonly string[],
): ChartTable {
  return {
    columns: ["Noches"],
    rows: entries.map((entry) => ({
      id: entry.id,
      label: entry.name,
      color: colorForEntity(entry.id, order),
      values: [formatNumber(entry.nights)],
    })),
  };
}

/** The week's rhythm: seven bars, one tone — the comparison here is between days, not entities. */
export function weekdayOption(
  labels: readonly string[],
  values: readonly (number | null)[],
  unit: MetricUnit,
  color: string,
): ChartOption {
  return {
    ...chrome(1),
    xAxis: categoryAxis([...labels]),
    yAxis: valueAxis(unit),
    tooltip: axisTooltip(unit, "shadow"),
    series: [
      {
        id: "semana",
        name: "Por día de la semana",
        type: "bar",
        data: [...values],
        itemStyle: { color, borderRadius: [CHART_MARK.radius, CHART_MARK.radius, 0, 0] },
        barMaxWidth: CHART_MARK.barMaxWidth,
        label: {
          show: true,
          position: "top",
          color: CHART_INK.muted,
          fontSize: 11,
          formatter: (param: ChartParam) =>
            formatMetric(param.value === null ? null : Number(param.value), unit) ?? "",
        },
      },
    ],
  };
}

export function weekdayTable(
  labels: readonly string[],
  values: readonly (number | null)[],
  unit: MetricUnit,
  color: string,
): ChartTable {
  return {
    columns: [...labels],
    rows: [
      {
        id: "semana",
        label: "Promedio del día",
        color,
        values: values.map((value) => formatMetric(value, unit)),
      },
    ],
  };
}
