/**
 * The chrome every card of this module shares: the tooltip, the plot box, the three axes, the legend,
 * the formatters and the two colour resolvers.
 *
 * It is one file and not a habit repeated in five, which is the whole reason `cards.ts` was split: a
 * card that wrote its own tooltip would be one omission away from an unconfined one, and `ChartCard`
 * is `overflow-hidden`.
 *
 * Nothing here decides a figure. Every number on screen comes from `derive.ts`, `growth.ts` or
 * `ratio.ts`; this file only says how it is written and where it sits.
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
  ChartMarkLine,
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
import { formatCurrency, formatPercent } from "@/lib/format";
import { REVENUE_SERIES_ORDER } from "../series";

/**
 * The tooltip's chrome, written ONCE for the whole module — `confine` above all.
 *
 * `ChartCard` is an `overflow-hidden` (it needs to be, so its table does not spill out of the rounded
 * corners), so an unconfined tooltip is CUT by the card on the last bars, exactly where a long label
 * needs reading. Never set it per tooltip: one omission and one card misbehaves in a way nobody
 * notices until a demo.
 */
export const TOOLTIP_CHROME = {
  backgroundColor: CHART_SURFACE,
  borderColor: CHART_LINES.axis,
  borderWidth: 1,
  padding: [8, 10] as [number, number],
  textStyle: { color: CHART_INK.strong, fontSize: 12 },
  confine: true,
} as const;

export const ROUND_TOP = [CHART_MARK.radius, CHART_MARK.radius, 0, 0] as [
  number,
  number,
  number,
  number,
];

/**
 * The plot box, and the ROOM THE LEGEND NEEDS — which is why the legend is an argument and not
 * something each card bolts on afterwards.
 *
 * The legend sits at `bottom: 0`, so the grid has to give way for it: with a fixed `bottom` the
 * legend lands ON TOP of the axis labels, and a month's name under the bars is what identifies the
 * column. `outerBoundsContain: "axisLabel"` is the other half — it is what makes the box reserve the
 * labels' own height instead of letting them hang outside it.
 *
 * These are PyG's numbers (`charts/option.ts`'s `chrome`), not new ones: the two modules draw the
 * same kind of cartesian card, and a second spacing rule would drift from the first.
 */
export function baseOption(
  axis: ChartAxis,
  value: ChartAxis,
  legend: ChartLegend,
  /**
   * The rows of figures written over the marks, when the card writes any. `outerBoundsContain` only
   * reserves for the AXIS' labels, so without this the top row is cropped against the card's edge.
   */
  labels?: { rows: number; fit: LabelFit },
): Omit<ChartOption, "series"> {
  return {
    animationDuration: 260,
    textStyle: { fontFamily: CHART_FONT },
    grid: {
      left: 8,
      right: 16,
      top: labels ? labelHeadroom(labels.rows, labels.fit, 16) : 16,
      bottom: legend.show ? 28 : 8,
      outerBoundsMode: "same",
      outerBoundsContain: "axisLabel",
    },
    xAxis: axis,
    yAxis: value,
    legend,
  };
}

/**
 * How many ROWS of figures a card with this many series writes, and `null` where it writes none.
 *
 * Past four series a figure per mark stops being read and becomes texture — PyG's same number — and
 * the rows themselves are what would cost it: eight of them eat a third of a 280 px card. There the
 * amount stays where it has always been reachable, in the tooltip and in the table twin.
 */
export const MAX_LABEL_ROWS = 4;

/**
 * The figure written over a mark: always written, always FLAT, and one composition of it for the
 * whole module so five cards cannot end up writing an amount five ways.
 *
 * `lib/charts/label-fit` is the shared rule of what shape it takes —body, then cents, never the
 * figure— and of the ROW each series writes on, which is what lets several series carry their amount
 * without disputing one strip. It is the same rule PyG and «Ventas por servicio» read.
 *
 * `shares` adds a SECOND line under the amount with what that bar is of the one beside it. It is what
 * replaced this module's «Ver como»: a percentage and an amount are not two readings to switch
 * between, they are one reading —«esto es tanto, y es tanto por ciento de aquello»— and the switch
 * made the reader hold one of the halves in their head while looking at the other.
 */
