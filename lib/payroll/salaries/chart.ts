/**
 * From the `SalariesGrid` to the card that is drawn: bars grouped by month, plus its table twin. Pure,
 * so the rules that make the reading honest are tested without mounting a DOM.
 *
 * It is an OWN builder and not PyG's, following Ocupaciones' precedent: `barOption` of
 * `lib/profit-loss/charts/option.ts` is written over the types of its analytics engine (`Series`,
 * `SeriesKey`, `PeriodRef`), and bringing them here would tie Rol de Pagos to PyG through
 * presentation. What is shared is what should be: the `ChartOption` types, the palette and the
 * formatters.
 *
 * The three house rules this file respects:
 *
 *   - **A `null` stays `null`.** ECharts draws no mark, and the table leaves it blank. A gap turned
 *     into 0 would draw a fall nobody declared.
 *   - **One single `yAxis`.** One is enough here because everything is in dollars: it is one figure.
 *   - **No hex written.** The colour comes from `colorForEntity`, and the ink and lines from
 *     `lib/charts/palette`.
 *
 * And one of its own: **the series cap trims the CHART, not the table**. `ChartCard` receives `option`
 * and `table` separately, so the table lists every row and the card declares in its footer how many
 * did not fit. The palette is eight slots and does not cycle; the table has no such limit and is the
 * exact reading.
 */
import {
  CHART_FONT,
  CHART_INK,
  CHART_LINES,
  CHART_MARK,
  CHART_MAX_SERIES,
  CHART_SURFACE,
  colorForEntity,
} from "@/lib/charts/palette";
import type {
  ChartAxis,
  ChartCardSpec,
  ChartLegend,
  ChartOption,
  ChartParam,
  ChartTable,
  ChartTooltip,
} from "@/lib/charts/types";
import { formatCurrency, pluralize } from "@/lib/format";
import type { SalariesGrid, SalariesRow } from "./grid";

/** With a single series the legend is superfluous: the card's title already names it. */
const MIN_LEGEND_SERIES = 2;

/** Past this many marks —series × columns— a figure per bar stops being readable and is texture. */
const MAX_DIRECT_LABEL_MARKS = 14;

/** The card's height; the same as PyG's and Ocupaciones'. */
const CARD_HEIGHT = 300;

/**
 * The rows the CHART draws: the closing row always —it is the bar the accountant looks for— plus the
 * ones with the highest accumulated cost until the palette is full.
 *
 * They are ordered by what is ACCUMULATED and not by the last month so moving a month mark does not
 * change which series are drawn: a chart whose cast dances when filtering cannot be compared with
 * itself.
 */
function drawnRows(grid: SalariesGrid): { rows: SalariesRow[]; dropped: number } {
  const withTotal = grid.total ? [...grid.rows, grid.total] : [...grid.rows];
  if (withTotal.length <= CHART_MAX_SERIES) {
    return { rows: withTotal, dropped: 0 };
  }
  // The closing row does not compete for a slot: it always goes in and reserves its own.
  const slots = grid.total ? CHART_MAX_SERIES - 1 : CHART_MAX_SERIES;
  const ranked = [...grid.rows].sort((a, b) => accumulated(b) - accumulated(a)).slice(0, slots);
  // They are drawn in the TABLE's order, not the ranking's, so the two can be read in parallel.
  const kept = new Set(ranked.map((row) => row.id));
  const rows = grid.rows.filter((row) => kept.has(row.id));
  return {
    rows: grid.total ? [...rows, grid.total] : rows,
    dropped: grid.rows.length - rows.length,
  };
}

function accumulated(row: SalariesRow): number {
  return row.values.reduce<number>((sum, value) => sum + (value ?? 0), 0);
}

/**
 * A row's colour comes from its stable position in the COMPLETE list, not in the drawn one: that way a
 * row keeps its colour even if the cap leaves another out, and the table's mark and the chart's bar
 * stay the same tone.
 */
