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

/**
 * The eight slots, in the order that makes them separable. Never re-sort, never cycle.
 *
 * Saturated at the firm's request, who read these charts next to their own Excel workbook and found
 * them washed out beside it. **Raising the chroma did not cost separability: it improved it.** What a
 * colourblind reader tells apart is above all LIGHTNESS and the blue-yellow axis, so the step was to
 * raise chroma while keeping each hue inside the band and measure again, not to pick by eye.
 *
 * What the validator says about THIS order, so nobody has to derive it again:
 * lightness band PASS (all eight inside L 0.43–0.77), chroma floor PASS,
 * CVD separation PASS —worst adjacent pair amber↔green ΔE 10.8 protan (previously 9.1)— and the
 * normal-vision floor PASS —worst pair pink↔amber ΔE 21.7 (previously 19.6)—. Contrast against the
 * surface is still below 3:1 in green, amber and pink, just as before: that is why every series
 * carries a legend and every card has its table twin, which is the relief that demands.
 */
export const CHART_PALETTE = [
  "#1466c8",
  "#f4501a",
  "#00c98a",
  "#ef9c00",
  "#f4629b",
  "#0b7a12",
  "#5b2fd6",
  "#ec2d2d",
] as const;

/** Lower than the engine's `MAX_SERIES` on purpose: a ninth color would land on top of one. */
export const CHART_MAX_SERIES = CHART_PALETTE.length;

/**
 * Fill colors for the three income statement sections.
 *
 * Matches the tones used in the data table but with deeper shades for better contrast.
 * Validated for accessibility: luminance, chroma, and color vision deficiency (CVD) separation pass.
 */
export const CHART_SECTION = {
  income: "#8fb03c",
  cost: "#3ba3c2",
  other: "#ee8b39",
} as const;

/**
 * Exists so `colorForEntity` is total, NOT so a ninth series can be drawn: queries cap at
 * `CHART_MAX_SERIES`, so reaching this in a chart is a bug upstream showing itself.
 */
export const CHART_NEUTRAL = "#b4bec9";

/**
 * The fill of a background BAND — what separates one group of columns from the next without adding a
 * line to the grid. It mirrors `--color-border-soft`, one step below the grid's line: it has to say
 * «these go together» at a glance without competing with the bar that falls on it.
 * `--color-surface-sunken` was tried first and could not be seen — with the bars in front, three
 * points of lightness over white are not a span, they are compression noise.
 */
export const CHART_BAND = "#edf1f5";

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

/**
 * The 3D STAGE — the one dark ground in the app, and it exists for the only drawing that needs one.
 *
 * A `bar3D` is a SOLID: what says where it ends is its silhouette, and on a white card the pale
 * faces of a short bar dissolve into the ground while the tall ones read as cut-outs. Against a
 * night sky every bar has an edge, which is the whole reason the shape is drawn in three dimensions
 * — and it is what the card's own name has been saying all along: a skyline is read against a sky.
 *
 * Its consumers are the two skyline cards and ONE flat reading: the lines of Reportería's
 * «Comparativo de ventas por año», where several years as two-pixel strokes over a white plot were
 * told apart by hue alone — the same reading the skyline draws, kept on the same ground. Nothing
 * else 2D takes these values: the app is a light dashboard, and this is a framed stage inside a
 * white card, never a dark mode.
 *
 * The marks that stand on it are `CHART_STAGE_PALETTE` and never the light scale: measured against
 * `sky`, `CHART_PALETTE` comes out (slots 1-8) 3.14 · 5.02 · 8.12 · 7.87 · 5.90 · 3.17 · 2.36 · 4.16,
 * with slot 7 under 3:1 and no dark ground able to save it.
 *
 * The navy is the reference's own (#111e40 sampled off it), taken two steps deeper so the marks
 * still carry: every figure measured against `sky` — grid 1.48 · axis 1.93 (the light chrome's own
 * recession, 1.09 and 1.16, is invisible on dark) · ink 14.71 · inkMuted 8.77 · inkFaint 5.93 ·
 * panel 1.30, which is why the panel does not float on its fill but on `panelBorder` at 2.48.
 * On the panel: ink 11.27.
 */
