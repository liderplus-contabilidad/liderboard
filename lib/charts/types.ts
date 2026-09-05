/**
 * The slice of the ECharts option contract this dashboard writes. Declaring it here rather than
 * importing `EChartsOption` keeps `lib/` free of the renderer and lets Vitest reason about plain
 * objects; `components/ui/chart.tsx` does the widening.
 *
 * Two invariants are encoded in the types, so violating them does not compile: no chart declares
 * two SCALES —`yAxis` is a single object, and `xAxis` admits a second one only as a band of labels,
 * with no series tied to it— and `series` is always a list.
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
  /**
   * `"bottom"` is what a NEGATIVE bar needs. In a cartesian grid `"top"` is the top EDGE of the
   * datum's rect, and a falling bar's rect runs from zero downwards — so its top edge IS the zero
   * line, and every falling bar in the chart parks its label at the same height. Placing by sign is
   * only reachable per DATUM (`ChartBarDatum.label`): `position` takes no function.
   */
  position?: "top" | "bottom" | "inside" | "right" | "left" | "outside" | "insideRight";
  distance?: number;
  /**
   * `[x, y]` moved off where `position` put it. `distance` only pushes along the position's own
   * direction —upwards, for a `"top"` label— so a figure that leans sideways over the bar BESIDE it
   * has no other way of stepping aside.
   */
  offset?: [number, number];
  /**
   * Which EDGE of the text lands on the anchor point. The default centres it, which is what makes a
   * label wider than its bar spill equally over both neighbours; `"left"` makes it grow rightwards
   * from the anchor instead, so it can only ever cover empty plot.
   */
  align?: "left" | "center" | "right";
  formatter?: (param: ChartParam) => string;
  /**
   * Named styles a formatter can apply per fragment with `{nombre|texto}`. The ONE reason it is
   * here: a label that carries two readings — the amount and, under it, the share of the account
   * that contains it — has to give the second one a fainter ink, and a label's own `color` is a
   * single value for the whole string.
   */
  rich?: Record<string, ChartTextStyle & { lineHeight?: number }>;
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
  /** Only the BAND OF LABELS uses it: it hangs under the real axis, separated by `offset`. */
  position?: "bottom" | "top";
  offset?: number;
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
  /** `[category index, value]`. */
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

/**
 * A background BAND spanning from one category to another — with which a grouped axis says how far
 * each group reaches without drawing one more line in the grid.
 */
export interface ChartMarkArea {
  silent?: boolean;
  itemStyle?: ChartItemStyle;
  data: [ChartMarkPoint, ChartMarkPoint][];
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
  /**
   * Per-datum label overrides, merged over the series'. Only `position` lives here, and it is the
   * ONE reason the field exists: placing a label by the datum's SIGN is impossible at series level,
   * where `position` is a single value for every bar.
   */
  label?: { position?: ChartLabel["position"] };
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
  markArea?: ChartMarkArea;
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
  /**
   * WHICH series the legend lists, by name. Left out, it lists them all — which is right until a
   * chart carries a series that is not an entity of the comparison: a total's line, or a mark that
   * only holds space. Naming them is what keeps those out of a list the reader clicks to filter.
   */
  data?: string[];
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
  /**
   * Keeps the tooltip inside the chart's CONTAINER and not merely inside the window.
   *
   * Without this the renderer hangs it off the container but places it against the window, so on
   * hovering the last bars the box falls off the card's edge — and the card, which is an
   * `overflow-hidden` so its table does not spill out of the rounded corners, CUTS it there. The
   * text is never clipped (the box grows to the longest line); what is lost is the part that ended
   * up outside, and it is lost exactly when the account's name is long, which is when it needs
   * reading.
   */
  confine?: boolean;
  /** Axis trigger receives the whole column; item trigger a single mark. */
  formatter?: (params: ChartParam[] | ChartParam) => string;
}

