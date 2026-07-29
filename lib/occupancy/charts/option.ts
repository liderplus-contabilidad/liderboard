/**
 * `OccupancyBundle` in, an ECharts option out. Pure, so these stay testable without a DOM:
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
import type { ChannelBreakdown, WeekdayBreakdown } from "../analytics/breakdown";
import {
  occupancySeriesId,
  type MetricSpec,
  type MetricUnit,
  type OccupancyBundle,
  type OccupancySeriesKey,
  type PointFacts,
} from "../analytics/types";

/** Beyond this a legend is noise: one series is named by the card's own subtitle. */
const MIN_LEGEND_SERIES = 2;

/** Past this many columns a label per bar stops being read and becomes texture. */
const MAX_DIRECT_LABELS = 14;

/** Below this a comparison draws as grouped bars: a line of a single point draws nothing. */
const FEW_COLUMNS = 6;

export interface SeriesOptionContext {
  /** The only way a series gets a color; comes from `colorResolver`. */
  colorOf: (key: OccupancySeriesKey) => string;
}

/** Past this an amount no longer needs its cents, and they crowd an axis label. */
const CENTS_FIT_BELOW = 1000;

/**
 * The one formatter every axis, label, tooltip and table cell goes through. A ratio arrives as a
 * fraction and `formatPercent` speaks in points, so the ×100 lives here; an ADR of $82.89 keeps
 * its cents because rounding to $83 loses exactly the precision the figure exists for.
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

const TIP_HEAD = `color:${CHART_INK.strong};font-weight:600;margin-bottom:4px`;
const TIP_KEY = `color:${CHART_INK.muted};font-weight:500;padding-right:16px;text-align:left`;
const TIP_VALUE = `color:${CHART_INK.strong};font-weight:600;text-align:right;font-variant-numeric:tabular-nums`;
const TIP_SUPPORT = `color:${CHART_INK.faint};padding-left:16px`;

function ratioOrNull(numerator: number, denominator: number): number | null {
  return denominator === 0 ? null : numerator / denominator;
}

/** Only for a single series: eight of these blocks stacked would run off the card. */
function detailTable(facts: PointFacts): string {
  const rows: [string, string | null][] = [
    ["Ocupación", formatMetric(ratioOrNull(facts.sold, facts.available), "percent")],
    ["Vendidas", formatMetric(facts.sold, "count")],
    ["Disponibles", formatMetric(facts.available, "count")],
    ["Ingresos", formatMetric(facts.revenue, "currency")],
    ["ADR", formatMetric(ratioOrNull(facts.revenue, facts.sold), "currency")],
    ["RevPAR", formatMetric(ratioOrNull(facts.revenue, facts.available), "currency")],
    ["PAX", formatMetric(facts.pax, "count")],
  ];
  const body = rows
    .map(
      ([label, value]) =>
        `<tr><td style="${TIP_KEY}">${label}</td><td style="${TIP_VALUE}">${value ?? "—"}</td></tr>`,
    )
    .join("");
  return `<table style="border-collapse:collapse;font-size:12px">${body}</table>`;
}

/**
 * Answers «¿de dónde sale ese 59 %?» while comparing. Each metric names the figures that are its
 * own — a TOTAL divides by a literal 1, so it must never read «1.610 de 1».
 */
function supportLine(metric: MetricSpec, facts: PointFacts): string {
  const count = (value: number) => formatMetric(value, "count") ?? "—";
  const money = (value: number | null) => formatMetric(value, "currency") ?? "—";
  switch (metric.id) {
    case "occupancy":
      return `${count(facts.sold)} de ${count(facts.available)} habitaciones`;
    case "adr":
      return `${money(facts.revenue)} en ${count(facts.sold)} vendidas`;
    case "revpar":
      return `${money(facts.revenue)} en ${count(facts.available)} disponibles`;
    case "revenue":
      return `${count(facts.sold)} vendidas · ADR ${money(ratioOrNull(facts.revenue, facts.sold))}`;
    case "sold":
      return `de ${count(facts.available)} disponibles · ${
        formatMetric(ratioOrNull(facts.sold, facts.available), "percent") ?? "—"
      }`;
    case "pax":
      return `en ${count(facts.sold)} habitaciones vendidas`;
  }
}

