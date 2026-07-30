/**
 * The level of detail the PRINTED statement shows.
 *
 * A plan of accounts nests up to six levels, and a real close moves accounts at every one of
 * them. On screen that is fine — the tree folds and unfolds. On paper it is not a report: the
 * deep accounts arrive indented into a column too narrow for their names, and page after page
 * carries rows nobody reads at that level of detail.
 *
 * So the report caps the depth. This module answers which nodes to fold to show the tree down
 * to a given level, and how many accounts that leaves out — because a report that silently
 * drops detail is worse than one that never had it.
 *
 * It works over `AccountOption[]`, which already carries `level` and `hasChildren`, rather than
 * over `AccountRow[]` like `filter.ts`'s `collapsedForLevel`. Same rule, different input: the
 * report has the derived options in hand, and reaching for the other function would mean
 * rebuilding the account tree for an answer already computed.
 */
import type { AccountOption } from "../filter";

/** Fully expanded — no cap at all. */
export const FULL_DETAIL = 0;

/** The levels the report offers, plus «todo». Level 3 is the usual depth of a printed close. */
export const REPORT_LEVELS = [2, 3, 4, FULL_DETAIL] as const;

/** What the report opens on: deep enough to be useful, shallow enough to stay a document. */
export const DEFAULT_REPORT_LEVEL = 3;

export function levelLabel(level: number): string {
  return level === FULL_DETAIL ? "Todo el detalle" : `Hasta nivel ${level}`;
}

/**
 * Which parent codes to fold so the tree reads down to `level`: every parent AT or BELOW that
 * depth hides its children. `FULL_DETAIL` folds nothing.
 */
export function collapsedAtLevel(options: readonly AccountOption[], level: number): Set<string> {
  if (level === FULL_DETAIL) {
    return new Set();
  }
  return new Set(
    options.filter((option) => option.hasChildren && option.level >= level).map((o) => o.code),
  );
}

/**
 * How many accounts the cap leaves out — the ones with a folded ancestor. Said out loud in the
 * report, next to the total, so nobody takes the printed tree for the whole chart of accounts.
 */
export function hiddenAccountCount(
  options: readonly AccountOption[],
  collapsed: ReadonlySet<string>,
): number {
  if (collapsed.size === 0) {
    return 0;
  }
  return options.filter((option) => hasCollapsedAncestor(option.code, collapsed)).length;
}

function hasCollapsedAncestor(code: string, collapsed: ReadonlySet<string>): boolean {
  for (let cut = code.lastIndexOf("."); cut !== -1; cut = code.lastIndexOf(".", cut - 1)) {
    if (collapsed.has(code.slice(0, cut))) {
      return true;
    }
  }
  return false;
}
