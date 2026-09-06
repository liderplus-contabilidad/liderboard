/**
 * The annex's `rosca` shape — the SAME doughnut of the flat reading, given a body on the stage.
 *
 * **Read this before touching it: an angle in perspective is not the angle it represents.** A pie is
 * read by comparing angles, and a camera tilted over one makes the near slices subtend more of the
 * screen than the far ones — the distortion falls exactly on the encoding. That is why this shape is
 * an ADDITION and never a replacement: «Pastel» stays one click away, the card keeps the table twin
 * with every figure, and the camera opens HIGH —near plan— which is what keeps the top face, where
 * the angles live, close to true. Read it for the shape of the split; check a figure in the table.
 *
 * `echarts-gl` has no pie, so each slice is a parametric SURFACE swept from one cross-section:
 *
 *     v: 0 ─ 1        inner wall, rising          r = r0,           z = 0 → h
 *        1 ─ 2        the top face                r = r0 → r1,      z = h
 *        2 ─ 3        outer wall, falling         r = r1,           z = h → 0
 *        3 ─ 4        the floor, closing back     r = r1 → r0,      z = 0
 *
 * swept over `u`, the slice's own arc. The four corners land on WHOLE steps on purpose: gl averages
 * the normals it computes, so a fold placed between two samples comes out rounded and the wedge
 * stops having edges — which is the one thing this drawing is for.
 *
 * The gap between one wedge and the next is angular and real: the arcs stop short of each other, so
 * what separates two slices is the stage showing through and not a stroke over them. It is kept to
 * the thinnest line that reads as a cut — each wedge already has its own two lit walls, and a wider
 * channel stops being a pie divided and becomes a set of pieces laid apart.
 */
import {
  CHART_FONT,
  CHART_STAGE,
  CHART_STAGE_LIGHT,
  CHART_STAGE_MATERIAL,
  CHART_STAGE_SKY,
  stageSliceColor,
} from "@/lib/charts/palette";
import type {
  Chart3DOption,
  Chart3DParam,
  Chart3DSurfaceSeries,
  ChartAxis3D,
} from "@/lib/charts/types";
import { formatPercent } from "@/lib/format";
import { formatChartValue, type ChartUnit } from "./option";

/** A ring seen from above needs its height, and the legend below it. */
export const SOLID_PIE_HEIGHT = 440;

/**
 * The centre. It is NOT the flat shape's — that one is a whole pie (`radius: ["0%", "74%"]`) with no
 * hole at all — and it is not decoration either: at r = 0 the inner wall of every wedge collapses
 * onto the axis and the normals there stop meaning anything. This is the smallest centre that keeps
 * each wedge a solid with four walls, and it was 0.46 before, which read as a void the drawing was
 * built around rather than as the middle of a pie.
 */
const INNER_RADIUS = 0.28;
const OUTER_RADIUS = 1;
/** How much of the ring's radius the wedge stands up. Enough to be a body, not enough to be a wall. */
const WEDGE_HEIGHT = 0.42;
/**
 * The stage seen between two slices, in radians. What it has to be is the THINNEST line that still
 * reads as a cut — a wedge is already bounded by its own two lit walls, so the gap is only there to
 * say the walls belong to different slices. At 0.016 it was a wide dark channel and the pie read as
 * a set of pieces laid apart instead of a whole that was divided.
 */
const SLICE_GAP = 0.006;
/** An arc is sampled at most this coarsely; below it a wedge's outer wall reads as a polygon. */
const ARC_STEP = 0.055;

export interface SolidPieSlice {
  id: string;
  label: string;
  value: number;
  /** Its share of the whole, 0–1. The angle is derived from this and never from the value. */
  share: number;
  /** The flat shape's colour; `stageSliceColor` translates it by slot. */
  color: string;
}

