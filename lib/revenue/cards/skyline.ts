/**
 * The comparison's `skyline` shape — the SAME years of the flat reading, each given its own row of a
 * depth axis. Split off from `comparison.ts` because it is a whole second renderer's contract
 * (`echarts-gl`, a camera, three axes) and nothing else in the module speaks it.
 */
import {
  CHART_FONT,
  CHART_STAGE,
  CHART_STAGE_LIGHT,
  CHART_STAGE_MATERIAL,
  CHART_STAGE_SKY,
  stageColor,
} from "@/lib/charts/palette";
import type { Chart3DOption, Chart3DParam, Chart3DSeries, ChartAxis3D } from "@/lib/charts/types";
import { formatCurrency } from "@/lib/format";
import type { RevenueYearReading } from "../derive";
import { legendFor, money, tooltipChrome, yearColor } from "./chrome";

/** A skyline is read from above and needs the room a flat plot does not. */
export const SKYLINE_HEIGHT = 360;

/**
 * What the third axis buys, and the only reason it is here: every year now rests on ZERO. Drawn as
 * lines on one plane, a year is read against the line above it — and the question a comparison is
 * for is «cuánto vendió abril de 2026 CONTRA abril de 2024», which is a comparison of heights from a
 * common floor, not of distances between curves.
 *
 * Three decisions keep it a reading and not an effect, and they are «Ventas por servicio»' same three:
 *
 * - **One rig, and it is what draws the EDGE.** Flat shading was the first rule here and it left
 *   the rows reading as a single continuous surface. `CHART_STAGE_LIGHT` models the solid without
 *   repainting it: the top face keeps the fill and the face turned away falls to a measured 0.72.
 * - **A month that never arrived produces NO datum**, so the floor is empty there; a loaded month
 *   that sold nothing gets `minHeight`, a tile flat on the floor. It is the only shape in the module
 *   that can DRAW the distinction the whole engine carries.
 * - **A long box against a shallow one.** Twelve months across and few years deep is what makes a
 *   horizon; a cube of equal sides is where the back row hides behind the front one.
 */
