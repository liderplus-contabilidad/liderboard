/**
 * What a marked account takes up within ANOTHER marked account containing it.
 *
 * Marking «4 Ingresos» and «4.1 Ventas» at once is no longer just comparing two bars: the question
 * that mark produces is what part of the first the second is. It is answered here just once, in the
 * pure layer, and the result travels to the bar's label, to the tooltip and to the line explaining the
 * card — three readings of the same number instead of three computations that can drift apart.
 *
 * The base is the **nearest marked ancestor**, at any depth. That is what makes marking «4» and
 * «4.1.01» while skipping the intermediate level still give a reading, and what gets it right with two
 * families marked at once (`4`, `4.1`, `5`, `5.1`) with no separate clause: each child falls inside
 * its own. `parentByCode` is walked, which is the TREE's parentage and not that of the dotted prefix —
 * the same one `ancestorPath` follows, so an orphan account is measured inside where the table draws
 * it nested.
 *
 * The division is not rewritten: that ancestor is hung on the series as `container` and it goes
 * through `toPctOfContainer`, the module's only definition of «percentage over the container». From it
 * it inherits the two rules that matter — a period with no coverage and a base at `0` give `null`,
 * never `0 %`.
 */
import { toPctOfContainer } from "../analytics/structure";
import { seriesKeyId, type AnalyticsSource, type Series } from "../analytics/types";

/** A series' percentage within the marked account containing it. */
export interface MarkedShare {
  /** The child series' `seriesKeyId` — what the label and the tooltip recognise it by. */
  seriesId: string;
  /** The child account's name in the plan, for the phrase that explains the card. */
  label: string;
  /**
   * The base account's name in the PLAN, never its series' label: with several centers marked that
   * label would be «Ingresos · Restaurante», and since the base is always of the same center as the
   * child, naming it disambiguates nothing and only lengthens it.
   */
  baseLabel: string;
  /** One percentage per period, in the axis' order; `null` where it cannot be divided. */
  values: (number | null)[];
}

/**
 * The series that fall inside another one of the same batch, in the order they are drawn. A series
 * with no marked ancestor does not appear: there is no percentage to invent for it, and marking «4»
 * and «5» has to leave the chart exactly as it was.
 */
export function markedShares(
  series: readonly Series[],
  sources: readonly AnalyticsSource[],
): MarkedShare[] {
  const sourceOf = new Map(
    sources.map((source) => [sourceId(source.centerId, source.year), source]),
  );

  // The marks are grouped by (center, year) because a series can only be measured inside a base DRAWN
  // BESIDE IT: the restaurant's 4.1 is not the base of the warehouse's 4.1.01.
  const markedBy = new Map<string, Map<string, Series>>();
  for (const entry of series) {
    const id = sourceId(entry.key.centerId, entry.key.year);
    const byCode = markedBy.get(id) ?? new Map<string, Series>();
    byCode.set(entry.key.code, entry);
    markedBy.set(id, byCode);
  }

  const shares: MarkedShare[] = [];
  for (const entry of series) {
    const id = sourceId(entry.key.centerId, entry.key.year);
    const source = sourceOf.get(id);
    const marked = markedBy.get(id);
    if (!source || !marked) {
      continue;
    }

    const base = nearestMarkedAncestor(source, entry.key.code, marked);
    if (!base) {
      continue;
    }

    const baseLabel = nameOf(source, base.key.code);
    const measured = toPctOfContainer({
      ...entry,
      container: { code: base.key.code, label: baseLabel, points: base.points },
    });

    shares.push({
      seriesId: seriesKeyId(entry.key),
      label: nameOf(source, entry.key.code),
      baseLabel,
      values: measured.points.map((point) => point.value),
    });
  }

  return shares;
}

/**
 * What is measured within what, in plain Spanish and under the card.
 *
 * The bar carries only the number because «28.4 % de Ingresos» does not fit in twelve columns, and a
 * loose `28.4 %` does not say whose it is as soon as there are two parent levels in the same column.
 * This line is what closes that gap, and the tooltip repeats it bar by bar.
 *
 * A pair of accounts is named ONCE even if it repeats across several centers: with four centers marked
 * the phrase would say the same thing four times.
 */
export function describeShares(shares: readonly MarkedShare[]): string | undefined {
  const pairs: string[] = [];
  const seen = new Set<string>();

  for (const share of shares) {
    const pair = `${share.label} dentro de ${share.baseLabel}`;
    if (seen.has(pair)) {
      continue;
    }
    seen.add(pair);
    pairs.push(pair);
  }

  return pairs.length > 0
    ? `El porcentaje de cada barra es lo que la cuenta ocupa dentro de la marcada que la contiene: ${pairs.join("; ")}.`
    : undefined;
}

function sourceId(centerId: string, year: number): string {
  return `${centerId}|${year}`;
}

function nameOf(source: AnalyticsSource, code: string): string {
  return source.namesByCode.get(code) ?? code;
}

/** Walks up the tree to the first account that is also marked; `undefined` if there is none. */
function nearestMarkedAncestor(
  source: AnalyticsSource,
  code: string,
  marked: ReadonlyMap<string, Series>,
): Series | undefined {
  let current = source.parentByCode.get(code);
  while (current !== undefined) {
    const found = marked.get(current);
    if (found) {
      return found;
    }
    current = source.parentByCode.get(current);
  }
  return undefined;
}