/**
 * With ONE series it opens the whole column. Comparing, each series keeps to its value plus the
 * support line: the point is the difference between series, and seven rows apiece would bury it.
 */
function seriesTooltip(bundle: OccupancyBundle, pointer: "shadow" | "line"): ChartTooltip {
  const unit = bundle.metric.unit;
  const factsOf = (seriesId: string | undefined, dataIndex: number): PointFacts | null =>
    bundle.series.find((entry) => occupancySeriesId(entry.key) === seriesId)?.facts[dataIndex] ??
    null;

  return {
    ...TOOLTIP_CHROME,
    trigger: "axis",
    axisPointer: { type: pointer, lineStyle: { color: CHART_LINES.axis, width: 1 } },
    formatter: (params) => {
      const rows = Array.isArray(params) ? params : [params];
      const head = rows[0]?.name ?? "";

      if (bundle.series.length === 1) {
        const facts = factsOf(rows[0]?.seriesId, rows[0]?.dataIndex ?? 0);
        const title = `${head} · ${bundle.series[0].label}`;
        return facts
          ? `<div style="${TIP_HEAD}">${title}</div>${detailTable(facts)}`
          : `<div style="${TIP_HEAD}">${title}</div>—`;
      }

      const body = rows
        .map((row) => {
          const value = formatMetric(row.value === null ? null : Number(row.value), unit);
          const facts = factsOf(row.seriesId, row.dataIndex);
          const support = facts
            ? `<div style="${TIP_SUPPORT}">${supportLine(bundle.metric, facts)}</div>`
            : "";
          return `<div>${row.marker ?? ""}${row.seriesName ?? ""} <b>${value ?? "—"}</b></div>${support}`;
        })
        .join("");
      return `<div style="${TIP_HEAD}">${head}</div>${body}`;
    },
  };
}

/**
 * With ONE column what varies is the series, not the date. Leaving «5 ene» on the axis would
 * label both bars the same, so the entities take the axis and the date moves to the subtitle.
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
        // Here each BAR is a series, so its column is always index 0 of that series' facts.
        const facts = bundle.series[row.dataIndex]?.facts[0] ?? null;
        const support = facts
          ? `<div style="${TIP_SUPPORT}">${supportLine(bundle.metric, facts)}</div>`
          : "";
        return `<div style="${TIP_HEAD}">${row.name}</div><b>${value ?? "—"}</b>${support}`;
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

/** Bars for a single series read by month; lines once 365 bars apiece would be a block of ink. */
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
    tooltip: seriesTooltip(bundle, asBars ? "shadow" : "line"),
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
 * Horizontal because a channel's name is words, and words rotated 45° are not read.
 *
 * With one series the bars are coloured BY CHANNEL. Comparing, the colour has to encode the
 * center-year instead: the channel is now the row, so colour is what tells two bars in it apart.
 */