export const CHART_STAGE = {
  /** The deep end of the sky, and the tone the card paints behind the canvas so there is no seam. */
  sky: "#0e1a3a",
  /** The horizon: the sky lightens UPWARD, so the bars keep the deepest ground behind them. */
  skyTop: "#1a2c5c",
  grid: "#23366b",
  axis: "#33487f",
  ink: "#e8eefb",
  inkMuted: "#a9bade",
  inkFaint: "#8698c2",
  /** The fill of what is drawn OVER the stage — the tooltip, and the chip on the hovered bar. */
  panel: "#1c2e5e",
  panelBorder: "#41598f",
} as const;

/**
 * How a stage solid takes the light — the other half of `CHART_STAGE_LIGHT`, and what makes an EDGE
 * out of what was only a step in tone.
 */
export const CHART_STAGE_MATERIAL = {
  /**
   * The highlight's WIDTH, and the first value here was wrong in the direction nobody guesses. The
   * shader's lobe is `pow(8192, 1 - roughness)`: at 0.22 that is an exponent of **1128**, a mirror
   * pinpoint that lands between pixels and shows as nothing at all. At 0.42 it is 180 — still tight,
   * but wide enough that a bevel a few pixels across actually catches it.
   */
  roughness: 0.42,
  /**
   * Metal takes its colour from what it reflects and not from its own albedo — the shader is
   * literal about it, `albedo *= (1 - metalness)` — so at 1 a bar on this stage would be a navy
   * mirror with no identity left. Kept low on purpose: the rim is bought with the LIGHT's contrast
   * (see `CHART_STAGE_LIGHT`), not by trading away the fill, and every point of metalness here comes
   * straight off the floor measured there.
   */
  metalness: 0.14,
} as const;

/**
 * The stage's LIGHT — one rig, mounted by EVERY 3D card, and it exists for one thing: the edge.
 *
 * The first stage was drawn flat, ambient only, on the rule that a lit face turns one colour into
 * three. On a white card that rule was right. On this one it left fifteen solids reading as a single
 * continuous ribbon: with no light every face of every bar returns the same pixel, so where one bar
 * ends and the next begins is not drawn anywhere. `bar3D` has no border to fall back on — it renders
 * one merged mesh with vertex colours, and `itemStyle.borderWidth` is not a property it reads — so
 * the ONLY thing that can draw a silhouette is the shading itself.
 *
 * **What separates two faces is the RATIO, not the light's presence.** The rig before this one sat
 * at ambient 0.88 against a main of 0.36 and was, in effect, still flat: it put the top face at 0.96
 * of the fill and the face beside it at 0.88, an eight-per-cent step nobody can see. This one is set
 * from the three faces the reader ACTUALLY sees, given that both the camera and the light are fixed:
 *
 *     top     N·L 0.819    1.000 of the fill
 *     front   N·L 0.520    0.869
 *     side    N·L 0        0.645      ← the darkest face anyone ever looks at
 *
 * `top` lands on 1.000 by construction: past it the term clips, and a clipped face is a flat one
 * again. And the floor is the SIDE and not the theoretical minimum, because a fixed camera never
 * shows the back of a bar. Measured against `CHART_STAGE.sky` at 0.645 — identity slots 5.41 · 3.61
 * · 3.05 · 6.44 · 3.86 · 4.67 · 4.04 · 4.89 · the eighteen doughnut slices no lower than 4.76 · the
 * section blues 5.55 · 5.91 · 5.22 · «Otros» 3.06. Every one still clears 3:1 on its darkest face.
 *
 * `shadow` stays OFF: a cast shadow lands on the neighbouring bar and darkens a figure that was
 * measured, which is the thing this rig is careful not to do. And `beta` is deliberately off-axis
 * from the camera, because a light coming from exactly where you stand lights every visible face
 * equally — which is the flat rig again, by another route.
 */
