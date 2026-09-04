/**
 * **THE definition of growth**, in dollars and in percent, and the only one in the app. The chart,
 * the table twin, the header tile, the Excel and the printed report all read it from here: two places
 * computing the same number drift apart, and afterwards no figure can say which of the two is right.
 *
 * **Rule (c): the growth is measured over the SAME SPAN.** Two years are only compared on the months
 * where BOTH carry a figure — which is the same shape as the ratio's rule and, at bottom, the same
 * defect it guards against: a quotient whose two terms cover different periods says nothing about
 * either.
 *
 * This is the correction the module makes over the source workbook. Its TOTAL row compares
 * $1,683,720.41 —seven months of 2026— against $1,915,467.90 —the twelve of 2024— and concludes
 * `+19 %`. Over the span the two share, Ene–Jul, the answer is `+$706,189.26` and `+72.2 %`. The
 * marked month narrows every marked year at once, so the comparison can never again be seven months
 * against twelve.
 */
import { MONTHS_IN_YEAR } from "./types";

/** One month's variation, or `null` where the two years do not both have a figure. */
export interface GrowthPoint {
  monthIndex: number;
  /** Reference minus base. `null` when either side is missing. */
  delta: number | null;
  /**
   * The variation over the base, in PERCENT POINTS (`72.2`, not `0.722`) so it reaches the formatters
   * as they expect it. `null` when either side is missing OR when the base is zero: a growth over
   * nothing is not «infinite», it is undefined, and drawing it as a bar would invent a height.
   */
  percent: number | null;
}

/** A whole comparison against ONE base year. */
export interface GrowthAgainstYear {
  baseYear: number;
  points: GrowthPoint[];
  /** The months where both years carry a figure — the span the totals were measured over. */
  sharedMonths: number[];
  referenceTotal: number;
  baseTotal: number;
  /** The variation over the shared span, which is the figure the tile and the TOTAL row show. */
  total: GrowthPoint;
}

/**
 * The variation of one figure over another, in points. Kept here —and not inlined at each call— so
 * «what percent is this» has one answer: `null` over a zero or absent base.
 */
export function percentChange(reference: number | null, base: number | null): number | null {
  if (reference === null || base === null || base === 0) {
    return null;
  }
  return ((reference - base) / base) * 100;
}

/**
 * Reference against ONE base, month by month and over the shared span.
 *
 * Both series arrive already narrowed to the marked months (`scopeToMonths`), so what is left to do
 * here is the intersection of their COVERAGE — a month the reference has and the base does not
 * belongs to neither total.
 */
export function growthAgainst(
  reference: readonly (number | null)[],
  base: readonly (number | null)[],
  baseYear: number,
): GrowthAgainstYear {
  const points: GrowthPoint[] = [];
  const sharedMonths: number[] = [];
  let referenceTotal = 0;
  let baseTotal = 0;

  for (let month = 0; month < MONTHS_IN_YEAR; month++) {
    const ref = reference[month] ?? null;
    const bas = base[month] ?? null;
    if (ref === null || bas === null) {
      points.push({ monthIndex: month, delta: null, percent: null });
      continue;
    }
    sharedMonths.push(month);
    referenceTotal += ref;
    baseTotal += bas;
    points.push({
      monthIndex: month,
      delta: ref - bas,
      percent: percentChange(ref, bas),
    });
  }

  const covered = sharedMonths.length > 0;
  return {
    baseYear,
    points,
    sharedMonths,
    referenceTotal,
    baseTotal,
    total: {
      // The TOTAL row is not a month; the index is the sentinel every consumer already skips.
      monthIndex: -1,
      delta: covered ? referenceTotal - baseTotal : null,
      percent: covered ? percentChange(referenceTotal, baseTotal) : null,
    },
  };
}

/**
 * The reference against EVERY base, in ascending order of base year.
 *
 * The reference is the most recent marked year and the bases are the rest; nothing is chosen by a
 * control, because what the user marked already decided it.
 */
export function growthAgainstAll(
  reference: readonly (number | null)[],
  bases: readonly { year: number; monthly: readonly (number | null)[] }[],
): GrowthAgainstYear[] {
  return [...bases]
    .sort((a, b) => a.year - b.year)
    .map((base) => growthAgainst(reference, base.monthly, base.year));
}
