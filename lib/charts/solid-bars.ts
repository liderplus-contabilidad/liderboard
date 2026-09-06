/**
 * The SOLID BARS of the stage — the shape a flat bar chart takes when it is given a body.
 *
 * It lives in `lib/charts/` and not in a module because three cards of two modules draw it —the
 * expense annex, «Composición por servicio» and «Concentración por pagador»— and a fourth would
 * make it four. It is the palette's own case: what is shared is the shape and the chrome, never the
 * domain, so what comes in is already labels, values and colours, and the two formatters are
 * handed over by whoever owns the figures.
 *
 * **It is not a third axis.** With one row the depth is the thickness of the bar and nothing else;
 * with several it carries what the flat chart drew as GROUPED series — a year per row — which is
 * the same variable the flat legend names. Nothing is encoded here that the flat shape did not
 * already encode.
 *
 * The two skylines (`lib/sales/cards.ts`, `lib/revenue/cards/skyline.ts`) are deliberately NOT
 * built on this: their depth axis carries a reading of its own —every service, every year, resting
 * on zero— and their camera and box are measured for that. This one is a frieze.
 *
 * Three decisions keep it a reading and not an effect, and they are the skylines' same three:
 *
 * - **The rig is the stage's**, `CHART_STAGE_LIGHT` with `CHART_STAGE_MATERIAL` over a bevel wide
 *   enough to carry the highlight. Without it a row of solids is one continuous ribbon: `bar3D`
 *   renders a single merged mesh and has no border to fall back on.
 * - **The figure is NOT written on every bar.** A flat card can put it beside each row; fifteen
 *   labels floating in perspective land at fifteen depths and stop lining up with anything. It goes
 *   on the hovered bar, and the flat shape is one click away.
 * - **A bar takes little more than HALF its cell.** What it leaves is the gap, and the gap is what
 *   says there are two of them — in perspective the side face of the nearer bar eats most of it.
 */
import {
  CHART_FONT,
  CHART_STAGE,
  CHART_STAGE_LIGHT,
  CHART_STAGE_MATERIAL,
  CHART_STAGE_SKY,
} from "./palette";
import type { Chart3DOption, Chart3DParam, Chart3DSeries, ChartAxis3D } from "./types";

/** A solid is read from above and needs the room a flat plot does not. */
export const SOLID_BARS_HEIGHT = 440;

/**
 * The two BODIES a flat bar card can take. It is here and not in a module because five cards of two
 * modules offer it, and «what the card is drawn as» is a fact about the stage, not about sales or
 * about ingresos.
 */
export type SolidView = "plano" | "solido";

/** What the SCREEN opens those cards in; paper has no shapes to choose from. */
export const SCREEN_SOLID_VIEW: SolidView = "plano";

/** Past this many characters a label runs into the box; the tooltip carries the name whole. */
const LABEL_CAP = 12;
/** A bar's share of its cell. The rest is the gap — see the note in this file's header. */
const CELL_FILL = 0.52;

/** One row of the depth axis: a whole chart when there is one, a grouped series when there are more. */
export interface SolidBarRow {
  id: string;
  /** What the legend calls it. Only drawn when there is more than one row. */
  name: string;
  /** One per column, in column order. `null` is NOT a zero — it draws no bar at all. */
  values: readonly (number | null)[];
  /** The row's fill. Ignored where `colors` gives the column its own. */
  color: string;
}

export interface SolidBarsInput {
  /** The category axis, in drawn order. */
  columns: readonly string[];
  rows: readonly SolidBarRow[];
  /**
   * A fill PER COLUMN, for the single-row case where the colour is the entity's identity and not
   * the row's. With several rows it is ignored: there the colour belongs to the row.
   */
  colors?: readonly string[];
  /** With cents — this is the figure someone checks against a sheet. */
  formatValue: (value: number) => string;
  /** Without them: an axis is estimated against, not read off. */
  formatAxis: (value: number) => string;
  /** Hung under the column's name in the tooltip, e.g. an account code. */
  subLabels?: readonly (string | undefined)[];
}