export const CHART_STAGE_LIGHT = {
  main: { intensity: 0.5, alpha: 55, beta: 25, shadow: false },
  ambient: { intensity: 0.75 },
} as const;

/**
 * The scale the STAGE wears — a set of its own, and the only one in the app not derived from
 * `CHART_PALETTE`.
 *
 * It is here because the light scale cannot do this job. Those eight steps were chosen against
 * WHITE, and on the stage two of them fall under 3:1 — the violet at 2.36, which no dark ground
 * fixes (against pure black it is still 2.82). Re-stepping the same hues solved the reading and left
 * the look untouched, which was not what was asked for: what the 3D box wanted was the register of
 * the reference — turquoise, coral, purple, amber, orange — on navy.
 *
 * **The hues come from that reference, sampled off it and not guessed**: turquoise `#21bdc2`, coral
 * `#f64b74`, purple `#953edb`, amber `#f7bf57`, orange `#f18b2e`, magenta `#ce66f4`. Those are five
 * families and a scale needs eight, so the three that fill it —the azure of slot 5, the magenta of
 * 7, the jade of 8— are extensions of the same family and not a second one. The ORDER alternates
 * the two halves colour-blind vision collapses the wheel into: cool · warm · cool · warm, so no two
 * neighbours land on the same side of it.
 *
 * **What it costs, stated plainly: on the stage a service does NOT wear the hue it wears on the
 * white cards.** `stageColor` maps by SLOT, so identity is kept where it can be —the same service is
 * the same colour in every 3D card, and the legend and the depth axis name it— but the blue of
 * «Composición por servicio» is turquoise here. That is the trade this register asks for.
 *
 * Measured against `CHART_STAGE.sky` — chroma floor PASS (all 8 >= 0.10) · CVD separation PASS
 * (worst adjacent ΔE 10.8 deutan, tritan 6.9) · normal-vision floor PASS (worst adjacent ΔE 23.7) ·
 * contrast PASS, all 8 well over 3:1: 7.94 · 5.17 · 4.26 · 9.52 · 5.52 · 6.80 · 5.79 · 7.16 (against
 * `skyTop`, the gradient's hardest end: 6.26 · 4.07 · 3.36 · 7.49 · 4.34 · 5.35 · 4.56 · 5.64).
 *
 * The ONE check it does not clear is the **lightness band**, whose dark ceiling is 0.67 and which
 * six of the eight sit above (L 0.62–0.82). That is the register and not an oversight: an amber
 * holds chroma only above L 0.70, so inside the band the reference's `#f7bf57` comes out a muddy
 * gold and its orange a burnt one — measured, drawn and compared side by side before this was
 * chosen. That ceiling guards against a mark GLARING on a dark ground; every check that guards the
 * READING —contrast, separation, chroma— passes with room, and this ground is a navy, not a black.
 */
export const CHART_STAGE_PALETTE = [
  "#36c3c3",
  "#f74f78",
  "#a25aee",
  "#f0b851",
  "#2896f5",
  "#f28832",
  "#de65e6",
  "#3dbc8f",
] as const;

/**
 * The statement's ROOTS on the stage — `CHART_SECTION`'s three, in the register the navy asks for.
 *
 * It exists for the same reason `CHART_SECTION` does, and keeps its rule intact: when what is drawn
 * is a BLOCK of the statement the colour says WHICH block, so a light blue means «costos y gastos»
 * in Datos, in the report, in the flat bars and in the solid ones. What re-steps is only the step —
 * the hue angle of each is its source's to the degree — because the accountant's own fills were
 * sampled off a white sheet and read as chalk on this ground.
 *
 * Measured against `CHART_STAGE.sky`: income 8.69 · cost 8.20 · other 7.64 (against `skyTop`, the
 * gradient's hardest end: 6.85 · 6.46 · 6.02). They are BLOCK colours and not a categorical scale,
 * so the checks that govern one —adjacent separation, a fixed order— do not apply: three roots are
 * never neighbours competing for identity, they are three different questions.
 */
