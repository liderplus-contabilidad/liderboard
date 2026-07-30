/**
 * The chart mark system. No option builder writes a hex of its own, so the day the brand moves
 * this file is the only edit.
 *
 * **The order of the slots IS the safety mechanism, not a preference.** The eight hexes were
 * picked as a SEQUENCE: slots 1–3 stay apart under deuteranopia and protanopia, and every
 * further slot was chosen against all the previous ones. A chart of four colors is safe
 * *because* it uses the first four — which is why `colorForEntity` is the only way in.
 *
 * **Slot 1 is not `--color-brand`.** The navy `#1e3a5f` sits below the luminance band a
 * categorical palette needs: against the white `surface` it reads as text rather than as a fill.
 * Slot 1 is a lighter step of that same family, so a chart still reads as the brand.
 *
 * The hexes mirror `app/globals.css`'s `@theme` on purpose — a renderer cannot consume a Tailwind
 * utility — and this is the single mirror point.
 */

/** The eight slots, in the order that makes them separable. Never re-sort, never cycle. */
export const CHART_PALETTE = [
  "#2b6cb0",
  "#eb6834",
  "#1baf7a",
  "#eda100",
  "#e87ba4",
  "#008300",
  "#4a3aa7",
  "#e34948",
] as const;

/** Lower than the engine's `MAX_SERIES` on purpose: a ninth color would land on top of one. */
export const CHART_MAX_SERIES = CHART_PALETTE.length;

/**
 * Exists so `colorForEntity` is total, NOT so a ninth series can be drawn: queries cap at
 * `CHART_MAX_SERIES`, so reaching this in a chart is a bug upstream showing itself.
 */
export const CHART_NEUTRAL = "#b4bec9";

/**
 * The color comes from the entity's stable position in the compared dimension, NEVER from its
 * index in the result: filtering one series out leaves every other one painted as it was.
 */
export function colorForEntity(entityId: string, order: readonly string[]): string {
  const slot = order.indexOf(entityId);
  if (slot < 0 || slot >= CHART_PALETTE.length) {
    return CHART_NEUTRAL;
  }
  return CHART_PALETTE[slot];
}

/**
 * A label NEVER takes the color of its series: that makes the text a second encoding of what the
 * mark already says. `onFill` is the exception, sitting on a saturated mark.
 */
export const CHART_INK = {
  strong: "#1e293b",
  muted: "#64748b",
  faint: "#94a3b8",
  onFill: "#ffffff",
} as const;

/** The surface a chart sits on; also the color painted into the gaps between fills. */
export const CHART_SURFACE = "#ffffff";

/** One recessive tone, continuous stroke — never dashed or dotted. */
export const CHART_LINES = {
  grid: "#edf1f5",
  axis: "#e5e9ee",
} as const;

/** Stroke weights and gaps shared by every mark. */
export const CHART_MARK = {
  /** Separation between stacked segments and contiguous bars, painted in the surface color. */
  gap: 2,
  /** Line series and reference marks. */
  lineWidth: 2,
  symbolSize: 6,
  barMaxWidth: 44,
  /** Rounded cap on the free end of a bar, anchored to the baseline. */
  radius: 4,
} as const;

/**
 * The SIGN of a variation, never a series color — a chart painting "serie 4" green teaches the
 * reader that green means good. Always shipped with an icon and the signed value.
 */
export const CHART_SIGN = {
  positive: "#16a34a",
  negative: "#dc2626",
} as const;

/** The `var()` resolves against `:root`, where `next/font` writes the generated family. */
export const CHART_FONT = "var(--font-ibm-plex-sans), system-ui, sans-serif";

/**
 * TWELVE hues for the twelve marks of ONE series — a bar per month, a bar per weekday — the way
 * `channelOption` already paints a bar per channel.
 *
 * It is a DECORATIVE set, and that is the whole difference from `CHART_PALETTE`. Those eight slots
 * encode IDENTITY and were sequenced to survive colour blindness, because telling two SERIES apart
 * depends on the colour alone. Here identity is on the axis: every bar is labelled with its month and
 * carries its figure, so the colour is not the reading — it keeps twelve bars from being a wall of one
 * tone. **Never use this set for series.**
 *
 * Muted on purpose (each hue mixed ~18 % toward a mid grey): twelve fully saturated bars side by side
 * are tiring to look at, and these are read for minutes at a time.
 *
 * What the validator says about this order, so nobody has to re-derive it: lightness band PASS (every
 * hue reads as a fill against white), chroma floor PASS (none of them reads grey), and the
 * NORMAL-VISION adjacent floor PASS — worst neighbouring pair ΔE 16.3, which is the check that matters
 * for «que varíe entre barras». Adjacent CVD separation does NOT clear (worst pair, teal↔rosa, ΔE 3.2
 * under protanopia): twelve colourblind-separable hues do not exist, which is exactly why the identity
 * set stops at eight. It is acceptable HERE and only here because a reader who cannot tell two of these
 * apart loses nothing — the month is written under the bar.
 *
 * The order alternates cool and warm families so neighbours differ; do not re-sort it.
 */
export const CHART_PERIOD_PALETTE = [
  "#3e74ab",
  "#dc7046",
  "#cd54a3",
  "#31aa7f",
  "#814bdd",
  "#dd9f1b",
  "#26a2da",
  "#d55756",
  "#6ea126",
  "#d980a1",
  "#1d968c",
  "#af5f22",
] as const;

/** The mark's own slot, by its place on the axis. A thirteenth is the neutral, never a new hue. */
export function colorForPeriod(index: number): string {
  return CHART_PERIOD_PALETTE[index] ?? CHART_NEUTRAL;
}

/**
 * NOT part of any categorical set: those slots exist to be told APART, this ramp exists to be read as
 * one quantity rising.
 *
 * ONE HUE, amarillo claro → ocre — a proper sequential scale, monotonic in lightness, so it survives
 * greyscale and a black-and-white print, and a 372-cell grid never reads as a rainbow. Its direction is
 * written on the grid's own legend («Menos → Más»).
 *
 * Its light steps sit ABOVE the lightness band a categorical fill needs, on purpose: in a heat grid the
 * lowest step is meant to be near the surface. It is `CHART_HEAT_EMPTY` it has to differ from, not the
 * page — and a cell with no data takes that instead, because empty and zero differ.
 */
export const CHART_HEAT_RAMP = ["#fde68a", "#fcd34d", "#f0b429", "#d98b0b", "#a15c07"] as const;

export const CHART_HEAT_EMPTY = "#f6f8fa";

/** The scale is handed in, not derived per grid: two grids must mean the same by the same tone. */
function rampStep(ramp: readonly string[], value: number | null, min: number, max: number): string {
  if (value === null || !Number.isFinite(value)) {
    return CHART_HEAT_EMPTY;
  }
  if (max <= min) {
    return ramp[ramp.length - 1];
  }
  const share = (value - min) / (max - min);
  const slot = Math.min(ramp.length - 1, Math.floor(share * ramp.length));
  return ramp[Math.max(0, slot)];
}

export function heatStep(value: number | null, min: number, max: number): string {
  return rampStep(CHART_HEAT_RAMP, value, min, max);
}