export function channelOption(
  breakdown: ChannelBreakdown,
  order: readonly string[],
  context: SeriesOptionContext,
): ChartOption {
  const comparing = breakdown.series.length > 1;
  const legend = legendFor(breakdown.series.length);
  return {
    animationDuration: 320,
    textStyle: { fontFamily: CHART_FONT },
    grid: {
      left: CHANNEL_LABEL_WIDTH + 14,
      right: 84,
      top: 8,
      bottom: comparing ? 28 : 8,
      outerBoundsMode: "none",
    },
    legend: comparing ? legend : { show: false },
    xAxis: {
      type: "value",
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { show: true, lineStyle: { color: CHART_LINES.grid, width: 1, type: "solid" } },
      axisLabel: { color: CHART_INK.faint, fontSize: 11 },
    },
    yAxis: {
      type: "category",
      data: breakdown.channels.map((entry) => entry.name),
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
        const who = comparing ? `${row.marker ?? ""}${row.seriesName ?? ""}<br>` : "";
        return `<div style="${TIP_HEAD}">${row.name}</div>${who}<b>${formatNumber(Number(row.value ?? 0))}</b> noches`;
      },
    },
    series: breakdown.series.map((entry) => ({
      id: `canales:${occupancySeriesId(entry.key)}`,
      name: comparing ? entry.label : "Noches",
      type: "bar" as const,
      data: comparing
        ? entry.nights
        : // Per-datum color: with one series each channel keeps its slot, like any other entity.
          entry.nights.map((nights, index) => ({
            value: nights,
            itemStyle: {
              color: colorForEntity(breakdown.channels[index].id, order),
              borderRadius: [0, CHART_MARK.radius, CHART_MARK.radius, 0],
            },
          })),
      ...(comparing
        ? {
            itemStyle: {
              color: context.colorOf(entry.key),
              borderRadius: [0, CHART_MARK.radius, CHART_MARK.radius, 0],
            },
          }
        : {}),
      barMaxWidth: CHART_MARK.barMaxWidth,
      label: {
        show: true,
        position: "right" as const,
        distance: 6,
        color: CHART_INK.muted,
        fontSize: 11,
        formatter: (param: ChartParam) => formatNumber(Number(param.value ?? 0)),
      },
    })),
  };
}

export function channelTable(
  breakdown: ChannelBreakdown,
  order: readonly string[],
  context: SeriesOptionContext,
): ChartTable {
  const comparing = breakdown.series.length > 1;
  if (!comparing) {
    const nights = breakdown.series[0]?.nights ?? [];
    return {
      columns: ["Noches"],
      rows: breakdown.channels.map((entry, index) => ({
        id: entry.id,
        label: entry.name,
        color: colorForEntity(entry.id, order),
        values: [formatNumber(nights[index] ?? 0)],
      })),
    };
  }
  // Comparing, the channels become the columns: a row per center-year is what is read.
  return {
    columns: breakdown.channels.map((entry) => entry.name),
    rows: breakdown.series.map((entry) => ({
      id: occupancySeriesId(entry.key),
      label: entry.label,
      color: context.colorOf(entry.key),
      values: entry.nights.map((nights) => formatNumber(nights)),
    })),
  };
}

/**
 * One series is seven bars in one tone: what varies is the day. Marking two centers or two years
 * groups their bars under each weekday instead of blending them into one figure.
 */
export function weekdayOption(
  breakdown: WeekdayBreakdown,
  unit: MetricUnit,
  context: SeriesOptionContext,
  fallbackColor: string,
): ChartOption {
  const comparing = breakdown.series.length > 1;
  return {
    ...chrome(breakdown.series.length),
    xAxis: categoryAxis([...breakdown.labels]),
    yAxis: valueAxis(unit),
    tooltip: axisTooltip(unit, "shadow"),
    series: breakdown.series.map((entry) => ({
      id: `semana:${occupancySeriesId(entry.key)}`,
      name: comparing ? entry.label : "Por día de la semana",
      type: "bar" as const,
      data: [...entry.values],
      itemStyle: {
        color: comparing ? context.colorOf(entry.key) : fallbackColor,
        borderRadius: [CHART_MARK.radius, CHART_MARK.radius, 0, 0],
      },
      barMaxWidth: CHART_MARK.barMaxWidth,
      label: {
        // Seven days × several series is too many numbers to print; the tooltip carries them.
        show: !comparing,
        position: "top" as const,
        color: CHART_INK.muted,
        fontSize: 11,
        formatter: (param: ChartParam) =>
          formatMetric(param.value === null ? null : Number(param.value), unit) ?? "",
      },
    })),
  };
}

export function weekdayTable(
  breakdown: WeekdayBreakdown,
  unit: MetricUnit,
  context: SeriesOptionContext,
  fallbackColor: string,
): ChartTable {
  const comparing = breakdown.series.length > 1;
  return {
    columns: [...breakdown.labels],
    rows: breakdown.series.map((entry) => ({
      id: occupancySeriesId(entry.key),
      label: comparing ? entry.label : "Promedio del día",
      color: comparing ? context.colorOf(entry.key) : fallbackColor,
      values: entry.values.map((value) => formatMetric(value, unit)),
    })),
  };
}