export const CHART_STAGE_SECTION = {
  income: "#a3c554",
  cost: "#4cc1e5",
  other: "#f89546",
} as const;

/**
 * «Otros» on the stage. `CHART_NEUTRAL` is a pale grey — read against white it recedes, and against
 * the navy it measures 9.08:1, over every one of the eight entities it is meant to sit behind.
 *
 * This one is set by its SHADOWED face and not by its lit one: under `CHART_STAGE_LIGHT` the darkest
 * side of a solid falls to 0.72 of its fill, and the step before this measured 2.93 there — a mark
 * that stopped being a mark on the faces turned away from the light. At 4.31 lit and 3.33 in shadow
 * it clears the floor on both. That leaves it level with the dimmest identity slot (4.26), and what
 * keeps it behind them is not contrast but CHROMA: it is the one fill on the stage with none.
 */
export const CHART_STAGE_NEUTRAL = "#6d80a6";

/**
 * `CHART_SLICE_SEQUENCE` on the stage — the eighteen a breakdown that NAMES all its parts needs.
 *
 * Derived by the rule and not picked one by one: each keeps its source's OKLCH hue angle to the
 * degree and is re-stepped to the same lightness the reference register asks for (L 0.745, 95 % of
 * the chroma that hue still holds there), which is the same lift `CHART_STAGE_SECTION` takes. Eight
 * hand-picked slots is a scale; eighteen would be a guess repeated eighteen times.
 *
 * All eighteen come out distinct, and the floor that matters here is the SHADOWED face —
 * `CHART_STAGE_LIGHT` drops the side turned from the light to 0.72 of the fill. Against
 * `CHART_STAGE.sky`: lit, 6.92 at worst; in shadow, 5.20. Adjacent-pair separation is not checked
 * for this set for the reason its flat twin is not either — it is the sequence for a shape that
 * writes every slice's NAME, so colour is not carrying the identity alone.
 */
export const CHART_STAGE_SLICE_SEQUENCE = [
  "#fb8579",
  "#fa8c1f",
  "#26c7ab",
  "#82c321",
  "#77aefb",
  "#fc7f9e",
  "#6ab1fb",
  "#fb885b",
  "#fc74cb",
  "#26c994",
  "#b499fb",
  "#dda020",
  "#26bafb",
  "#fb847f",
  "#83c321",
  "#fc7bae",
  "#26c5b8",
  "#fb8a33",
] as const;

/**
 * A slice colour translated to the stage, BY SLOT — `stageColor`'s same contract for the sequence a
 * doughnut draws from. A colour the sequence does not contain is left alone.
 */
export function stageSliceColor(color: string): string {
  const slot = CHART_SLICE_SEQUENCE.indexOf(color as (typeof CHART_SLICE_SEQUENCE)[number]);
  return slot < 0 ? color : CHART_STAGE_SLICE_SEQUENCE[slot];
}

/**
 * A scale colour translated to the stage, BY SLOT — the one way into `CHART_STAGE_PALETTE`.
 *
 * It takes the colour and not the entity on purpose: the skyline is handed segments that already
 * carry their hue, and re-deriving it here from an id and an order would be a second answer to «what
 * colour is this service» — which is the one thing `colorForEntity` exists to prevent. A colour the
 * scale does not contain is left alone, except `CHART_NEUTRAL`, which has a stage step of its own.
 */
export function stageColor(color: string): string {
  if (color === CHART_NEUTRAL) {
    return CHART_STAGE_NEUTRAL;
  }
  const slot = CHART_PALETTE.indexOf(color as (typeof CHART_PALETTE)[number]);
  return slot < 0 ? color : CHART_STAGE_PALETTE[slot];
}

/**
 * The sky as `grid3D.environment` takes it. `echarts-gl` paints a gradient of its own when left
 * alone, and it is a light one: the stage has to REPLACE it, not sit under it.
 */
