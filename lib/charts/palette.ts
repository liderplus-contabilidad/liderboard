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
  /** Rounded cap on the free end of a bar. */
  radius: 3,
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
 * NOT part of the categorical palette: those eight slots exist to be told APART, this ramp exists
 * to be read as one quantity rising. Monotonic in lightness, so it survives greyscale.
 *
 * A cell with no data takes `CHART_HEAT_EMPTY`, never a ramp step: empty and zero differ.
 */
export const CHART_HEAT_RAMP = ["#eaf1f7", "#c3d8e9", "#8fb4d3", "#4f7fab", "#1e3a5f"] as const;

export const CHART_HEAT_EMPTY = "#f6f8fa";

/** The scale is handed in, not derived per grid: two grids must mean the same by the same tone. */
export function heatStep(value: number | null, min: number, max: number): string {
  if (value === null || !Number.isFinite(value)) {
    return CHART_HEAT_EMPTY;
  }
  if (max <= min) {
    return CHART_HEAT_RAMP[CHART_HEAT_RAMP.length - 1];
  }
  const share = (value - min) / (max - min);
  const slot = Math.min(CHART_HEAT_RAMP.length - 1, Math.floor(share * CHART_HEAT_RAMP.length));
  return CHART_HEAT_RAMP[Math.max(0, slot)];
}
