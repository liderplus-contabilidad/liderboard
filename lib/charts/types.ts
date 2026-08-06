/**
 * The slice of the ECharts option contract this dashboard writes. Declaring it here rather than
 * importing `EChartsOption` keeps `lib/` free of the renderer and lets Vitest reason about plain
 * objects; `components/ui/chart.tsx` does the widening.
 *
 * Two invariants are encoded in the types, so violating them does not compile: `xAxis`/`yAxis`
 * are single objects — never a pair of scales — and `series` is always a list.
 */

export type ChartValue = number | null;

export interface ChartTextStyle {
  color?: string;
  fontSize?: number;
  fontWeight?: number | string;
  fontFamily?: string;
}

export interface ChartLineStyle {
  color?: string;
  width?: number;
  /** Always "solid" for grid and axis lines; a dashed grid competes with the marks. */
  type?: "solid" | "dashed" | "dotted";
}

/** What a label or tooltip callback receives from the renderer. */
export interface ChartParam {
  seriesId?: string;
  seriesName?: string;
  /** Category label for cartesian charts, slice name for a pie. */
  name: string;
  value: ChartValue;
  dataIndex: number;
  /** HTML swatch the renderer builds for the series color. */
  marker?: string;
  /** Pie only. */
  percent?: number;
}

export interface ChartLabel extends ChartTextStyle {
  show: boolean;
  position?: "top" | "inside" | "right" | "left" | "outside" | "insideRight";
  distance?: number;
  formatter?: (param: ChartParam) => string;
}

export interface ChartAxisLabel extends ChartTextStyle {
  show?: boolean;
  margin?: number;
  hideOverlap?: boolean;
  interval?: number | "auto";
  rotate?: number;
  width?: number;
  overflow?: "truncate" | "break" | "breakAll";
  formatter?: (value: string | number) => string;
}

export interface ChartAxis {
  type: "category" | "value";
  data?: string[];
  min?: number | string;
  max?: number | string;
  /** Category axes of horizontal bars are inverted so the largest sits on top. */
  inverse?: boolean;
  boundaryGap?: boolean | [string, string];
  axisLine?: { show?: boolean; lineStyle?: ChartLineStyle };
  axisTick?: { show?: boolean };
  splitLine?: { show?: boolean; lineStyle?: ChartLineStyle };
  axisLabel?: ChartAxisLabel;
}

export interface ChartItemStyle {
  color?: string;
  borderColor?: string;
  borderWidth?: number;
  borderRadius?: number | number[];
}

/** `coord` is what lets a line STOP somewhere instead of crossing the whole grid. */
export interface ChartMarkPoint {
  xAxis?: number;
  yAxis?: number;
  /** `[índice de categoría, valor]`. */
  coord?: [number, number];
  name?: string;
}

export interface ChartMarkLine {
  silent?: boolean;
  symbol?: string | string[];
  label?: {
    show?: boolean;
    position?: "start" | "middle" | "end" | "insideEndTop";
    formatter?: string;
    color?: string;
    fontSize?: number;
  };
  lineStyle?: ChartLineStyle;
  /** A lone point is a reference line across the plot; a pair is the segment between them. */
  data: (ChartMarkPoint | [ChartMarkPoint, ChartMarkPoint])[];
}

/** One slice of a pie, which needs its own name alongside the value. */
export interface ChartPieDatum {
  id: string;
  name: string;
  value: number;
  itemStyle?: ChartItemStyle;
}

/** One bar of an entry-based chart, so a single item can carry its own color. */
export interface ChartBarDatum {
  value: ChartValue;
  itemStyle?: ChartItemStyle;
}

export type ChartDatum = ChartValue | ChartPieDatum | ChartBarDatum;