export function solidPieOption(
  slices: readonly SolidPieSlice[],
  context: { unit?: ChartUnit } = {},
): Chart3DOption {
  const unit = context.unit ?? "moneda";
  const drawn = slices.filter((slice) => slice.share > 0);

  // Clockwise from twelve o'clock, which is where the flat doughnut starts and turns: the two shapes
  // have to put the same slice in the same place or they stop being one reading in two bodies.
  let cursor = Math.PI / 2;
  const series: Chart3DSurfaceSeries[] = drawn.map((slice) => {
    const sweep = slice.share * Math.PI * 2;
    const end = cursor - sweep;
    // Half the gap off each side, and never more than a FIFTH of the slice: a 0.4 % line would
    // otherwise be gap on both sides and almost nothing in between, which is the case the cap is for
    // — the annex's tail is made of exactly those.
    const gap = Math.min(SLICE_GAP, sweep / 5);
    const from = end + gap / 2;
    const to = cursor - gap / 2;
    cursor = end;
    return wedge(slice, from, to);
  });

  return {
    animationDuration: 320,
    textStyle: { fontFamily: CHART_FONT },
    legend: {
      show: true,
      data: drawn.map((slice) => slice.label),
      type: "scroll",
      top: 6,
      icon: "roundRect",
      itemWidth: 10,
      itemHeight: 10,
      itemGap: 14,
      textStyle: { color: CHART_STAGE.inkMuted, fontSize: 11.5 },
    },
    grid3D: {
      // The box is HIDDEN, axes and planes with it. A ring has nothing to measure along three
      // rulers, and `grid3D`'s default would draw them around it saying nothing.
      show: false,
      // Width and depth EQUAL, over the same symmetric range: a box wider than it is deep turns the
      // circle into an ellipse, and an ellipse read as a pie is a second distortion on top of the
      // one perspective already costs.
      boxWidth: 150,
      boxDepth: 150,
      boxHeight: 150 * WEDGE_HEIGHT,
      environment: CHART_STAGE_SKY,
      light: CHART_STAGE_LIGHT,
      viewControl: {
        // HIGH, and that is the mitigation and not a taste: near plan the top face keeps the angles
        // close to what they represent, and the body is read on the walls. Dropped to the skyline's
        // own elevation the front slices swell and the reading stops being true.
        alpha: 58,
        beta: 0,
        distance: 208,
        minDistance: 160,
        maxDistance: 320,
        panSensitivity: 0,
        rotateSensitivity: 1,
        zoomSensitivity: 1,
        damping: 0.85,
        animation: false,
      },
    },
    // Three value axes over the SAME symmetric range, so the ring is round and centred. They draw
    // nothing —`show` is off on the box— and exist only to place what is swept in them.
    xAxis3D: hiddenAxis(-1, 1),
    yAxis3D: hiddenAxis(-1, 1),
    zAxis3D: hiddenAxis(0, 1),
    tooltip: {
      // A surface has no data items of its own, so what identifies the slice is the SERIES NAME —
      // which is why every wedge carries its label as its name and the lookup below is by label.
      trigger: "item",
      backgroundColor: CHART_STAGE.panel,
      borderColor: CHART_STAGE.panelBorder,
      borderWidth: 1,
      padding: [8, 10],
      textStyle: { color: CHART_STAGE.ink, fontSize: 12 },
      confine: true,
      formatter: (param: Chart3DParam) => {
        const slice = drawn.find((entry) => entry.label === param.seriesName);
        if (slice === undefined) {
          return "";
        }
        return [
          `<div style="font-weight:600;margin-bottom:4px">${slice.label}</div>`,
          `<div><b>${formatChartValue(slice.value, unit)}</b>`,
          ` · ${formatPercent(slice.share * 100)}</div>`,
        ].join("");
      },
    },
    series,
  };
}

/**
 * One slice as a closed wedge. `u` is its arc and `v` walks the cross-section drawn in this file's
 * header; the step of `v` is a quarter so the four corners land on samples and stay corners.
 */
function wedge(slice: SolidPieSlice, from: number, to: number): Chart3DSurfaceSeries {
  const radiusAt = (v: number) => {
    if (v <= 1) return INNER_RADIUS;
    if (v <= 2) return INNER_RADIUS + (v - 1) * (OUTER_RADIUS - INNER_RADIUS);
    if (v <= 3) return OUTER_RADIUS;
    return OUTER_RADIUS - (v - 3) * (OUTER_RADIUS - INNER_RADIUS);
  };
  const heightAt = (v: number) => {
    if (v <= 1) return v * WEDGE_HEIGHT;
    if (v <= 2) return WEDGE_HEIGHT;
    if (v <= 3) return (3 - v) * WEDGE_HEIGHT;
    return 0;
  };
  const span = to - from;
  // At least six segments even on a hairline slice, so its outer wall is an arc and not a chord.
  const steps = Math.max(6, Math.ceil(span / ARC_STEP));

  return {
    type: "surface",
    id: slice.id,
    name: slice.label,
    parametric: true,
    parametricEquation: {
      u: { min: from, max: to, step: span / steps },
      v: { min: 0, max: 4, step: 0.25 },
      x: (u, v) => radiusAt(v) * Math.cos(u),
      y: (u, v) => radiusAt(v) * Math.sin(u),
      z: (_u, v) => heightAt(v),
    },
    shading: "realistic",
    realisticMaterial: CHART_STAGE_MATERIAL,
    itemStyle: { color: stageSliceColor(slice.color) },
    // gl's wireframe draws the PARAMETRIC grid, so on a wedge it comes out as radial lines combing
    // the top face. What separates one slice from the next here is the gap, which is real geometry.
    wireframe: { show: false },
  };
}

/** A value axis that places things and draws nothing. */
function hiddenAxis(min: number, max: number): ChartAxis3D {
  return {
    type: "value",
    name: "",
    min,
    max,
    axisLine: { show: false },
    axisTick: { show: false },
    splitLine: { show: false },
    axisLabel: { show: false },
  };
}