export interface ChartOption {
  animationDuration?: number;
  textStyle?: ChartTextStyle;
  grid?: ChartGrid;
  /**
   * One, or TWO when the second is a BAND OF LABELS and not a second scale: grouped columns
   * (category × establishment) need a line naming the group under its columns, and that axis carries
   * no series at all —`xAxisIndex` is not written, so they all stay tied to the first one—. The
   * invariant still standing is `yAxis`'s, which is where a second entry WOULD be a second scale and
   * would make two units comparable that are not.
   */
  xAxis?: ChartAxis | [ChartAxis, ChartAxis];
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
  /**
   * The colour dot that pairs the row with its mark in the chart. ABSENT when the row is not a
   * series: in the rotated axis's table the rows are the categories and the colour is carried by the
   * COLUMNS, so a dot there would pair with something that does not exist.
   */
  color?: string;
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
/**
 * A card's help: what question it answers, which gestures move it and what can be claimed with what
 * it draws. It travels in the `ChartCardSpec` and not in a separate catalogue for the usual reason: a
 * card changes identity with the state —the first one of Gráficos is «Comparación», «Ventas por línea
 * de negocio» or the expense annex depending on what is marked—, and a second list indexed by `id`
 * would end up describing a card other than the one being looked at.
 *
 * `actions` names the controls by their real LABEL («Cuenta contable», «Ver como tabla»), because a
 * help text that does not say where the control is forces you to hunt for it, and it only names
 * gestures that really exist on THAT card.
 */
export interface ChartGuideAction {
  /** The control, with its EXACT on-screen label — it is what the reader is going to look for. */
  control: string;
  /** What it does, in few words and without repeating the control's name. */
  effect: string;
}

export interface ChartGuide {
  /** What the card is for, in one short sentence. */
  purpose: string;
  /**
   * The controls that move it. They travel SPLIT in two —the label and what it does— because that way
   * they are painted in two inks and the list is scanned at a glance down the column of names; a
   * whole sentence per gesture forces you to read them all to find the control you are after.
   */
  actions: readonly ChartGuideAction[];
  /** What the shape does not say on its own and gets misread without. Optional. */
  reading?: string;
}

/**
 * `O` is what this card can DRAW, and it defaults to the two-dimensional option because that is what
 * almost every card in the app is. A card that can also come out in three dimensions widens it for
 * itself —`ChartCardSpec<ChartOption | Chart3DOption>`— instead of the type widening for everyone:
 * a builder that never returns a `grid3D` should not have to prove it does not on every read, and
 * `option.yAxis` has to keep resolving without a narrowing step in the hundred places that ask for
 * it.
 */
export interface ChartCardSpec<O = ChartOption> {
  /** Stable and independent of the copy: the React key, and what a test names. */
  id: string;
  title: string;
  subtitle?: string;
  /** `null` when there is nothing to draw — the card says why instead of drawing an empty plot. */
  option: O | null;
  /** The same numbers as rows and columns; every card has one. */
  table: ChartTable;
  /** `SeriesBundle.warnings`, shown whole and before the chart. */
  warnings?: string[];
  /** Footnote for what the card set aside, e.g. a negative slice left out of a pie. */
  note?: string;
  /** What the header's ⓘ opens. A card with no guide does not draw the icon. */
  guide?: ChartGuide;
  height: number;
}

// ---------------------------------------------------------------------------
// La tercera dimensión
// ---------------------------------------------------------------------------

/**
 * The slice of `echarts-gl`'s contract this dashboard writes — declared here and not imported for
 * the same reason as the rest of the file: `lib/` stays free of the renderer, and Vitest reasons
 * about plain objects.
 *
 * It is a SEPARATE type from `ChartOption` rather than an extension of it, and that is the point:
 * everything a 3D chart brings —a third scale, a camera, a light— would be dead weight on the
 * twenty-odd 2D options the app already writes, and the invariant «no chart declares two `yAxis`»
 * has to keep meaning what it means over there. Nothing here can loosen it.
 *
 * `is3DOption` is the ONE way to tell them apart. `grid3D` is required so that check is total.
 */
export interface Chart3DOption {
  animationDuration?: number;
  textStyle?: ChartTextStyle;
  /** Required: it is what `is3DOption` discriminates on. */
  grid3D: ChartGrid3D;
  xAxis3D: ChartAxis3D;
  yAxis3D: ChartAxis3D;
  zAxis3D: ChartAxis3D;
  legend?: ChartLegend;
  tooltip?: Chart3DTooltip;
  series: Chart3DSeries[];
}

/** Which of the two a card carries. The only place the two shapes are told apart. */
export function is3DOption(option: ChartOption | Chart3DOption): option is Chart3DOption {
  return "grid3D" in option;
}

/**
 * The box the three axes live in, and the camera looking at it.
 *
 * `boxWidth`/`boxDepth`/`boxHeight` are what give the reading its SHAPE: a long width against a
 * short depth is what turns a matrix of bars into a horizon —many months across, few services
 * deep— instead of a cube where every row hides the one behind it.
 */
export interface ChartGrid3D {
  boxWidth?: number;
  boxDepth?: number;
  boxHeight?: number;
  /** Flat, ambient-only light. See `Chart3DSeries.shading`. */
  light?: ChartLight3D;
  /** The card's own background; a 3D grid paints its own and would show a seam otherwise. */
  environment?: string;
  axisPointer?: { show?: boolean; lineStyle?: ChartLineStyle };
  axisLine?: { lineStyle?: ChartLineStyle };
  splitLine?: { lineStyle?: ChartLineStyle };
  viewControl?: ChartViewControl;
}

/**
 * Ambient light only, at full strength, with the directional one off.
 *
 * It is not a taste decision: with a main light the renderer multiplies each face by its angle to
 * it, so one bar comes out in three tones and `colorForEntity`'s hue stops being the entity's
 * identity — the same hue the composition card and the stack use for that service. It would also
 * throw away every contrast figure the palette's validator measured, since none of them were
 * measured against a shaded face.
 */
export interface ChartLight3D {
  main?: { intensity?: number; shadow?: boolean };
  ambient?: { intensity?: number };
}

/**
 * The camera. It starts STILL and stays where the reader leaves it.
 *
 * `autoRotate` is deliberately absent from this type instead of merely defaulting to false: a chart
 * that turns on its own moves the very value being read, and on paper it would be a control nobody
 * can press. Rotating is a gesture the reader makes.
 */
export interface ChartViewControl {
  /** Degrees above the floor. */
  alpha?: number;
  /** Degrees around it. */
  beta?: number;
  distance?: number;
  minDistance?: number;
  maxDistance?: number;
  /** Off: the box is read whole, and panning it out of frame has no way back. */
  panSensitivity?: number;
  rotateSensitivity?: number;
  zoomSensitivity?: number;
  damping?: number;
  animation?: boolean;
}

export interface ChartAxis3D {
  type: "category" | "value";
  data?: string[];
  name?: string;
  nameGap?: number;
  nameTextStyle?: ChartTextStyle;
  min?: number | "dataMin";
  max?: number | "dataMax";
  axisLine?: { show?: boolean; lineStyle?: ChartLineStyle };
  axisTick?: { show?: boolean };
  splitLine?: { show?: boolean; lineStyle?: ChartLineStyle };
  axisLabel?: ChartAxisLabel;
}

/**
 * One datum of a `bar3D`: the two axis INDICES and the height.
 *
 * A month that never arrived produces no datum at all rather than a datum of zero — which is what
 * finally makes «never loaded» and «loaded and sold nothing» two different drawings: the first is
 * a gap in the floor, the second a tile flat on it.
 */
export interface Chart3DDatum {
  /** `[x index, y index, z value]`. */
  value: [number, number, number];
}

/** One series per entity, as in 2D: it is what gives the legend its names and the tooltip its. */
export interface Chart3DSeries {
  type: "bar3D";
  id?: string;
  name?: string;
  data: Chart3DDatum[];
  /**
   * Always `"color"` — flat. See `ChartLight3D` for why the app does not light its bars.
   */
  shading?: "color" | "lambert" | "realistic";
  itemStyle?: ChartItemStyle;
  emphasis?: { itemStyle?: ChartItemStyle; label?: Chart3DLabel };
  /** A hair of bevel reads as a solid; more than that eats a short bar's height. */
  bevelSize?: number;
  bevelSmoothness?: number;
  /** `[width, depth]` in the box's own units. */
  barSize?: number | [number, number];
  /** A real zero still draws a tile: it is a figure the file asserted, not an absence. */
  minHeight?: number;
  animationDurationUpdate?: number;
}

/**
 * A figure written ON a 3D bar — the hovered one, which is the only case the app uses.
 *
 * It is not `ChartLabel`: `echarts-gl` nests every type property under `textStyle` and draws the
 * label in its own box, so the two shapes have almost nothing in common but the name. And it is not
 * optional to configure: left alone, gl prints the raw datum, which is the one figure in the app
 * that would come out as «39684.6195…» instead of as money.
 */
export interface Chart3DLabel {
  show?: boolean;
  distance?: number;
  formatter?: (param: Chart3DParam) => string;
  textStyle?: ChartTextStyle & {
    backgroundColor?: string;
    borderColor?: string;
    borderWidth?: number;
    borderRadius?: number;
    padding?: [number, number];
  };
}

/** What a 3D tooltip's formatter receives: `value` is the whole triple, not a scalar. */
export interface Chart3DParam {
  seriesName?: string;
  name: string;
  value: [number, number, number];
  marker?: string;
}

/** The house tooltip, in 3D: `confine` for the same reason as everywhere else — `ChartCard` is an
 *  `overflow-hidden`, and an unconfined box is CUT at the card's edge. */
export interface Chart3DTooltip {
  trigger?: "item";
  backgroundColor?: string;
  borderColor?: string;
  borderWidth?: number;
  padding?: number | number[];
  textStyle?: ChartTextStyle;
  confine?: boolean;
  formatter?: (param: Chart3DParam) => string;
}
