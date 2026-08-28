/**
 * WHAT AN ACCOUNT IS MADE OF: the breakdown of a line among its DIRECT children.
 *
 * It is born of the question that follows a bar of the annex — «I have this much in medical fees, but
 * what makes it up?» — and that is why it breaks down the next level and not the leaves at the
 * bottom: `5.5.01.02` hangs twenty-seven sections that in turn hang ninety accounts, and showing all
 * ninety at once is not a breakdown but another illegible list. The next level is reached by GOING
 * DOWN, which is a gesture and not a parameter.
 *
 * What this file does NOT decide is where it is drawn: the window that shows it belongs to the view.
 * Here there is only what can be wrong — which rows go in, in what order, what part of the parent
 * each one is and whether the sum squares.
 */
import type { AmountEntry } from "../analytics/structure";
import { shareOf } from "./expense-distribution";

/**
 * How many rows the breakdown draws before falling silent about the tail. Twelve fit in the window
 * with the ranking's same density of ~34 px per row; the rest is still in the table twin, which does
 * not cut, and the note says how many they are. They are deliberately not folded into an «Otros»:
 * here the question is what the account is made of, and a synthetic row with the tail's sum does not
 * answer that — the table does, by naming them.
 */
export const BREAKDOWN_MAX_ROWS = 12;

export interface BreakdownRow extends AmountEntry {
  /** What part of the parent it is. `null` when the parent gives no base (no coverage or zero). */
  share: number | null;
  /** Whether the row in turn has a breakdown — what decides whether another level can be gone into. */
  hasChildren: boolean;
}

export interface AccountBreakdown {
  /** The ones that are drawn, largest to smallest. */
  rows: BreakdownRow[];
  /** Every one that moved, uncut: it is what the table twin prints. */
  all: BreakdownRow[];
  /** Children the plan declares and that did not move in the span. They are counted, not named. */
  idle: number;
  /** How many were left out of the drawing by the cut. */
  hidden: number;
  /** The parent's amount, which is the breakdown's 100 %. */
  total: number | null;
  /**
   * Whether the children add up to the parent. It should ALWAYS be true —the engine recomputes every
   * parent from its children (`computeRollups`)—, and precisely for that reason it is checked: if it
   * ever stopped being so, the breakdown would be contradicting the bar that opened it, and that has
   * to be said instead of being left as a difference nobody sums by hand.
   */
  balances: boolean;
}

/** Half a cent: below that the difference is floating-point noise, not an imbalance. */
const CENT = 0.005;

/**
 * The breakdown, from the amounts the engine already summed over the span for the children.
 *
 * The idle ones go and are counted, the annex's and the ranking's rule: a plan declares every account
 * whether or not it has movement, and `5.5.01.02` brings several at zero all year. The NEGATIVE ones
 * stay — a credit note inside an expense is a finding—, and that is why the order is by signed value
 * and not by magnitude: what is being read is a breakdown, and there a refund goes at the end.
 *
 * The percentage goes through `shareOf`, this side of the module's only definition of «percentage
 * over a total» —the one the annex's two columns and the ficha already share—, so it inherits that a
 * `null` or `0` total gives `null` and never `0 %`.
 */
export function buildAccountBreakdown(
  entries: readonly AmountEntry[],
  options: { total: number | null; hasChildren: (code: string) => boolean; max?: number },
): AccountBreakdown {
  const moving = entries.filter((entry) => entry.value !== 0);
  const all = [...moving]
    .sort((a, b) => b.value - a.value)
    .map((entry) => ({
      ...entry,
      share: shareOf(entry.value, options.total),
      hasChildren: options.hasChildren(entry.code),
    }));
  const max = options.max ?? BREAKDOWN_MAX_ROWS;
  const sum = moving.reduce((total, entry) => total + entry.value, 0);

  return {
    rows: all.slice(0, max),
    all,
    idle: entries.length - moving.length,
    hidden: Math.max(0, all.length - max),
    total: options.total,
    balances: options.total === null || Math.abs(sum - options.total) < CENT,
  };
}

/**
 * The breakdown's footnote, in plain Spanish.
 *
 * It ALWAYS opens by saying what the percentage is measured against, with the figure: a «51.5 %» that
 * does not say what it is 51.5 % of forces deducing the denominator from the window's title, and that
 * is the kind of computation nobody does and everybody assumes. It is the same rule by which the
 * annex's note opens with its balance and by which `describeShares` names the base of every annotated
 * percentage.
 *
 * The rest comes afterwards and only when it applies: what was left out of the drawing —because it
 * explains why the table has more rows than bars—, what is idle, and the BALANCE only when it does
 * NOT square, since claiming «they add up to the total» every time would be noise in the normal case,
 * which is all of them.
 */
export function describeAccountBreakdown(
  breakdown: AccountBreakdown,
  options: { label: string; format: (value: number) => string },
): string {
  const parts: string[] = [];
  parts.push(
    breakdown.total === null
      ? `Los porcentajes son la parte de ${options.label} que representa cada cuenta.`
      : `Los porcentajes son la parte de ${options.label} (${options.format(breakdown.total)}) que representa cada cuenta.`,
  );
  if (breakdown.hidden > 0) {
    parts.push(
      `Se dibujan las ${breakdown.rows.length} mayores; la tabla lista las ${breakdown.all.length}.`,
    );
  }
  if (breakdown.idle > 0) {
    parts.push(
      `${breakdown.idle} ${breakdown.idle === 1 ? "cuenta no se movió" : "cuentas no se movieron"} en el tramo.`,
    );
  }
  if (!breakdown.balances && breakdown.total !== null) {
    const sum = breakdown.all.reduce((total, entry) => total + entry.value, 0);
    parts.push(
      `Sus cuentas suman ${options.format(sum)} y la cuenta declara ${options.format(breakdown.total)}: la diferencia son ${options.format(sum - breakdown.total)}.`,
    );
  }
  return parts.join(" ");
}