function colorResolver(grid: SalariesGrid): (rowId: string) => string {
  const order = [...grid.rows.map((row) => row.id), ...(grid.total ? [grid.total.id] : [])];
  return (rowId: string) => colorForEntity(rowId, order);
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

function valueAxis(): ChartAxis {
  return {
    type: "value",
    axisLine: { show: false },
    axisTick: { show: false },
    splitLine: { show: true, lineStyle: { color: CHART_LINES.grid, width: 1, type: "solid" } },
    axisLabel: {
      color: CHART_INK.faint,
      fontSize: 11,
      // The module's ONLY figure without cents: an axis is the scale against which a bar's height is
      // estimated, and six labels of «$12,345.67» eat the drawing's width.
      formatter: (value) => formatCurrency(Number(value)),
    },
  };
}

/** A month with no value is OMITTED from the tooltip instead of saying `$0.00`, which is the table's
 *  same rule. */
function axisTooltip(): ChartTooltip {
  return {
    backgroundColor: CHART_SURFACE,
    borderColor: CHART_LINES.axis,
    borderWidth: 1,
    padding: [8, 10],
    textStyle: { color: CHART_INK.strong, fontSize: 12 },
    // Inside the CARD and not the window — see `ChartTooltip.confine`. It weighs the same here as in
    // PyG: the lines are employee names with their job title, so the box is wide.
    confine: true,
    trigger: "axis",
    axisPointer: { type: "shadow", lineStyle: { color: CHART_LINES.axis, width: 1 } },
    formatter: (params) => {
      const rows = Array.isArray(params) ? params : [params];
      const head = rows[0]?.name ?? "";
      const body = rows
        .filter((row) => row.value !== null && row.value !== undefined)
        .map(
          (row) =>
            `<div>${row.marker ?? ""} ${row.seriesName ?? ""}: <b>${formatCurrency(
              Number(row.value),
              { cents: true },
            )}</b></div>`,
        )
        .join("");
      return `<div style="font-weight:600;margin-bottom:4px">${head}</div>${body || "<div>Sin datos</div>"}`;
    },
  };
}

function buildOption(grid: SalariesGrid, rows: readonly SalariesRow[]): ChartOption | null {
  if (rows.length === 0 || grid.columns.length === 0) {
    return null;
  }
  const colorOf = colorResolver(grid);
  const legend = legendFor(rows.length);
  const labelsFit = rows.length * grid.columns.length <= MAX_DIRECT_LABEL_MARKS;

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
    xAxis: categoryAxis(grid.columns.map((column) => column.label)),
    yAxis: valueAxis(),
    tooltip: axisTooltip(),
    series: rows.map((row) => ({
      id: row.id,
      name: row.label,
      type: "bar" as const,
      data: row.values,
      itemStyle: {
        color: colorOf(row.id),
        borderRadius: [CHART_MARK.radius, CHART_MARK.radius, 0, 0] as [
          number,
          number,
          number,
          number,
        ],
      },
      barMaxWidth: CHART_MARK.barMaxWidth,
      label: {
        show: labelsFit,
        position: "top" as const,
        color: CHART_INK.muted,
        fontSize: 11,
        // With cents, like the tooltip and the table: the figure over the bar is checked against the
        // accountant's sheet. Only the axis drops them, because there the figure is estimated, not
        // compared.
        formatter: (param: ChartParam) =>
          param.value === null || param.value === undefined
            ? ""
            : formatCurrency(Number(param.value), { cents: true }),
      },
      labelLayout: { hideOverlap: true },
    })),
  };
}

/**
 * The table twin, built from ALL the grid's rows — never from the ones the chart draws.
 *
 * The amounts go with cents because this table exists to be checked against the accountant's Excel,
 * not to give an idea of the magnitude; the chart's axis does round them.
 */
function buildTable(grid: SalariesGrid): ChartTable {
  const colorOf = colorResolver(grid);
  const toRow = (row: SalariesRow, emphasis: boolean) => ({
    id: row.id,
    label: row.label,
    sublabel: row.sublabel,
    emphasis,
    color: colorOf(row.id),
    // The dash, and not a blank cell: it is what the accountant's sheet writes where someone was not
    // in the nómina, and it says «there is nothing here» instead of leaving doubt about whether the
    // datum or the upload is missing. `$0.00` stays reserved for a zero asserted by a record that was
    // there.
    values: row.values.map((value) =>
      value === null ? "–" : formatCurrency(value, { cents: true }),
    ),
  });

  return {
    columns: grid.columns.map((column) => column.label),
    rows: [
      ...grid.rows.map((row) => toRow(row, false)),
      ...(grid.total ? [toRow(grid.total, true)] : []),
    ],
  };
}

/** The title: the consolidado names no area, the detail names its own. */
function titleFor(grid: SalariesGrid): string {
  return grid.mode === "detalle" && grid.area ? `Área ${grid.area}` : "Sueldos por área";
}

export function buildSalariesCard(grid: SalariesGrid, subtitle?: string): ChartCardSpec {
  const { rows, dropped } = drawnRows(grid);
  return {
    id: "salaries",
    title: titleFor(grid),
    subtitle,
    option: buildOption(grid, rows),
    table: buildTable(grid),
    note:
      dropped > 0
        ? `La gráfica dibuja ${pluralize(rows.length, "serie")}: la paleta tiene ${CHART_MAX_SERIES} colores y no los repite. La tabla lista ${pluralize(grid.rows.length, "fila")}, incluidas las ${dropped} que no se dibujaron.`
        : undefined,
    height: CARD_HEIGHT,
  };
}