export const CHART_STAGE_SKY = {
  type: "linear",
  x: 0,
  y: 0,
  x2: 0,
  y2: 1,
  colorStops: [
    { offset: 0, color: CHART_STAGE.skyTop },
    { offset: 1, color: CHART_STAGE.sky },
  ],
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

/**
 * The «Distribución» stack, and NOTHING else. Five steps navy blue → light green, monotonic in
 * lightness, plus the neutral for «Otros».
 *
 * It is an ORDERED scale and not a categorical set, and that is the whole difference from
 * `CHART_PALETTE`. There eight entities are compared with one another and the colour is the only
 * thing telling them apart, so the order of the slots exists so none looks like another. Here the
 * segments are PARTS OF ONE FIGURE, stacked largest to smallest in a single column: what the colour
 * has to say is «this is a breakdown and this piece weighs more than the one above», which is exactly
 * what eight identity hues —blue, red, green, amber— erase, because each column ends up looking like
 * four different matters piled up. The range runs dark at the bottom to light at the top because the
 * order already is that, so hue and position say the same thing and reinforce each other.
 *
 * **There are FIVE and not eight, and that is measured, not chosen.** The whole blue→green arc
 * measures some 55 ΔE; split into eight steps it leaves neighbouring pairs at ΔE 8, below the NORMAL
 * vision floor, and in a stack neighbours are exactly what has to be told apart. In five steps the
 * same arc gives 16.6 and passes. That is why `foldDistribution` folds the tail from the sixth on —
 * the same cut `toPieSlices` already applies to the doughnut for the same reason.
 *
 * What the validator says about this order, so nobody re-derives it: chroma floor PASS,
 * CVD separation PASS —worst adjacent pair blue↔blue ΔE 14.2 deutan—, normal-vision floor PASS
 * —worst pair green↔green ΔE 16.6—. The lightness band is NOT met and must not be: it is a
 * requirement of categorical fills, and a sequential ramp exists precisely to step outside it at both
 * ends (`CHART_HEAT_RAMP` does the same). The lightest step's contrast stays below 3:1, with the
 * usual relief: legend, tooltip and the table twin.
 *
 * The last hue is `CHART_NEUTRAL` on purpose: «Otros» is not a rung of the scale but what is left
 * over, and a grey at the very top is what says so without pretending it is one more account.
 */
export const CHART_DISTRIBUTION_RAMP = [
  "#1a237e",
  "#1550e0",
  "#2f93ff",
  "#00a651",
  "#45de88",
  CHART_NEUTRAL,
] as const;

/** How many segments a stack draws before folding the tail: the steps of its own scale. */
export const CHART_DISTRIBUTION_MAX = CHART_DISTRIBUTION_RAMP.length;

/**
 * The hue by PLACE in the stack, which is the account's rank. It does not go through `colorForEntity`
 * because here colour does not follow the entity: it follows its size, and that is the brief.
 */
export function colorForDistributionSlot(index: number): string {
  return CHART_DISTRIBUTION_RAMP[index] ?? CHART_NEUTRAL;
}

/**
 * «Composición de los ingresos», and NOTHING else. Six warm hues by the SIZE of the part, asked for
 * by the firm over a reference pie they brought. The card stopped being a pie —today it is horizontal
 * bars, like the ranking below it— and the set stays: what justifies it is not the circle but the
 * breakdown.
 *
 * That it is a set of its own and not `CHART_PALETTE` is not a whim: there colour follows the ENTITY
 * so filtering one series does not repaint the others, and here there are no entities coming and
 * going — `toPieSlices` returns the whole breakdown, always complete and always ordered largest to
 * smallest, and the colour already followed that order. It is the same argument as
 * `CHART_DISTRIBUTION_RAMP`, with one difference that changes the shape: a stack needs a RAMP because
 * its neighbours touch and «this piece weighs more» has to be read, whereas a breakdown of six parts
 * that do not touch only needs the six to be distinguishable. That is why these are hues and not
 * steps of a scale.
 *
 * **The reference's hues are NOT these, and the reason is measured.** Those —`#ff0000`, `#ff5600`,
 * `#ff8500`, `#99aa27`, `#00836f`— fail twice, and the one that matters is not the colour-blindness
 * one: `#ff5600`↔`#ff0000` give ΔE 7.6 in NORMAL vision, meaning the 30 % slice and the 20 % one are
 * almost the same red to anyone (`#99aa27`↔`#ff8500` also give ΔE 3.9 protan). In the reference that
 * goes unnoticed because each slice carries its «20%» printed INSIDE: the number is what
 * disambiguates, not the colour. Here it does not: in bars the hue is what pairs a row of the table
 * twin with its bar —an 8 px colour dot, with no figure inside to disambiguate—, so two nearly equal
 * reds really do get confused. What is kept, then, is the CHARACTER —the red, the orange and the
 * teal, which are three of its five hues and the ones that give it its air— and the arc is widened:
 * red, orange and amber live within some 60° of hue, and three of them do not reach the normal-vision
 * floor without separating in lightness, which takes the amber out of the band at the top. The olive
 * green becomes green, and the fifth and the sixth —blue and magenta— are set by the arc, not by the
 * reference, which only carried five slices.
 *
 * None of the six is a slot of `CHART_PALETTE`, the same rule the distribution ramp meets: they are
 * two different jobs and sharing a hex would invite reading a kinship between a row of this breakdown
 * and a series of the card next to it. The blue was shifted to `#0f5bb5` precisely for that, because
 * `#1466c8` is the first identity slot.
 *
 * What the validator says about this order, so nobody re-derives it: lightness band PASS (all six
 * inside L 0.43–0.77), chroma floor PASS, CVD separation PASS —worst adjacent pair magenta↔blue
 * ΔE 15.0 protan, tritan 11.5— and normal-vision floor PASS —worst pair green↔teal ΔE 16.2—. The
 * orange's contrast (2.3) and the green's (2.92) stay below 3:1, with the usual relief: legend,
 * tooltip and the table twin.
 *
 * The order is the breakdown's and is not re-sorted: the CVD check is over ADJACENT pairs, so moving
 * one hue invalidates the measurement above.
 */
export const CHART_COMPOSITION_PALETTE = [
  "#e02b2b",
  "#ff8a00",
  "#00836f",
  "#6fa428",
  "#0f5bb5",
  "#c2185b",
] as const;

/**
 * How many parts the composition draws before folding the tail into «Otros»: the hues of its own
 * scale. `toPieSlices` receives this number instead of carrying a loose 6, which is what guarantees
 * «Otros» always lands in the last slot and no row is left without a colour.
 */
export const CHART_COMPOSITION_MAX = CHART_COMPOSITION_PALETTE.length;

/**
 * The hue by PLACE in the breakdown, which is the size of the part. It does not go through
 * `colorForEntity` for the reason stated above: here colour does not tell entities apart, it orders a
 * breakdown.
 */
export function colorForCompositionSlot(index: number): string {
  return CHART_COMPOSITION_PALETTE[index] ?? CHART_NEUTRAL;
}

/**
 * THE SEQUENCE OF THE «Ranking de gastos», which is the only card that draws FIFTEEN bars: the eight
 * identity slots followed by the twelve decorative period hues.
 *
 * The first eight are painted as always, with `CHART_PALETTE`, and that is not inertia: it is the
 * case for almost every client —a chart of accounts that does not reach nine expense accounts never
 * sees the tail—, so the card does not change look until the ninth bar. The problem starts right
 * there, and it has taken two forms. With `colorForEntity` the last seven returned the same
 * `CHART_NEUTRAL` —seven identical grey bars at the bottom of the list, which is where one looks to
 * know what to cut—. It was fixed with a lime-green range at seven lightnesses, and that removed the
 * grey but not the defect: one same green repeated still reads as a smear, and what the firm asked
 * for is what its own annex pie already does —that the hues BE DIFFERENT—.
 *
 * **Why the period set and not the pie's.** `CHART_SLICE_SEQUENCE` starts with the six warm hues of
 * «Composición de los ingresos», which is the card sitting JUST ABOVE the ranking on the same screen;
 * the first six bars would come out in the same hue as its six rows and, since in both the colour
 * goes by POSITION and not by entity, that would read as though the first row of one were the first
 * of the other. The three sets are disjoint, so starting with the identity slots avoids the clash and
 * leaves twenty hues without repeating a single one.
 *
 * **And yes, `CHART_PERIOD_PALETTE` is the DECORATIVE set**, the one that says «never for series».
 * The exception is paid for here with the same relief the annex's doughnut pays it with, and it is
 * written there: each bar carries its account labelled in the label channel and its amount beside it,
 * and the card has its table twin with the fifteen figures. Colour is not the reading —the order is
 * given by the row's position and the bar's length—; the only thing it does is keep the tail from
 * being a smear. That its CVD separation between neighbours does not clear is therefore acceptable: a
 * reader who cannot tell two of these hues apart loses nothing, because the account's name is written
 * beside it.
 */
export const CHART_RANKING_SEQUENCE = [...CHART_PALETTE, ...CHART_PERIOD_PALETTE] as const;

/**
 * How many bars the ranking draws. Fifteen is a LEGIBILITY limit the firm asked for and not a number
 * the palette imposes —there are twenty slots—, so it is DECLARED instead of derived from the length
 * of the sequence, which is what it did when the cut and the tail were the same 8 + 7. What remains
 * mandatory is that no drawn bar is left without a hue, and that goes from being an accidental
 * identity to an invariant written in the test: `CHART_RANKING_MAX` ≤ the sequence.
 */
export const CHART_RANKING_MAX = 15;

/**
 * A ranking bar's hue by its POSITION: the first eight from the identity set, the following ones from
 * the decorative period hues. Past the sequence it falls back to the neutral, like everything else in
 * this file — but it is never reached, because the ranking's cut is `CHART_RANKING_MAX`.
 */
export function colorForRankingSlot(index: number): string {
  return index < 0 ? CHART_NEUTRAL : (CHART_RANKING_SEQUENCE[index] ?? CHART_NEUTRAL);
}

/**
 * The sequence of the ANNEX'S DOUGHNUT, which is the only pie in the app that does not fold its tail.
 *
 * «Composición de los ingresos» breaks down six slices and closes with «Otros» because its question
 * is what the total is made of: the seventh largest account does not change that answer. The expense
 * annex does the opposite — it is a LIST of lines that has to appear whole, because the accountant
 * checks it row by row against their sheet—, and there «Otros · 16.6 %» hides exactly what one came
 * to read.
 *
 * They are the composition's six warm hues followed by the twelve decorative period ones, and that
 * order matters: the large slices keep the look the pie already had, and the tail —which is the part
 * that appears extra— takes the set that exists for «one series with many marks». Reusing it here is
 * legitimate for the SAME reason as there, written in `CHART_PERIOD_PALETTE`: each slice carries its
 * name and its percentage in the label and again in the legend, so the colour is not the reading — it
 * keeps seventeen slices from being a single smear, nothing more.
 *
 * **What it does NOT fix, and this has to be known:** a pie of seventeen slices with four of them
 * below 1 % is not legible however many hues it has, and it is the firm's own file that shows it.
 * What holds this card up is not the colour but the two usual reliefs — the label `hideOverlap` drops
 * when it does not fit, and the TABLE TWIN, which lists the seventeen with their figures. The
 * doughnut gives the shape; the table gives the datum.
 */
export const CHART_SLICE_SEQUENCE = [
  ...CHART_COMPOSITION_PALETTE,
  ...CHART_PERIOD_PALETTE,
] as const;

/** How many slices a pie can name without repeating a hue. The nineteenth falls back to the
 *  neutral. */
export const CHART_SLICE_MAX = CHART_SLICE_SEQUENCE.length;

/** The hue by PLACE in the breakdown, as in the composition: here it does not follow the entity
 *  either. */
export function colorForSliceSlot(index: number): string {
  return index < 0 ? CHART_NEUTRAL : (CHART_SLICE_SEQUENCE[index] ?? CHART_NEUTRAL);
}

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