export function directLabel(
  fit: LabelFit,
  options: {
    row?: number;
    unit?: (value: number) => string;
    shares?: readonly (number | null)[];
    /**
     * Where the figure's LEFT EDGE goes, measured from the centre of its mark — which also stops it
     * being centred there.
     *
     * A `"top"` label is centred on its bar, and a figure some 63 px wide over a bar 28 px wide
     * spills 18 px out of each side. On these grouped cards the bar to its left is the DENOMINATOR's,
     * ten times taller, so that spill did not merely crowd a neighbour: it was printed across a solid
     * fill and the first digits stopped being legible. Nudging the whole label rightwards only trades
     * which neighbour it lands on, because a centred label keeps half its width on each side.
     *
     * Anchoring the left edge is what actually answers it: the figure grows RIGHTWARDS from the point
     * given, so everything it can cover is the plot to its own right. `-barWidth / 2` starts it flush
     * with its bar's left edge, which is the nearest it can sit without reaching the fill beside it.
     */
    startAt?: number;
  } = {},
): Pick<ChartSeries, "label" | "labelLayout"> {
  const { shares } = options;
  const write = options.unit ?? ((value: number) => formatCurrency(value, { cents: fit.cents }));
  return {
    label: {
      show: true,
      position: "top",
      distance: labelDistance(options.row ?? 0, fit),
      ...(options.startAt === undefined
        ? {}
        : { align: "left" as const, offset: [options.startAt, 0] as [number, number] }),
      color: CHART_INK.strong,
      fontSize: fit.fontSize,
      ...(shares
        ? {
            // Fainter than the amount: the percentage is an annotation over the bar, not the bar's
            // own figure — PyG's `SHARE_RICH_KEY`, and the same ink.
            rich: {
              share: { color: CHART_INK.muted, fontSize: fit.fontSize - 0.5, lineHeight: 13 },
            },
          }
        : {}),
      formatter: (param: ChartParam) => {
        const amount =
          param.value === null || param.value === undefined ? "" : write(Number(param.value));
        const share = shares?.[param.dataIndex];
        if (share === null || share === undefined) {
          return amount;
        }
        const written = `{share|${percent(share)}}`;
        return amount === "" ? written : `${amount}\n${written}`;
      },
    },
    // The rows keep one series' figures off the next one's; what is left for `hideOverlap` is a
    // collision INSIDE a row — two adjacent columns on an axis narrower than the fit assumed.
    labelLayout: { hideOverlap: true },
  };
}

/** Re-exported so a card of this module has ONE door to the label rule, the same way it has one
 *  door to the tooltip and to the axes. */
export { fitDirectLabel, type LabelFit };

export function categoryAxis(labels: readonly string[]): ChartAxis {
  return {
    type: "category",
    data: [...labels],
    axisLine: { show: true, lineStyle: { color: CHART_LINES.axis, width: 1, type: "solid" } },
    axisTick: { show: false },
    splitLine: { show: false },
    axisLabel: { color: CHART_INK.muted, fontSize: 11, interval: 0, hideOverlap: true },
  };
}

export function currencyAxis(): ChartAxis {
  return {
    type: "value",
    axisLine: { show: false },
    axisTick: { show: false },
    splitLine: { show: true, lineStyle: { color: CHART_LINES.grid, width: 1, type: "solid" } },
    axisLabel: {
      color: CHART_INK.faint,
      fontSize: 11,
      // Without cents: an axis is the scale a bar is estimated against, and six labels of
      // «$337,092.91» eat the drawing's width. The exact figure is in the tooltip and the table.
      formatter: (value) => formatCurrency(Number(value)),
    },
  };
}