export interface ChartSeries {
  id: string;
  type: "bar" | "line" | "pie";
  name?: string;
  data: ChartDatum[];
  /** Same string = same stack. */
  stack?: string;
  itemStyle?: ChartItemStyle;
  lineStyle?: ChartLineStyle;
  label?: ChartLabel;
  /** `hideOverlap` is how a label that does not fit is dropped instead of clipped. */
  labelLayout?: { hideOverlap?: boolean };
  emphasis?: { focus?: "series"; itemStyle?: ChartItemStyle };
  symbol?: string;
  symbolSize?: number;
  smooth?: boolean;
  barMaxWidth?: number;
  barWidth?: number | string;
  /** Pie geometry: `[inner, outer]` turns it into a donut. */
  radius?: string | [string, string];
  center?: [string, string];
  markLine?: ChartMarkLine;
  /** Takes the series out of hover and emphasis — for a mark that exists only to hold space. */
  silent?: boolean;
  z?: number;
}

export interface ChartGrid {
  left?: number | string;
  right?: number | string;
  top?: number | string;
  bottom?: number | string;
  /** ECharts 6 replaced `containLabel` with these two; together they mean what it did. */
  outerBoundsMode?: "auto" | "same" | "none";
  outerBoundsContain?: "all" | "axisLabel" | "auto";
}

export interface ChartLegend {
  show: boolean;
  type?: "plain" | "scroll";
  bottom?: number | string;
  top?: number | string;
  left?: number | string;
  icon?: string;
  itemWidth?: number;
  itemHeight?: number;
  itemGap?: number;
  textStyle?: ChartTextStyle;
}

export interface ChartTooltip {
  trigger: "axis" | "item";
  axisPointer?: { type: "line" | "shadow" | "cross"; lineStyle?: ChartLineStyle };
  backgroundColor?: string;
  borderColor?: string;
  borderWidth?: number;
  padding?: number | number[];
  textStyle?: ChartTextStyle;
  /** Axis trigger receives the whole column; item trigger a single mark. */
  formatter?: (params: ChartParam[] | ChartParam) => string;
}

export interface ChartOption {
  animationDuration?: number;
  textStyle?: ChartTextStyle;
  grid?: ChartGrid;
  xAxis?: ChartAxis;
  yAxis?: ChartAxis;
  legend?: ChartLegend;
  tooltip?: ChartTooltip;
  series: ChartSeries[];
}

export interface ChartTableRow {
  /** Stable across renders: a series key id, or the entity's own code. */
  id: string;
  label: string;
  /**
   * What identifies the entity WITHOUT being its name — an employee's role beside the employee.
   * The chart never draws it: in a legend or a tooltip it competes with the name, and here there
   * is room for both.
   */
  sublabel?: string;
  /**
   * Renders with more weight than the rows around it. It is what separates a TOTAL from what it
   * totals when both are series of the same chart; without it a `TOTAL` row reads as one more
   * entity in the list.
   */
  emphasis?: boolean;
  color: string;
  /** Already formatted; `null` is a period with no coverage and must render EMPTY, not `$0`. */
  values: (string | null)[];
}

/** Three of the eight palette slots fall below 3:1 against white, so this is not a nicety. */
export interface ChartTable {
  columns: string[];
  rows: ChartTableRow[];
}

/**
 * A card described as DATA — everything needed to draw one, and nothing about how. The pure
 * layer produces the list and a view arranges it, so two readers (the screen and a printable
 * report) draw the SAME cards instead of each computing its own. Two computations of one
 * question drift, and nothing downstream can tell which of the two numbers is the right one.
 */
export interface ChartCardSpec {
  /** Stable and independent of the copy: the React key, and what a test names. */
  id: string;
  title: string;
  subtitle?: string;
  /** `null` when there is nothing to draw — the card says why instead of drawing an empty plot. */
  option: ChartOption | null;
  /** The same numbers as rows and columns; every card has one. */
  table: ChartTable;
  /** `SeriesBundle.warnings`, shown whole and before the chart. */
  warnings?: string[];
  /** Footnote for what the card set aside, e.g. a negative slice left out of a pie. */
  note?: string;
  height: number;
}
