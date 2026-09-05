/**
 * How a direct label is made to FIT — the app's one answer to a figure that does not fit, replacing
 * the one it had.
 *
 * Every module used to carry a density cap (`MAX_DIRECT_LABEL_MARKS`, `coveredCount <= 6`) past which
 * the amount over each mark simply SWITCHED OFF and the reader had to hover. The reasoning was sound
 * about the width —«$144,844.12» measures some 86 px and twenty-four of them do not fit across one
 * axis— but it counted the wrong thing: it measured every figure against ONE strip over the plot,
 * when a chart has as many strips as SERIES. Each series writing its own ROW (`labelDistance`) turns
 * series × periods back into the PERIODS alone: one figure per column, and a column of a full-width
 * card measures some 83 px.
 *
 * The figure stays LYING DOWN at every density. A turned amount is read by tilting the head and these
 * cards are read at a glance, so what gives way is the body and then the CENTS —«$144,844.12» at
 * 10.5 px measures some 63 px and «$144,844» at 9 px some 40 px—, in that order and never the figure
 * itself. Nothing is lost with the cents: the tooltip and the table twin keep them, which is where an
 * amount is checked against the accountant's sheet.
 *
 * `hideOverlap` stays switched on wherever a direct label goes, and it now catches only what these
 * two rules cannot: a collision INSIDE one row, which is an axis narrower than the fit assumed.
 */

/** The air a written figure keeps off its mark, and off the row of figures below it. */
export const LABEL_GAP = 4;

/** What a direct label has to look like to fit this many columns. */
export interface LabelFit {
  fontSize: number;
  /** Whether the amount keeps the two decimals the Datos table shows. */
  cents: boolean;
}

/**
 * The shape one ROW of figures takes over this many columns — the periods on the axis, or the
 * categories when the axis is a set of accounts or of services.
 *
 * The steps are a full-width card's plot, about 1000 px, divided by the columns and measured against
 * the widest amount the app writes: twelve months give 83 px each, which holds «$144,844.12» at
 * 9.5 px (some 63 px); past twenty columns the cents are what no longer fit, not the figure.
 */
export function fitDirectLabel(columns: number): LabelFit {
  if (columns <= 8) {
    return { fontSize: 10.5, cents: true };
  }
  if (columns <= 14) {
    return { fontSize: 9.5, cents: true };
  }
  if (columns <= 20) {
    return { fontSize: 9, cents: false };
  }
  return { fontSize: 8.5, cents: false };
}

/**
 * Which row a series writes on: the first one rides on its own mark, and each of the following ones
 * clears the line height of the one under it.
 *
 * It is what buys the width —inside one column two figures no longer dispute the same strip— and it
 * is also what ties a figure to its bar, because the reader goes down the column and finds them in
 * the series' own order.
 */
export function labelDistance(row: number, fit: LabelFit): number {
  return LABEL_GAP + row * (fit.fontSize + LABEL_GAP);
}

/**
 * What the grid has to leave over the plot so the TOP row comes out whole, given what it would leave
 * with no figure written there.
 *
 * `outerBoundsContain` only accounts for the AXIS' labels, so nothing else reserves this and the top
 * figure would be cropped against the edge of the card — the one failure worse than the hover it
 * replaces.
 */
export function labelHeadroom(rows: number, fit: LabelFit, base: number): number {
  return Math.max(base, labelDistance(Math.max(rows, 1) - 1, fit) + fit.fontSize + LABEL_GAP);
}
