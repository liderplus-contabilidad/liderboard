/**
 * **What counts as a year somebody can type**, and the app's one answer to it.
 *
 * It started in `lib/revenue/` and moved here the day «Análisis costo personal» grew a drawer of its
 * own: two captures typing a year would be two rules about what a year is, and the second would be
 * written slightly differently from the first.
 *
 * The drawer's year is TYPED rather than picked off a strip: a firm that has been keeping these
 * figures for a decade needs to reach 2016 without clicking «atrás» eight times, and a segmented
 * control that grows one button per year stops fitting the panel long before it stops being useful.
 *
 * Typing, though, is how a `2O24`, a `24` or a `20244` gets into the ledger, and a year is not a free
 * number: it is an index the whole module partitions by. So the check lives here, in the pure layer,
 * beside the rest of what Vitest covers — a component that validated inline would be a rule nothing
 * could test and that the next caller would write slightly differently.
 *
 * The message is returned already WRITTEN, in Spanish, for the same reason `SERIES_LABELS` exists: a
 * caller that composed its own would drift from this one the day a second caller appears.
 */

/**
 * The floor. Not a guess about this firm's history but about what a TYPO looks like: below it every
 * value is either a slip of the hand or a date no accounting workspace is going to hold.
 */
export const MIN_CAPTURE_YEAR = 2000;

/**
 * The ceiling is the year AFTER the current one, and the extra year is deliberate: a budget is loaded
 * before the year it belongs to starts, and a cut at «today» would refuse the one future year that is
 * actually useful. It takes `today` rather than reading the clock so a test can pin it.
 */
export function maxCaptureYear(today: Date): number {
  return today.getFullYear() + 1;
}

/** Either the year, or why it was refused — already phrased for the user. */
export type YearInputResult = { ok: true; year: number } | { ok: false; message: string };

/** Four digits, and nothing else: a lone `-` or a decimal point is not a year. */
const YEAR_SHAPE = /^\d{4}$/;

/**
 * A typed year, checked. `max` is passed in rather than derived from the clock here, so the rule and
 * «what today is» stay separable.
 */
export function parseYearInput(raw: string, max: number): YearInputResult {
  const trimmed = raw.trim();
  if (trimmed === "") {
    return { ok: false, message: "Escribe un año." };
  }
  if (!YEAR_SHAPE.test(trimmed)) {
    return { ok: false, message: "Un año son cuatro dígitos, como 2024." };
  }
  const year = Number(trimmed);
  if (year < MIN_CAPTURE_YEAR || year > max) {
    return { ok: false, message: `Solo años entre ${MIN_CAPTURE_YEAR} y ${max}.` };
  }
  return { ok: true, year };
}