export function solidBarsOption(input: SolidBarsInput): Chart3DOption {
  const { columns, rows, colors, formatValue, formatAxis, subLabels } = input;
  const comparing = rows.length > 1;

  // The box FILLS the card, and grows with what it holds: an annex is anything from two rubros to
  // eighteen, and the floor of the clamp is what keeps a breakdown of three from becoming a sliver.
  const boxWidth = clamp(columns.length * 19, 130, 235);
  // With ONE row the depth is a bar's thickness. With several it is the rows themselves, and it grows
  // like the skylines' — few rows deep against many columns across is what makes a frieze instead of
  // a cube where the back row hides behind the front one.
  const boxDepth = comparing ? clamp(rows.length * 19, 34, 95) : 34;
  // The camera follows the BOX. A fixed distance is the same picture only for a fixed box: with five
  // columns the reading sat in a fifth of a wide card with the rest of the stage empty, and with
  // eighteen it filled it. It moves between the two ends of `boxWidth` and no further — closer than
  // this the perspective starts leaning the outer bars, and further it is the empty card again.
  const distance = 150 + ((boxWidth - 130) / (235 - 130)) * 30;
  const barSize: [number, number] = [
    (boxWidth / Math.max(columns.length, 1)) * CELL_FILL,
    (boxDepth / rows.length) * (comparing ? CELL_FILL : 0.7),
  ];

  // Front to back: the first row is the one nearest the reader, which is the order the flat legend
  // reads in. The axis labels are the reverse, because the depth axis is drawn back to front.
  const series: Chart3DSeries[] = rows.map((row, depth) => ({
    type: "bar3D",
    id: row.id,
    name: row.name,
    shading: "realistic",
    realisticMaterial: CHART_STAGE_MATERIAL,
    itemStyle: { color: row.color },
    // The bevel is the EDGE's surface: `CHART_STAGE_LIGHT`'s highlight has to land on something, and
    // a chamfer of a hair is a line one pixel wide that catches nothing.
    bevelSize: 0.2,
    bevelSmoothness: 2,
    // A real zero still draws a tile: it is a figure the data asserted, not an absence.
    minHeight: 1.2,
    barSize,
    emphasis: {
      // NO `itemStyle`: gl reads only `color`/`opacity` on a merged mesh and lifts the fill itself —
      // the same hue, plainly brighter, which is what a hover is for.
      label: {
        show: true,
        formatter: (param) => formatValue(param.value[2]),
        textStyle: {
          color: CHART_STAGE.ink,
          fontSize: 11.5,
          fontFamily: CHART_FONT,
          backgroundColor: CHART_STAGE.panel,
          borderColor: CHART_STAGE.panelBorder,
          borderWidth: 1,
          borderRadius: 4,
          padding: [4, 6],
        },
      },
    },
    data: row.values.flatMap((value, column) =>
      value === null
        ? []
        : [
            {
              value: [column, rows.length - 1 - depth, value] as [number, number, number],
              // With one row the colour is the COLUMN's, because there it is the entity's identity —
              // the same blue that service wears in the table's dot. With several it is the row's.
              ...(comparing || colors === undefined
                ? {}
                : { itemStyle: { color: colors[column] ?? row.color } }),
            },
          ],
    ),
  }));

  return {
    animationDuration: 320,
    textStyle: { fontFamily: CHART_FONT },
    // On the stage the legend goes to the TOP. The camera looks DOWN at the box, so the reading hangs
    // low in the frame and the empty sky is above it; anchored at the bottom it sat on the last
    // labels of the axis.
    legend: {
      show: comparing,
      data: rows.map((row) => row.name),
      type: "scroll",
      bottom: "auto",
      top: 6,
      icon: "roundRect",
      itemWidth: 10,
      itemHeight: 10,
      itemGap: 14,
      textStyle: { color: CHART_STAGE.inkMuted, fontSize: 11.5 },
    },
    grid3D: {
      boxWidth,
      boxDepth,
      boxHeight: 78,
      // THE STAGE. `gl`'s own default is a pale gradient, and on it a solid has nothing but its own
      // fill to be found by. The sky lightens upward, so what is behind the BARS is its deepest end.
      environment: CHART_STAGE_SKY,
      light: CHART_STAGE_LIGHT,
      axisLine: { lineStyle: { color: CHART_STAGE.axis, width: 1, type: "solid" } },
      splitLine: { lineStyle: { color: CHART_STAGE.grid, width: 1, type: "solid" } },
      axisPointer: { show: false },
      viewControl: {
        // It opens STILL. `beta` is NEGATIVE on purpose: it swings the value axis to the far side,
        // away from the tallest bar — the reading is ordered largest first, so at a positive beta the
        // scale's own labels were written across the first column.
        alpha: 33,
        beta: -15,
        distance,
        minDistance: 130,
        maxDistance: 330,
        // Panning off: the box is the whole reading, and dragging it out of frame has no way back
        // short of reloading. Rotating and zooming stay.
        panSensitivity: 0,
        rotateSensitivity: 1,
        zoomSensitivity: 1,
        damping: 0.85,
        animation: false,
      },
    },
    xAxis3D: categoryAxis3D(columns, { truncate: true }),
    // With ONE row the depth axis carries nothing: an unnamed row, which is the whole difference
    // between this shape and a skyline. Its line stays SHOWN either way — `gl` builds
    // `axisLineCoords` only while drawing an axis line and reads them on every camera change, so
    // hidden, the first frame throws and the box comes up empty.
    yAxis3D: categoryAxis3D(comparing ? rows.map((row) => row.name).reverse() : [""], {
      truncate: comparing,
    }),
    zAxis3D: {
      type: "value",
      name: "",
      axisLine: { lineStyle: { color: CHART_STAGE.axis, width: 1, type: "solid" } },
      splitLine: { show: true, lineStyle: { color: CHART_STAGE.grid, width: 1, type: "solid" } },
      axisLabel: {
        color: CHART_STAGE.inkFaint,
        fontSize: 10.5,
        formatter: (value) => formatAxis(Number(value)),
      },
    },
    tooltip: {
      // The card's tooltip, in the stage's tones: it is drawn INSIDE the dark panel, and the white
      // box the rest of the app uses would be a hole punched in the night.
      trigger: "item",
      backgroundColor: CHART_STAGE.panel,
      borderColor: CHART_STAGE.panelBorder,
      borderWidth: 1,
      padding: [8, 10],
      textStyle: { color: CHART_STAGE.ink, fontSize: 12 },
      confine: true,
      formatter: (param: Chart3DParam) => {
        // The column comes from the datum's own X INDEX and not from `param.name`: in a 3D chart that
        // field carries the SERIES. It is also where the whole name is read, since the axis only
        // fits a truncated one.
        const column = columns[param.value[0]];
        if (column === undefined) {
          return "";
        }
        const sub = subLabels?.[param.value[0]];
        return [
          `<div style="font-weight:600;margin-bottom:4px">${column}</div>`,
          sub ? `<div style="opacity:.7;margin-bottom:4px">${sub}</div>` : "",
          comparing ? `<div style="opacity:.7">${param.seriesName ?? ""}</div>` : "",
          `<div><b>${formatValue(param.value[2])}</b></div>`,
        ].join("");
      },
    },
    series,
  };
}

/** A 3D category axis with the house chrome. `echarts-gl` labels its axes «X», «Y» and «Z» unless
 *  told otherwise, and the EXPLICIT empty name is what removes them. */
function categoryAxis3D(labels: readonly string[], options: { truncate: boolean }): ChartAxis3D {
  return {
    type: "category",
    data: [...labels],
    name: "",
    axisLine: { lineStyle: { color: CHART_STAGE.axis, width: 1, type: "solid" } },
    axisTick: { show: false },
    splitLine: { show: false },
    axisLabel: {
      color: CHART_STAGE.inkMuted,
      fontSize: 10.5,
      // `width`/`overflow` are a 2D grid's tools and the 3D one ignores them, so the cut is made
      // here, in the string. An ellipsis is what says the name goes on — the tooltip carries it
      // whole and the table twin lists every row uncut.
      ...(options.truncate
        ? {
            formatter: (value: string | number) => {
              const text = String(value);
              return text.length > LABEL_CAP ? `${text.slice(0, LABEL_CAP - 1)}…` : text;
            },
          }
        : {}),
    },
  };
}

/** Keeps a computed box side inside the range where the shape still reads. */
function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
