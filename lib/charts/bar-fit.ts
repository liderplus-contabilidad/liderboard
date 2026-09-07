/**
 * How WIDE a bar is allowed to be — the app's one answer to a column that has room to spare, and the
 * sibling of `label-fit.ts`, which answers the same question about the figure written over it.
 *
 * Every card used to carry its own hand-picked ceiling —44 here, 30 there, 28 and 18 in the two
 * readings of one card— and a number picked by hand cannot know how much room the column it lands in
 * actually has: the same 18 px is right for twelve months of two series and leaves a year's own
 * column three quarters empty. What decides is not the card, it is the ARITHMETIC of the axis: how
 * many columns share the plot and how many bars share a column.
 *
 * **It is a CEILING that is meant to bind.** ECharts computes its own width from the band and takes
 * the smaller of the two, so a ceiling above its figure does nothing and a ceiling below it is what
 * is drawn. This one stays deliberately under ECharts' own (`FILL` is below the fraction its category
 * gap leaves, whatever the series count), which is what makes the width PREDICTABLE from the pure
 * layer — and that matters beyond the drawing: the «vs» cards anchor the numerator's figure to its
 * own bar's left edge, and an anchor computed from a ceiling that did not bind lands over the fill
 * beside it.
 *
 * The plot is taken as ~1000 px, which is `label-fit.ts`' same assumption and for its same reason: a
 * full-width card on the narrowest desktop this app is read on. Being conservative costs air on a
 * wide screen; being optimistic costs a bar wider than its column, which no screen forgives.
 */

/** A full-width card's plot, in px — `label-fit.ts`' same figure, and the one this file divides. */
const PLOT_WIDTH = 1000;

/**
 * What the bars of ONE column take of it. Below the share ECharts' own category gap leaves —69 % with
 * a single series, 85 % with five— so this ceiling is always the binding one and the drawn width is
 * exactly what was computed here.
 */
const FILL = 0.62;

/** The air between two bars of the same column, as a share of a bar's width. */
const GAP_RATIO = 0.3;

/** The same figure as ECharts takes it. Declared wherever several series share a column: ECharts'
 *  own default is `'10%'`, which glues the fills into what reads as one stacked block. */
export const GROUPED_BAR_GAP = `${GAP_RATIO * 100}%`;

/**
 * A bar wider than this stops being a bar and becomes a block: with two or three columns the
 * arithmetic alone would hand out a third of the plot per fill, and what is read then is the gap
 * between two slabs rather than the height of two marks.
 */
const MAX_BAR = 88;

/** Under this a fill is a hairline: past that density the reading is the shape of the row, and the
 *  figures are in the tooltip and in the table twin. */
const MIN_BAR = 6;

/**
 * The widest a bar may be drawn with this many columns across and this many bars per column.
 *
 * `series` is what a column holds, not what the card declares: a card with three series drawn on one
 * axis divides its column three ways, and a card whose column carries a single bar keeps it whole.
 */
export function fitBarWidth(columns: number, series = 1): number {
  const band = PLOT_WIDTH / Math.max(columns, 1);
  const bars = Math.max(series, 1);
  // The gaps live BETWEEN the bars, so there is one fewer of them than there are bars.
  const width = (band * FILL) / (bars + (bars - 1) * GAP_RATIO);
  return Math.round(Math.min(Math.max(width, MIN_BAR), MAX_BAR));
}
