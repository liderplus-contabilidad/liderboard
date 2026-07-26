/**
 * The chart mark system in one place: the categorical palette, the rule that binds a color to
 * an entity, and the strokes, gaps and ink tones every option builder consumes. No builder
 * writes a hex of its own, so the day the brand moves this file is the only edit.
 *
 * **The order of the slots IS the safety mechanism, not a preference.** The eight hexes were
 * picked as a sequence: slots 1–3 stay apart under deuteranopia and protanopia, and every
 * further slot was chosen against all the previous ones. A chart of four colors is safe
 * *because* it uses the first four. Re-sorting them, or letting a view reach for slot 6 before
 * slot 2, throws that away — which is why `colorForEntity` is the only way in.
 *
 * **Slot 1 is not `--color-brand`.** The navy `#1e3a5f` sits below the luminance band a
 * categorical palette needs: against the white `surface` it reads as text rather than as a
 * fill, and keeping the other slots separable from it would drag the whole band dark. Slot 1
 * is a lighter step of that same family, so a chart still reads as the brand.
 *
 * The literal hexes below mirror `app/globals.css`'s `@theme` on purpose: an ECharts option is
 * a plain object handed to a canvas/SVG renderer, so it cannot consume a Tailwind utility.
 * This is the single mirror point.
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

/**
 * A chart tops out at the number of slots. It is lower than the engine's `MAX_SERIES` on
 * purpose: 24 panels of small multiples read fine, eight grouped bars are already the limit,
 * and a ninth color cannot be generated without landing on top of one of these.
 */
export const CHART_MAX_SERIES = CHART_PALETTE.length;

/**
 * What an entity beyond the eighth gets. It exists so the function is total, not so a ninth
 * series can be drawn: the query caps at `CHART_MAX_SERIES` and the engine reports the
 * truncation, so reaching this value in a chart is a bug upstream, and a flat neutral is how
 * it shows up instead of a color that pretends to be a slot.
 */
export const CHART_NEUTRAL = "#b4bec9";

/**
 * The color of an entity comes from its stable position in the compared dimension — the
 * account's order in the file, the center's order in the selector — and never from its index
 * in the result. Filtering one series out therefore leaves every other one painted exactly as
 * it was, and a center keeps its color across the cards of a tab.
 */
export function colorForEntity(entityId: string, order: readonly string[]): string {
  const slot = order.indexOf(entityId);
  if (slot < 0 || slot >= CHART_PALETTE.length) {
    return CHART_NEUTRAL;
  }
  return CHART_PALETTE[slot];
}

/**
 * Ink tones for every text a chart draws. A label never takes the color of its series — that
 * would make the text a second encoding of something the mark already says. `onFill` is the
 * one that sits ON a saturated mark (a stacked segment's own label), where contrast leaves no
 * other choice.
 */
export const CHART_INK = {
  strong: "#1e293b",
  muted: "#64748b",
  faint: "#94a3b8",
  onFill: "#ffffff",
} as const;

/** The surface a chart sits on; also the color painted into the gaps between fills. */
export const CHART_SURFACE = "#ffffff";

/** Grid and axis lines: one recessive tone, continuous stroke — never dashed or dotted. */
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
 * Reserved for the SIGN of a variation, never as a series color — a chart that paints "serie
 * 4" green teaches the reader that green means good. Because they are color alone, they always
 * ship with an icon and the signed value next to them.
 */
export const CHART_SIGN = {
  positive: "#16a34a",
  negative: "#dc2626",
} as const;

/**
 * The dashboard font, as the renderer can consume it. The `var()` resolves against `:root`,
 * where `next/font` writes the generated family; the rest of the stack is what shows if it
 * ever does not.
 */
export const CHART_FONT = "var(--font-ibm-plex-sans), system-ui, sans-serif";

/**
 * The sequential ramp of a density grid — the occupancy heatmap's only source of color. It is
 * NOT part of the categorical palette: those eight slots exist to be told APART, this ramp
 * exists to be read as one quantity rising. The steps climb the brand's own family and are
 * monotonic in lightness, so the grid still reads printed in greyscale.
 *
 * A cell with no data takes `CHART_HEAT_EMPTY` and never a ramp step: an empty day and a day at
 * zero are different statements.
 */
export const CHART_HEAT_RAMP = ["#eaf1f7", "#c3d8e9", "#8fb4d3", "#4f7fab", "#1e3a5f"] as const;

export const CHART_HEAT_EMPTY = "#f6f8fa";

/**
 * Picks a ramp step for `value` within `[min, max]`. The scale is handed in rather than derived
 * per grid on purpose: two grids side by side must mean the same thing by the same tone.
 */
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
