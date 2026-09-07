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
 * swept over `u` — and `u` is NOT only the arc. **A wedge is a closed solid, and the two faces of
 * its radial cut are the first and last bands of the sweep** (`CAP_STEPS`), drawn at a fixed angle
 * while the cross-section grows out of its own centre. Swept over the arc alone the wedge was a tube
 * OPEN at both ends: the gap between two rubros showed the stage behind the ring instead of the side
 * of a piece, and turned even slightly the whole rosca read as hollow shells laid apart — which is
 * the one thing this drawing is not for. The four corners land on WHOLE steps of `v` on purpose, and
 * how wide the fold at each of them comes out is `PROFILE_STEP`'s business.
 *
 * The gap between one wedge and the next is angular and real: the arcs stop short of each other, so
 * what separates two slices is a CUT —the neighbour's lit face— and not a stroke over them. It is
 * kept to the thinnest line that reads as one: a wedge is already bounded by its own walls, and a
 * wider channel stops being a pie divided and becomes a set of pieces laid apart.
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
 * onto the axis and the normals there stop meaning anything. What sets it is that **the hole is a
 * hole THROUGH the ring**: nothing is drawn under it, so whatever it spans is the stage seen through
 * the middle of the reading. At 0.46 and then at 0.28 that was a black lens the drawing was built
 * around. Here the camera's own elevation closes it — a wedge stands `WEDGE_HEIGHT` tall, and at the
 * `alpha` this opens at the near inner wall covers almost the whole opening, so what is left of the
 * hole is a hub and not a void.
 */
const INNER_RADIUS = 0.2;
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
/**
 * The bands of `u` each RADIAL CUT is given. The face is drawn at a fixed angle, so it costs no arc
 * and no width: what grows across these steps is the cross-section itself, out of its own centre.
 * Two and not one because the ring where the cap meets the body is SHARED, and gl averages the
 * normals it computes there — with a single band that average was the whole cap, and the cut came
 * out domed instead of flat.
 */
const CAP_STEPS = 2;
/**
 * How finely the cross-section is sampled. It is NOT a smoothness knob: the four corners land on
 * whole steps at any of these values, and what the step decides is how WIDE the fold is. gl averages
 * the normal of every vertex over the faces that meet it, so the corner's own normal is the bisector
 * and the shading walks from wall to top across the ONE quad on each side of it. At a quarter that
 * quad was a fourth of the face and the ring came out domed — a torus with a sheen sweeping over it
 * instead of a top face and a wall. At a sixteenth the same fold is a chamfer: it still catches
 * `CHART_STAGE_LIGHT`'s highlight, which is what an edge is drawn with here, and the faces either
 * side of it read flat.
 */
const PROFILE_STEP = 1 / 16;
/**
 * The stage's material, with the specular lobe WIDENED for this shape and nothing else touched.
 *
 * `CHART_STAGE_MATERIAL`'s roughness is measured on a BAR, whose faces are small, axis-aligned and
 * never square to the mirror direction — its camera does not turn. Here the top of a wedge is a wide
 * flat face and the camera turns all the way around it, so at some angles it lands exactly in that
 * lobe: `pow(8192, 1 - 0.42)` is an exponent of 187, and at its peak the highlight came out several
 * times over white. Half the ring bleached and the rubros lost the one thing that names them.
 * Widening the lobe keeps the chamfer lit —which is what draws the edge— and puts the peak back
 * under the fill.
 */
const PIE_MATERIAL = { ...CHART_STAGE_MATERIAL, roughness: 0.62 };
/** The centre of the cross-section: where a cap closes on itself, and what the shrink is measured to. */
const MID_RADIUS = (INNER_RADIUS + OUTER_RADIUS) / 2;
const MID_HEIGHT = WEDGE_HEIGHT / 2;

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
 * One slice as a CLOSED wedge. `u` walks the slice in STEPS —not in radians— because the sweep is
 * not only the arc: the first and last bands of `u` are the two faces of the RADIAL CUT, and they
 * are drawn at a fixed angle while the cross-section grows out of its own centre. `v` walks that
 * cross-section, the one drawn in this file's header, with a step of a quarter so the four corners
 * land on samples and stay corners.
 *
 * Without those two bands the wedge was a tube open at both ends, and the gap between one slice and
 * the next was a WINDOW: what showed between two rubros was the stage behind the ring, not the side
 * of a piece. Turned even slightly the ring came apart — every slice hollow and each one floating
 * apart from its neighbours. The cap costs two bands of `u` and closes the solid.
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
  const arcSteps = Math.max(6, Math.ceil(span / ARC_STEP));
  const steps = arcSteps + CAP_STEPS * 2;
  // The step is ONE: `u` is an index into the sweep and the angle is derived from it below, which is
  // what lets the two caps live in the same surface as the body without a fraction to round.
  const angleAt = (u: number) => {
    if (u <= CAP_STEPS) return from;
    if (u >= steps - CAP_STEPS) return to;
    return from + ((u - CAP_STEPS) / arcSteps) * span;
  };
  // How much of the cross-section is drawn at this step: 1 along the whole body, and along a cap it
  // opens from 0 —the section's own centre, where the face closes on itself— out to the full profile.
  const scaleAt = (u: number) => {
    if (u <= CAP_STEPS) return u / CAP_STEPS;
    if (u >= steps - CAP_STEPS) return (steps - u) / CAP_STEPS;
    return 1;
  };

  return {
    type: "surface",
    id: slice.id,
    name: slice.label,
    parametric: true,
    parametricEquation: {
      u: { min: 0, max: steps, step: 1 },
      v: { min: 0, max: 4, step: PROFILE_STEP },
      x: (u, v) => radius(radiusAt(v), scaleAt(u)) * Math.cos(angleAt(u)),
      y: (u, v) => radius(radiusAt(v), scaleAt(u)) * Math.sin(angleAt(u)),
      z: (u, v) => MID_HEIGHT + (heightAt(v) - MID_HEIGHT) * scaleAt(u),
    },
    shading: "realistic",
    realisticMaterial: PIE_MATERIAL,
    itemStyle: { color: stageSliceColor(slice.color) },
    // gl's wireframe draws the PARAMETRIC grid, so on a wedge it comes out as radial lines combing
    // the top face. What separates one slice from the next here is the gap, which is real geometry.
    wireframe: { show: false },
  };
}

/** The cross-section's radius at `v`, shrunk toward the section's centre by a cap's `scale`. */
function radius(at: number, scale: number): number {
  return MID_RADIUS + (at - MID_RADIUS) * scale;
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
