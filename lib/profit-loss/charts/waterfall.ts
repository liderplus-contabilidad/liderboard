/**
 * The Estado de Resultados told as a sequence: what came in, what took it away, and what was
 * left. It is the one chart of the dashboard that mixes income and expenses on a single axis,
 * which is exactly what the engine exposed `signFor` for — the values stay as the file stores
 * them (expenses positive) and the sign is applied HERE, once, when the direction of a step is
 * decided.
 *
 * The layer is pure: a materialized source in, steps out, no renderer in sight. That is what
 * makes the invariant a test instead of an inspection — the last step closes on the same number
 * `computeResult` puts in the «Utilidad o Pérdida» row of the Datos tab, and no grouping rule
 * is allowed to lose or duplicate a cent on the way there.
 */
import { periodLabel, periodsForYear } from "../analytics/period";
import { signFor } from "../analytics/series";
import { aggregateCoverage, canReexpress } from "../analytics/source";
import type { AnalyticsSource, PeriodRef } from "../analytics/types";
import { aggregate } from "../derive";
import type { Frequency } from "../types";
import { childrenOf, REVENUE_ROOT } from "./presets";

/**
 * One bar of the cascade.
 *
 * A **total** is "how much there is" and therefore anchored at zero: the income the statement
 * opened with, and the result it closed on, are both read against the axis origin. A **delta**
 * is "how much left", so it floats — it starts where the previous step ended and its height is
 * the amount itself. That geometry IS the arithmetic of the statement, which is why `start` and
 * `end` are computed here and not while assembling an ECharts option: computed there, the only
 * way to check them would be to look at the screen.
 */
export interface WaterfallStep {
  kind: "total" | "delta";
  /** Account code, or `RESULT_CODE` for the closing total, which no account owns. */
  code: string;
  label: string;
  /** Signed: positive rises, negative falls. A total carries its own value. */
  value: number;
  /** Base of the transparent stretch; always 0 for a total. */
  start: number;
  /** `start + value`. */
  end: number;
}

export interface WaterfallOptions {
  /** The axis in play — always the "Ver por" control's, like every other card. */
  frequency: Frequency;
  /** Restricts the axis to these periods; absent = every period of the year. */
  periods?: readonly PeriodRef[];
  /** Expense steps before the tail folds into «Otros gastos». */
  maxSteps?: number;
}

export interface WaterfallResult {
  /** Empty when the source covers no period at all — the card shows its empty state. */
  steps: WaterfallStep[];
  /** The periods actually summed, in order. The range the card declares comes from here. */
  periods: PeriodRef[];
  /** How many expense groups folded into «Otros gastos»; 0 when none did. */
  grouped: number;
  warnings: string[];
}

/** The closing total belongs to no account, so it carries a code of its own. */
export const RESULT_CODE = "resultado";

/** Neither does the folded tail. */
export const OTHERS_CODE = "otros-gastos";

/**
 * Expense steps before the tail folds. A statement opens into twenty-three groups and a comb of
 * twenty-three bars is not read; two bars explain nothing. Eight is where it still reads.
 */
export const MAX_EXPENSE_STEPS = 8;

/**
 * Share of the spend above which a group is opened into its own groups. A bar that carries most
 * of the money and no name anyone can act on is the failure this cascade exists to avoid; below
 * this weight a group is already a readable answer and opening it only adds bars.
 */
export const HEAVY_SHARE = 0.4;

/** Half a cent — below it a residual is float noise, not a step the reader is missing. */
const EPSILON = 0.005;

/**
 * The steps of one source over the periods it covers.
 *
 * The order is the statement's own: the income total, a descending step per expense group, and
 * the result. Nothing here re-implements the engine — `aggregate` re-expresses the values,
 * `aggregateCoverage` says which periods exist, and `signFor` gives each step its direction.
 */