export function skylineOption(
  drawn: readonly RevenueYearReading[],
  drawnYears: readonly number[],
  axis: readonly number[],
  labels: readonly string[],
): Chart3DOption {
  // **The years go in ORDER: the oldest at the BACK, the most recent in front.** They were sorted by
  // their tallest bar —the taller at the back, so no bar hid the ones behind it— and the depth axis
  // read «2021 · 2026 · 2024 · 2022»: a reader looks for a year by its POSITION, and an axis that
  // shuffles them costs more than the occlusion it spared. `drawn` arrives chronological from
  // `derive.ts`, so depth is its index read from the far wall, and the axis —labelled front to
  // back— is the same list reversed. Colour and legend keep the same order, so a year's hue is the
  // same here, in the growth card and in the table.
  const depthOf = (year: number) =>
    drawn.length - 1 - drawn.findIndex((entry) => entry.year === year);
  const rows = drawn.map((entry) => String(entry.year)).reverse();

  // The box fills the CARD. Sized off the month count it stopped at 210 and left the reading in the
  // middle third of a wide card, with the camera far enough back to shrink it again; the floor of the
  // clamp is what keeps a three-month span from collapsing into a sliver.
  const boxWidth = clamp(labels.length * 20, 140, 260);
  const boxDepth = clamp(drawn.length * 19, 34, 95);
  // A bar takes little more than HALF its cell, and what it leaves is what separates one row from
  // the next. It was two thirds, and that gap closed up in perspective: what is seen between two
  // bars is not the gap but its projection, and the side face of the nearer one eats most of it.
  // Shading draws a bar's body; the gap is what draws that there are TWO of them.
  const barSize: [number, number] = [
    (boxWidth / Math.max(labels.length, 1)) * 0.52,
    (boxDepth / Math.max(drawn.length, 1)) * 0.52,
  ];

  const series: Chart3DSeries[] = drawn.map((entry) => ({
    type: "bar3D",
    id: `year-${entry.year}`,
    name: String(entry.year),
    shading: "realistic",
    realisticMaterial: CHART_STAGE_MATERIAL,
    // The year's colour ON THE STAGE, which is its own scale: `stageColor` translates by SLOT, so
    // the years keep their order and their distance — and each one is the same colour in every 3D
    // card, though not the one it wears on the white ones.
    itemStyle: { color: stageColor(yearColor(entry.year, drawnYears)) },
    // The bevel is the EDGE's surface: `CHART_STAGE_LIGHT`'s highlight has to land on something, and
    // a chamfer of a hair is a line one pixel wide that catches nothing. Wider than this and it starts
    // eating the height of the short bars, which are the ones this shape exists to make legible.
    bevelSize: 0.2,
    bevelSmoothness: 2,
    minHeight: 1.2,
    barSize,
    emphasis: {
      // NO `itemStyle` here, and that is the fix and not an omission: a `bar3D` is one merged mesh
      // with vertex colours, so gl reads only `color`/`opacity` and silently ignored the border
      // this used to declare. Left alone it lifts the fill itself — the same hue, plainly brighter,
      // which is what a hover is for. A second definition would only be a worse one.
      // `echarts-gl` writes the RAW datum on the hovered bar unless told otherwise, so the one
      // figure of this app that reached the screen as «39684.6195…» was this one. It goes through
      // the same formatter as every other amount —comma thousands, two decimals— and it is drawn on
      // the stage's own panel, which is the tooltip's chrome and not gl's default box.
      label: {
        show: true,
        formatter: (param) => money(param.value[2]),
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
    data: axis.flatMap((month, index) => {
      const value = entry.monthly[month];
      return value === null
        ? []
        : [
            {
              value: [index, depthOf(entry.year), value] as [number, number, number],
            },
          ];
    }),
  }));

  return {
    animationDuration: 320,
    textStyle: { fontFamily: CHART_FONT },
    // On the stage the legend goes to the TOP. The camera looks DOWN at the box, so the reading hangs
    // low in the frame and the empty sky is above it: anchored at the bottom the legend sat ON the
    // last months of the axis, and «Nov» and «Dic» were read through it.
    legend: { ...legendFor(true, CHART_STAGE.inkMuted), bottom: "auto", top: 6 },
    grid3D: {
      boxWidth,
      boxDepth,
      boxHeight: 82,
      // THE STAGE. `gl`'s own default is a pale gradient, and on it a bar had nothing but its own
      // fill to be found by: the short ones washed out and the tall ones read as holes in the card.
      // The sky lightens upward, so what is behind the BARS is the deepest end of it — see
      // `CHART_STAGE`, where every figure of this ground is measured.
      environment: CHART_STAGE_SKY,
      light: CHART_STAGE_LIGHT,
      axisLine: { lineStyle: { color: CHART_STAGE.axis, width: 1, type: "solid" } },
      splitLine: { lineStyle: { color: CHART_STAGE.grid, width: 1, type: "solid" } },
      axisPointer: { show: false },
      viewControl: {
        // It opens STILL, from above and slightly off to one side — the measured elevation, not a
        // taste: below the mid thirties the front face of a bar covers the gap that separates its row
        // from the next; well above it the drawing turns into a plan and the heights stop being
        // heights. `beta` stays small so the months run left to right, the direction a year is read in.
        alpha: 38,
        beta: 12,
        // Close enough that the wider box FILLS the card. It is the other half of `boxWidth`: a
        // bigger box seen from further away is the same picture, and at 195 the reading sat in a
        // third of the width with the rest empty.
        distance: 170,
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
    xAxis3D: categoryAxis3D([...labels]),
    yAxis3D: categoryAxis3D(rows),
    zAxis3D: {
      type: "value",
      name: "",
      axisLine: { lineStyle: { color: CHART_STAGE.axis, width: 1, type: "solid" } },
      splitLine: { show: true, lineStyle: { color: CHART_STAGE.grid, width: 1, type: "solid" } },
      axisLabel: {
        color: CHART_STAGE.inkFaint,
        fontSize: 10.5,
        // Without cents, `currencyAxis`'s same rule: a scale is estimated against, not read off.
        formatter: (value) => formatCurrency(Number(value)),
      },
    },
    tooltip: {
      // The module's tooltip, in the stage's tones: it is drawn INSIDE the dark panel, and the white
      // box every other card uses would be a hole punched in the night.
      ...tooltipChrome("stage"),
      trigger: "item",
      formatter: (param: Chart3DParam) => {
        // The month comes from the datum's own X INDEX and not from `param.name`: in a 3D chart that
        // field carries the series, and the reader hovering a bar is asking which month it is.
        const head = labels[param.value[0]] ?? "";
        return `<div style="font-weight:600;margin-bottom:4px">${head}</div><div>${param.marker ?? ""} ${param.seriesName ?? ""}: <b>${money(param.value[2])}</b></div>`;
      },
    },
    series,
  };
}

/** A 3D category axis with the house chrome. `echarts-gl` labels its axes «X», «Y» and «Z» unless
 *  told otherwise, and the EXPLICIT empty name is what removes them. */
function categoryAxis3D(labels: string[]): ChartAxis3D {
  return {
    type: "category",
    data: labels,
    name: "",
    axisLine: { lineStyle: { color: CHART_STAGE.axis, width: 1, type: "solid" } },
    axisTick: { show: false },
    splitLine: { show: false },
    axisLabel: { color: CHART_STAGE.inkMuted, fontSize: 10.5 },
  };
}

/** Keeps a computed box side inside the range where the shape still reads. */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
