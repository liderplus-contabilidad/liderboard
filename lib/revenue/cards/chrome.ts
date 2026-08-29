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
  CHART_SIGN,
  CHART_SURFACE,
  colorForEntity,
} from "@/lib/charts/palette";
import type {
  ChartAxis,
  ChartLabel,
  ChartLegend,
  ChartMarkLine,
  ChartOption,
  ChartParam,
  ChartTooltip,
} from "@/lib/charts/types";
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
): Omit<ChartOption, "series"> {
  return {
    animationDuration: 260,
    textStyle: { fontFamily: CHART_FONT },
    grid: {
      left: 8,
      right: 16,
      top: 16,
      bottom: legend.show ? 28 : 8,
      outerBoundsMode: "same",
      outerBoundsContain: "axisLabel",
    },
    xAxis: axis,
    yAxis: value,
    legend,
  };
}

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

export const money = (value: number) => formatCurrency(value, { cents: true });
export const percent = (value: number) => formatPercent(value);
export const moneyOrDash = (value: number | null) => (value === null ? null : money(value));
export const percentOrDash = (value: number | null) => (value === null ? null : percent(value));
/** A signed amount: a growth reads as a variation, so the `+` has to be written. */
export const signedMoney = (value: number | null) =>
  value === null ? null : `${value > 0 ? "+" : ""}${money(value)}`;
export const signedPercent = (value: number | null) =>
  value === null ? null : `${value > 0 ? "+" : ""}${percent(value)}`;

/**
 * The SIGN of a variation, written out: the glyph, the signed value, and the sign's own ink.
 *
 * This is the house rule taken literally — `positive`/`negative` are the sign of a VALUE and never a
 * series colour, and they never travel alone: always with a `▲`/`▼` and the signed figure. So the
 * BAR keeps the base year's colour (the entity it belongs to) and the sign lives entirely in the
 * label, where it can carry all three encodings at once.
 *
 * `rich` is what makes that possible: a label's own `color` is a single value for the whole string,
 * and here the ink has to change per DATUM — one column rising, the next falling.
 *
 * **`"top"` here is only the RISING case's position; a falling bar overrides it per datum** — see
 * `signPosition`. The series-level value cannot answer for both, and that is what put every falling
 * label on the zero line.
 */
export function signLabel(show: boolean, inPercent: boolean): ChartLabel {
  const write = (value: number) =>
    inPercent
      ? `${value > 0 ? "+" : ""}${percent(value)}`
      : `${value > 0 ? "+" : ""}${money(value)}`;
  return {
    show,
    // The default, which the rising bars keep; `signPosition` overrides it on the falling ones.
    position: "top",
    fontSize: 10.5,
    rich: {
      pos: { color: CHART_SIGN.positive, fontSize: 10.5, fontWeight: 600 },
      neg: { color: CHART_SIGN.negative, fontSize: 10.5, fontWeight: 600 },
    },
    formatter: (param: ChartParam) => {
      if (param.value === null || param.value === undefined) {
        return "";
      }
      const value = Number(param.value);
      if (value === 0) {
        return "";
      }
      return value > 0 ? `{pos|▲ ${write(value)}}` : `{neg|▼ ${write(value)}}`;
    },
  };
}

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

/**
 * Where a variation's label goes, decided by the datum's own SIGN: above a rise, below a fall.
 *
 * It is not cosmetic, it is what stops two labels landing on top of each other. `position: "top"` is
 * the top EDGE of the datum's rect, and a falling bar's rect runs from zero downwards — so its top
 * edge IS the zero line. With every falling bar pinned there, two base years put two ~90px labels
 * ~20px apart at identical height in the same month, and «▼ -$4,5▼-$4,52…12,287.73» is what came out.
 * `hideOverlap` could only answer by dropping one of the two figures, and on a narrow card it drew
 * both.
 *
 * Placed by sign, two falling bars sit at the depth of their OWN values —which differ, or they would
 * not be two readings— so they separate on their own and `hideOverlap` goes back to being the last
 * resort it was meant to be.
 *
 * `null` and `0` take the default: neither draws a label at all (`signLabel`'s formatter returns an
 * empty string for both), so their position is never read.
 */
export function signPosition(value: number | null): { position?: ChartLabel["position"] } {
  return value !== null && value < 0 ? { position: "bottom" } : {};
}