export function buildWaterfall(
  source: AnalyticsSource,
  options: WaterfallOptions,
): WaterfallResult {
  const warnings: string[] = [];
  const empty = { steps: [], periods: [], grouped: 0 };

  if (!canReexpress(source.baseFrequency, options.frequency)) {
    warnings.push(
      `La fuente del centro ${source.centerName} tiene base ${source.baseFrequency} y no se puede desagregar a ${options.frequency}.`,
    );
    return { ...empty, warnings };
  }

  const coverage = aggregateCoverage(source.coverage, source.baseFrequency, options.frequency);
  const periods = waterfallAxis(source, options).filter((period) => coverage.has(period.index));
  if (periods.length === 0) {
    // No cascade rather than a row of steps at zero: the file has no movement to decompose.
    return { ...empty, warnings };
  }

  const sumOf = (code: string): number => {
    const values = aggregate(
      source.valuesByCode.get(code) ?? [],
      source.baseFrequency,
      options.frequency,
    );
    return periods.reduce((sum, period) => sum + (values[period.index] ?? 0), 0);
  };

  const roots = rootsOf(source);
  for (const root of roots) {
    if (signFor(root) === 0) {
      warnings.push(
        `La cuenta raíz ${root} no es de ingresos (4), costos/gastos (5) ni gastos no operacionales (6); se excluye de la cascada.`,
      );
    }
  }

  // The same arithmetic `computeResult` applies: income adds, cost subtracts, and neither is
  // stored flipped. It is computed from the ROOTS, so no grouping rule can move it.
  const incomeRoots = roots.filter((code) => signFor(code) === 1);
  const expenseRoots = roots.filter((code) => signFor(code) === -1);
  const income = incomeRoots.reduce((sum, code) => sum + sumOf(code), 0);
  const expense = expenseRoots.reduce((sum, code) => sum + sumOf(code), 0);
  const result = income - expense;

  const asGroups = (codes: string[]): WaterfallGroup[] =>
    codes
      .map((code) => ({ code, label: source.namesByCode.get(code) ?? code, amount: sumOf(code) }))
      // A group at zero adds no reading and takes a slot; the tail below still accounts for it.
      .filter((group) => group.amount !== 0);

  const groups = openHeavy(
    source,
    asGroups(expenseRoots.flatMap((root) => groupsUnder(source, root))),
    expense,
    asGroups,
  ).sort((a, b) => b.amount - a.amount);

  const kept = groups.slice(0, options.maxSteps ?? MAX_EXPENSE_STEPS);
  const head = incomeRoots[0] ?? REVENUE_ROOT;

  const steps: WaterfallStep[] = [
    {
      kind: "total",
      code: head,
      label: source.namesByCode.get(head) ?? "Ingresos",
      value: income,
      start: 0,
      end: income,
    },
  ];

  let running = income;
  for (const group of kept) {
    // The file stores the expense positive; the direction comes from `signFor` and from
    // nowhere else, so a negative income row keeps the sign it already has.
    const value = signFor(group.code) * group.amount;
    steps.push({ kind: "delta", ...group, value, start: running, end: running + value });
    running += value;
  }

  // The tail is the RESIDUAL against the result, not the sum of what was cut. Written this way
  // the cascade cannot lose a cent to a rounding, an orphan group or a rule added later: what
  // the steps do not explain is exactly what «Otros gastos» carries.
  const residual = result - running;
  if (Math.abs(residual) > EPSILON) {
    steps.push({
      kind: "delta",
      code: OTHERS_CODE,
      label: "Otros gastos",
      value: residual,
      start: running,
      end: result,
    });
  }

  steps.push({
    kind: "total",
    code: RESULT_CODE,
    label: result < 0 ? "Pérdida" : "Utilidad",
    value: result,
    start: 0,
    end: result,
  });

  return { steps, periods, grouped: groups.length - kept.length, warnings };
}

/** One expense group before it becomes a step. */
interface WaterfallGroup {
  code: string;
  label: string;
  amount: number;
}

/**
 * Opens the group that carries too much of the spend to explain itself, and keeps opening while
 * one does.
 *
 * The single-child rule alone stops at the first fork, and the real chart of accounts forks
 * immediately: `5` has `5.1 Costos de Venta y Producción` and `5.2 Gastos`, so the cascade came
 * out as two bars — arithmetically right and useless, because 80% of the money sat inside one of
 * them and the biggest single expense (the rent) was invisible. Opening the heavy group puts it
 * back on screen without turning the rest into a comb.
 *
 * It always terminates: every pass replaces a group with strictly deeper ones, and a leaf can no
 * longer be opened.
 */
function openHeavy(
  source: AnalyticsSource,
  groups: WaterfallGroup[],
  total: number,
  asGroups: (codes: string[]) => WaterfallGroup[],
): WaterfallGroup[] {
  const threshold = Math.abs(total) * HEAVY_SHARE;
  let current = groups;

  for (;;) {
    const heaviest = current
      .filter((group) => opens(source, group.code))
      .reduce<WaterfallGroup | null>(
        (biggest, group) => (!biggest || group.amount > biggest.amount ? group : biggest),
        null,
      );
    if (!heaviest || Math.abs(heaviest.amount) <= threshold) {
      return current;
    }
    current = current.flatMap((group) =>
      group.code === heaviest.code ? asGroups(groupsUnder(source, group.code)) : [group],
    );
  }
}

/** Whether a group has anything inside it — a movement account opens into itself. */
function opens(source: AnalyticsSource, code: string): boolean {
  const inside = groupsUnder(source, code);
  return inside.length > 1 || inside[0] !== code;
}

/**
 * The groups a root opens into: descend while the node has exactly one child, then take the
 * siblings. The real files nest `5 → 5.1 Gastos Operacionales → {5.1.1, 5.1.5}`, where the
 * direct children of `5` are ONE bar that explains nothing and the leaves are twenty-three that
 * cannot be read. The single-child rule lands on the level where the tree actually opens.
 */
export function groupsUnder(source: AnalyticsSource, root: string): string[] {
  let node = root;
  let children = childrenOf(source, node);
  while (children.length === 1) {
    node = children[0];
    children = childrenOf(source, node);
  }
  return children.length === 0 ? [node] : children;
}

/** Accounts with no parent in the source — what `computeResult` sums with its sign. */
function rootsOf(source: AnalyticsSource): string[] {
  return [...source.valuesByCode.keys()].filter((code) => !source.parentByCode.has(code));
}

/**
 * The range the card declares, taken from the periods the derivation actually summed and never
 * from the file's year: a statement that reaches July is «Ene–Jul», not 2026.
 */
export function waterfallRangeLabel(periods: readonly PeriodRef[]): string {
  if (periods.length === 0) {
    return "";
  }
  const first = periodLabel(periods[0]);
  const last = periodLabel(periods[periods.length - 1]);
  return first === last ? first : `${first}–${last}`;
}

/** Every period of the source's year at `frequency`, narrowed by `options.periods`. */
export function waterfallAxis(source: AnalyticsSource, options: WaterfallOptions): PeriodRef[] {
  const wanted = options.periods;
  return periodsForYear(source.year, options.frequency).filter(
    (period) => !wanted || wanted.some((target) => target.index === period.index),
  );
}