export function percentAxis(): ChartAxis {
  return {
    type: "value",
    axisLine: { show: false },
    axisTick: { show: false },
    splitLine: { show: true, lineStyle: { color: CHART_LINES.grid, width: 1, type: "solid" } },
    axisLabel: {
      color: CHART_INK.faint,
      fontSize: 11,
      formatter: (value) => formatPercent(Number(value), 0),
    },
  };
}

export function legendFor(show: boolean): ChartLegend {
  return {
    show,
    type: "scroll",
    bottom: 0,
    icon: "roundRect",
    itemWidth: 10,
    itemHeight: 10,
    itemGap: 14,
    textStyle: { color: CHART_INK.muted, fontSize: 11.5 },
  };
}

/**
 * The whole column, one line per series. A series with no figure is OMITTED rather than written as
 * `$0.00` — the table's same rule, and the module's whole point.
 *
 * `span` names the tramo the column was measured over, and it is not decoration: on the YEAR axis a
 * column headed «2024» carries the figure of a SPAN and not of the year, so a reader who checks it
 * against the year's own total in the capture drawer finds two different numbers with nothing on
 * screen to reconcile them. The subtitle and the note already say it; the tooltip is where the
 * question is actually asked.
 */
export function axisTooltip(unit: (value: number) => string, span?: string): ChartTooltip {
  return {
    ...TOOLTIP_CHROME,
    trigger: "axis",
    axisPointer: { type: "shadow", lineStyle: { color: CHART_LINES.axis, width: 1 } },
    formatter: (params) => {
      const rows = Array.isArray(params) ? params : [params];
      const name = rows[0]?.name ?? "";
      const head = span ? `${name} · ${span}` : name;
      const body = rows
        .filter((row) => row.value !== null && row.value !== undefined)
        .map(
          (row) =>
            `<div>${row.marker ?? ""} ${row.seriesName ?? ""}: <b>${unit(Number(row.value))}</b></div>`,
        )
        .join("");
      return `<div style="font-weight:600;margin-bottom:4px">${head}</div>${
        body || `<div style="color:${CHART_INK.muted}">Sin cargar</div>`
      }`;
    },
  };
}

/** A year's colour: its STABLE position in the drawn list, so unmarking one does not repaint the
 *  others — `colorForEntity`'s rule. */
export function yearColor(year: number, drawn: readonly number[]): string {
  return colorForEntity(String(year), drawn.map(String));
}

/** A series' colour: its slot in `REVENUE_SERIES_ORDER`, so an entity keeps its colour across the
 *  whole screen — the same orange being numerator in one card and denominator in the next. */
export function seriesColor(id: string): string {
  return colorForEntity(id, [...REVENUE_SERIES_ORDER]);
}

/** The module's amount. `cents` is the only thing a direct label ever takes off it, and only
 *  where `fitDirectLabel` says the axis no longer holds them. */
export const money = (value: number, cents = true) => formatCurrency(value, { cents });
export const percent = (value: number) => formatPercent(value);
export const moneyOrDash = (value: number | null) => (value === null ? null : money(value));
export const percentOrDash = (value: number | null) => (value === null ? null : percent(value));
/** A signed amount: a growth reads as a variation, so the `+` has to be written. */
export const signedMoney = (value: number | null) =>
  value === null ? null : `${value > 0 ? "+" : ""}${money(value)}`;
export const signedPercent = (value: number | null) =>
  value === null ? null : `${value > 0 ? "+" : ""}${percent(value)}`;

/** The line every growth is read against. Silent, because its height is not a datum. */
export function zeroLine(): ChartMarkLine {
  return {
    silent: true,
    symbol: "none",
    label: { show: false },
    lineStyle: { color: CHART_LINES.axis, width: 1, type: "solid" },
    data: [{ yAxis: 0 }],
  };
}
