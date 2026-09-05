/**
 * The comparison's `skyline` shape — the SAME years of the flat reading, each given its own row of a
 * depth axis. Split off from `comparison.ts` because it is a whole second renderer's contract
 * (`echarts-gl`, a camera, three axes) and nothing else in the module speaks it.
 */
import { CHART_FONT, CHART_INK, CHART_LINES, CHART_SURFACE } from "@/lib/charts/palette";
import type { Chart3DOption, Chart3DParam, Chart3DSeries, ChartAxis3D } from "@/lib/charts/types";
import { formatCurrency } from "@/lib/format";
import type { RevenueYearReading } from "../derive";
import { legendFor, money, TOOLTIP_CHROME, yearColor } from "./chrome";

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
 * - **Flat shading, no light.** `colorForEntity` is IDENTITY here — the same hue this year wears in
 *   the growth card and in the table's dot. A lit face turns one colour into three and breaks that.
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
  // **The year with the TALLEST BAR goes at the BACK**, which is the only thing that makes a matrix
  // of bars in perspective legible: a bar hides the ones behind it.
  //
  // What decides that is the PEAK and never the total. Occlusion is a fact about heights, and the two
  // do not agree: 2026 is seven months, so its total is the lowest of the four while its abril
  // ($337,092.91) is the tallest bar on the board — sorted by total it landed in FRONT and buried the
  // three years behind it. The order of the COLOUR and of the legend is untouched: it stays
  // chronological, so a year's hue is the same here, in the growth card and in the table.
  const peakOf = (entry: RevenueYearReading) => {
    const heights = entry.monthly.filter((value): value is number => value !== null);
    return heights.length > 0 ? Math.max(...heights) : 0;
  };
  const byHeight = [...drawn].sort((a, b) => peakOf(b) - peakOf(a));
  const depthOf = (year: number) => byHeight.findIndex((entry) => entry.year === year);
  // The rows read front-to-back, so the axis labels are the reverse of the depth order.
  const rows = byHeight.map((entry) => String(entry.year)).reverse();

  // The box fills the CARD. Sized off the month count it stopped at 210 and left the reading in the
  // middle third of a wide card, with the camera far enough back to shrink it again; the floor of the
  // clamp is what keeps a three-month span from collapsing into a sliver.
  const boxWidth = clamp(labels.length * 20, 140, 260);
  const boxDepth = clamp(drawn.length * 19, 34, 95);
  // A bar takes TWO THIRDS of its cell, and the third it leaves is what separates one row from the
  // next: filling the cell, the rows touch and read as a single continuous surface.
  const barSize: [number, number] = [
    (boxWidth / Math.max(labels.length, 1)) * 0.66,
    (boxDepth / Math.max(drawn.length, 1)) * 0.66,
  ];

  const series: Chart3DSeries[] = drawn.map((entry) => ({
    type: "bar3D",
    id: `year-${entry.year}`,
    name: String(entry.year),
    shading: "color",
    itemStyle: { color: yearColor(entry.year, drawnYears) },
    // A hair of bevel reads as a solid; more eats the height of the short bars, which are the ones
    // this shape exists to make legible.
    bevelSize: 0.12,
    bevelSmoothness: 2,
    minHeight: 1.2,
    barSize,
    emphasis: {
      itemStyle: { borderColor: CHART_INK.strong, borderWidth: 1 },
      // `echarts-gl` writes the RAW datum on the hovered bar unless told otherwise, so the one
      // figure of this app that reached the screen as «39684.6195…» was this one. It goes through
      // the same formatter as every other amount —comma thousands, two decimals— and it is drawn on
      // the card's own surface, which is the tooltip's chrome and not gl's default box.
      label: {
        show: true,
        formatter: (param) => money(param.value[2]),
        textStyle: {
          color: CHART_INK.strong,
          fontSize: 11.5,
          fontFamily: CHART_FONT,
          backgroundColor: CHART_SURFACE,
          borderColor: CHART_LINES.axis,
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
              value: [index, drawn.length - 1 - depthOf(entry.year), value] as [
                number,
                number,
                number,
              ],
            },
          ];
    }),
  }));

  return {
    animationDuration: 320,
    textStyle: { fontFamily: CHART_FONT },
    legend: legendFor(true),
    grid3D: {
      boxWidth,
      boxDepth,
      boxHeight: 82,
      // The card's own surface: the default paints a gradient, which shows as a seam against a white
      // card and puts a colour behind the bars that no token accounts for.
      environment: CHART_SURFACE,
      light: { main: { intensity: 0, shadow: false }, ambient: { intensity: 1 } },
      axisLine: { lineStyle: { color: CHART_LINES.axis, width: 1, type: "solid" } },
      splitLine: { lineStyle: { color: CHART_LINES.grid, width: 1, type: "solid" } },
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
      axisLine: { lineStyle: { color: CHART_LINES.axis, width: 1, type: "solid" } },
      splitLine: { show: true, lineStyle: { color: CHART_LINES.grid, width: 1, type: "solid" } },
      axisLabel: {
        color: CHART_INK.faint,
        fontSize: 10.5,
        // Without cents, `currencyAxis`'s same rule: a scale is estimated against, not read off.
        formatter: (value) => formatCurrency(Number(value)),
      },
    },
    tooltip: {
      ...TOOLTIP_CHROME,
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
    axisLine: { lineStyle: { color: CHART_LINES.axis, width: 1, type: "solid" } },
    axisTick: { show: false },
    splitLine: { show: false },
    axisLabel: { color: CHART_INK.muted, fontSize: 10.5 },
  };
}

/** Keeps a computed box side inside the range where the shape still reads. */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
