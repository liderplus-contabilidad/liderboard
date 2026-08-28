/**
 * What an account is made of, PERIOD BY PERIOD — the children stacked under the parent's total.
 *
 * It is the composition's third reading and it repeats neither of the previous two: the doughnut says
 * what the whole span is made of and the ranking which are the largest, but neither says whether a
 * child is gaining weight month by month, which is the question that produces a stacked bar.
 *
 * Two decisions live here because they can be wrong and that is why they are tested:
 *
 * - **Which account is distributed.** `resolveActiveCenterId`'s figure for the fifth time: exactly
 *   one marked account is that account, none or several is Ingresos. And then it DESCENDS while there
 *   is a single child — a real plan chains `4 → 4.1` and `5 → 5.1`, so the root's distribution would
 *   be a stack of one single segment, which is not a stack.
 * - **What is drawn of the children.** The palette has eight slots and does not cycle, so past eight
 *   the tail is folded into «Otros» — ordering BEFORE cutting, like the ranking, because cutting by
 *   file order would leave the largest out. The ones that do not move in the whole span go and are
 *   said: a statement declares every account of its plan whether or not it has movement, and ten
 *   legends at zero bury the one that matters.
 *
 * The total's line is NOT the stack's ceiling and that is why it exists: `4.1.4 Rebajas y/o
 * Descuentos` is an income account with a negative balance, which stacks downwards, so the net total
 * is at no edge of the stack. With «Otros» folded it is still the real total.
 *
 * And since the question that produces this card is «what PART of the account each child is», the
 * line's amount does not answer it on its own: `distributionShares` splits that same total into
 * percentages, once, and the two readings come out of it —the number inside the segment and the
 * tooltip—.
 */
import { CHART_DISTRIBUTION_MAX, colorForDistributionSlot } from "@/lib/charts/palette";
import { toPctOfContainer } from "../analytics/structure";
import {
  seriesKeyId,
  type AnalyticsSource,
  type Series,
  type SeriesKey,
  type SeriesPoint,
} from "../analytics/types";
import { childrenOf, seriesTotal } from "./presets";
import { DEFAULT_FOCUS_CODE } from "./selection";
import type { MarkedShare } from "./share";

/** The code of the synthetic series that collects the tail. It does not collide: no account is called
 *  that. */
export const DISTRIBUTION_OTHERS_CODE = "otras-cuentas";

/** The account that is distributed: its code and its name in the plan. */
export interface DistributionParent {
  code: string;
  label: string;
}

export interface Distribution {
  /** The children drawn, largest to smallest and with «Otros» closing the stack. */
  series: Series[];
  /** How many children were folded into «Otros» — said, never silently trimmed. */
  grouped: number;
  /** How many were left out for not moving in the whole span. */
  idle: number;
}

/**
 * The account whose distribution is drawn, or `null` when there is none to distribute — the marked
 * one is a movement account, or the source does not bring Ingresos.
 */
export function resolveDistributionParent(
  source: AnalyticsSource | undefined,
  markedCodes: readonly string[],
): DistributionParent | null {
  if (!source) {
    return null;
  }

  const start = markedCodes.length === 1 ? markedCodes[0] : DEFAULT_FOCUS_CODE;
  if (!source.valuesByCode.has(start)) {
    return null;
  }

  // It descends through the single-child chain: `4 → 4.1` is not a distribution, it is the same
  // figure under another name. It stops as soon as there are two or more, which is where there
  // starts to be something to break down.
  let code = start;
  let children = childrenOf(source, code);
  while (children.length === 1) {
    code = children[0];
    children = childrenOf(source, code);
  }

  return children.length > 0 ? { code, label: source.namesByCode.get(code) ?? code } : null;
}

/**
 * The children the stack draws: without the idle ones, ordered largest to smallest and with the tail
 * folded into «Otros» when they do not fit the scale. `limit` is how many series come out in total,
 * «Otros» included — the total's line does not spend a step, because it goes in ink and not in the
 * scale's colour.
 */
export function foldDistribution(
  series: readonly Series[],
  limit: number = CHART_DISTRIBUTION_MAX,
): Distribution {
  const totals = series.map((entry) => ({ entry, total: seriesTotal(entry) }));
  const moving = totals.filter(
    (candidate): candidate is { entry: Series; total: number } =>
      candidate.total !== null && candidate.total !== 0,
  );
  const idle = totals.length - moving.length;
  const ranked = [...moving].sort((a, b) => b.total - a.total).map((candidate) => candidate.entry);

  if (ranked.length <= limit) {
    return { series: ranked, grouped: 0, idle };
  }

  const kept = ranked.slice(0, limit - 1);
  const folded = ranked.slice(limit - 1);
  return { series: [...kept, othersSeries(folded)], grouped: folded.length, idle };
}

/**
 * What each segment takes up within the total the line draws above it.
 *
 * It is the same figure as `markedShares` —the percentage over the containing account, computed just
 * once and read afterwards by the label and by the tooltip— with the base already known: here there
 * is no ancestor to look for, because the stack IS that account's breakdown. And it goes through
 * `toPctOfContainer`, the module's only definition of «percentage over the container», instead of
 * dividing here: from it it inherits the two rules that matter — a period with no coverage and a
 * total at `0` give `null`, never `0 %`.
 *
 * «Otros» carries its own like any other: it is the tail's sum and it takes up what it takes up. The
 * percentages do NOT add up to 100 when a child is negative, and that is correct: it is exactly what
 * says the net is not at the stack's edge.
 */
export function distributionShares(
  series: readonly Series[],
  total: Series,
  parentLabel: string,
): MarkedShare[] {
  return series.map((entry) => {
    const measured = toPctOfContainer({
      ...entry,
      container: { code: total.key.code, label: parentLabel, points: total.points },
    });
    return {
      seriesId: seriesKeyId(entry.key),
      label: entry.label,
      baseLabel: parentLabel,
      values: measured.points.map((point) => point.value),
    };
  });
}

/**
 * Each segment's colour by its PLACE in the stack, which here is its size — and not by the entity,
 * which is the rest of the app's rule.
 *
 * It is not a capricious exception: `colorForEntity` exists so removing a series does not repaint the
 * others, and that matters when what is compared are entities that come and go from the chart. These
 * segments do not come and go: they are an account's WHOLE breakdown, always complete and always
 * ordered, so the only stable order possible is the breakdown's. Asking this colour to follow the code
 * would also be asking it to stop saying the only thing it says, which is the rank.
 */
export function distributionColor(series: readonly Series[]): (key: SeriesKey) => string {
  const slotByCode = new Map(series.map((entry, index) => [entry.key.code, index]));
  return (key) => colorForDistributionSlot(slotByCode.get(key.code) ?? -1);
}

/**
 * The tail as one more series. It sums point by point by INDEX because they all come from one same
 * batch and share an axis; a period none of them covers is still `null` and not an invented zero.
 */
function othersSeries(folded: readonly Series[]): Series {
  const first = folded[0];
  const points: SeriesPoint[] = first.points.map((point, index) => {
    let value: number | null = null;
    for (const entry of folded) {
      const candidate = entry.points[index]?.value;
      if (candidate !== null && candidate !== undefined) {
        value = (value ?? 0) + candidate;
      }
    }
    return { period: point.period, value };
  });

  return {
    key: { code: DISTRIBUTION_OTHERS_CODE, centerId: first.key.centerId, year: first.key.year },
    label: "Otros",
    points,
    container: null,
  };
}
