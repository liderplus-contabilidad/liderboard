/**
 * The vertical analysis table: one row per account, one column per period, each cell the share
 * that account represents of a BASE ACCOUNT chosen by the reader.
 *
 * It reads the `AnalyticsSource` directly instead of going through a `SeriesQuery` for one
 * reason: a query caps at `CHART_MAX_SERIES` (8) because the palette has eight slots, and this
 * table draws the whole chart of accounts — the real statement declares 131 movement accounts.
 * There is no color to resolve here, so the cap has nothing to protect.
 *
 * The coverage contract of the engine holds unchanged: a period the workspace never received is
 * `null`, never `0`. A base worth `0` in a covered period yields `null` too — dividing by it
 * would invent a number — and the table says so ONCE rather than once per account, because a
 * statement carries dozens of rows and the same notice repeated dozens of times is noise.
 */
import { aggregate } from "../derive";
import { periodLabel, periodsForYear } from "../analytics/period";
import { aggregateCoverage, canReexpress } from "../analytics/source";
import type { AnalyticsSource, PeriodRef } from "../analytics/types";
import type { Frequency } from "../types";
import { intersectWithMarked } from "./presets";

export interface VerticalRow {
  code: string;
  label: string;
  /** 1-based depth in the account tree; what the view indents by. */
  level: number;
  hasChildren: boolean;
  /** Share of the base per visible period; `null` where it cannot be computed. */
  values: (number | null)[];
  /** Share of the base over the whole year — a ratio of sums, not an average of ratios. */
  total: number | null;
}

export interface VerticalAnalysis {
  /** The account every row divides by; `null` when the source does not declare it. */
  base: { code: string; label: string } | null;
  periods: PeriodRef[];
  rows: VerticalRow[];
  /** Spanish notes the card shows verbatim, at most one per cause. */
  warnings: string[];
}

export interface VerticalOptions {
  baseCode: string;
  frequency: Frequency;
  /** Marked periods that narrow the columns; omit for the whole axis. «Total año» ignores them. */
  periods?: readonly PeriodRef[];
  /** Marked accounts that narrow the rows; a marked account keeps its subtree. */
  markedCodes?: readonly string[];
  /** Folded accounts — the same set the Datos tree uses, so "Nivel" reaches this table too. */
  collapsed?: ReadonlySet<string>;
}

export function buildVerticalAnalysis(
  source: AnalyticsSource | undefined,
  options: VerticalOptions,
): VerticalAnalysis {
  const empty: VerticalAnalysis = { base: null, periods: [], rows: [], warnings: [] };
  if (!source || !canReexpress(source.baseFrequency, options.frequency)) {
    return empty;
  }

  const periods = visiblePeriods(source, options);
  const coverage = aggregateCoverage(source.coverage, source.baseFrequency, options.frequency);
  const baseValues = valuesAt(source, options.baseCode, options.frequency);
  const baseLabel = source.namesByCode.get(options.baseCode);
  const baseTotal = yearTotal(source, options.baseCode);

  const parents = new Set(source.parentByCode.values());
  const codes = visibleCodes(source, options);

  const rows = codes.map((code) => {
    const values = valuesAt(source, code, options.frequency);
    return {
      code,
      label: source.namesByCode.get(code) ?? code,
      level: levelOf(source, code),
      hasChildren: parents.has(code),
      values: periods.map((period) =>
        share(
          coverage.has(period.index) ? (values[period.index] ?? null) : null,
          coverage.has(period.index) ? (baseValues[period.index] ?? null) : null,
        ),
      ),
      total: share(yearTotal(source, code), baseTotal),
    };
  });

  return {
    base: baseLabel === undefined ? null : { code: options.baseCode, label: baseLabel },
    periods,
    rows,
    warnings: warningsFor(options.baseCode, baseLabel, baseValues, periods, coverage),
  };
}

/** The X axis, narrowed to the marked periods — matched by index, like every period toggle. */
function visiblePeriods(source: AnalyticsSource, options: VerticalOptions): PeriodRef[] {
  const axis = periodsForYear(source.year, options.frequency);
  if (!options.periods || options.periods.length === 0) {
    return axis;
  }
  const marked = new Set(options.periods.map((period) => period.index));
  return axis.filter((period) => marked.has(period.index));
}

/**
 * The rows, in file order: the marked accounts (each keeping its subtree) minus whatever hangs
 * below a folded one. An ancestor only folds a descendant when the ancestor is itself on the
 * table — otherwise narrowing to `5.1.5` while `5.1` is folded would leave no rows at all.
 */
function visibleCodes(source: AnalyticsSource, options: VerticalOptions): string[] {
  const marked = intersectWithMarked([...source.valuesByCode.keys()], options.markedCodes ?? []);
  const collapsed = options.collapsed;
  if (!collapsed || collapsed.size === 0) {
    return marked;
  }
  const retained = new Set(marked);
  return marked.filter((code) => {
    let parent = source.parentByCode.get(code);
    while (parent !== undefined) {
      if (retained.has(parent) && collapsed.has(parent)) {
        return false;
      }
      parent = source.parentByCode.get(parent);
    }
    return true;
  });
}

/** One account's values re-expressed at the asked frequency; `[]` when it is not in the source. */
function valuesAt(source: AnalyticsSource, code: string, frequency: Frequency): number[] {
  const values = source.valuesByCode.get(code);
  return values ? aggregate(values, source.baseFrequency, frequency) : [];
}

/**
 * Σ of an account over the covered periods of the base frequency — the numerator and the
 * denominator of «Total año». Summing first and dividing once is what makes it the weight of the
 * account in the year; averaging the column percentages would weigh a $100 month like a $900 one.
 */
function yearTotal(source: AnalyticsSource, code: string): number | null {
  const values = source.valuesByCode.get(code);
  if (!values) {
    return null;
  }
  let total = 0;
  for (const index of source.coverage) {
    total += values[index] ?? 0;
  }
  return total;
}

/**
 * The one division of this module. A base that is `null` (period never loaded) or `0` gives
 * `null` rather than a number nobody can read — never `0`, which would say "this account is
 * worth nothing here" when what happened is that the question has no answer.
 */
function share(value: number | null, base: number | null): number | null {
  if (value === null || base === null || base === 0) {
    return null;
  }
  return (value / base) * 100;
}

/** Depth in the tree, 1-based, walking the source's own parent chain. */
function levelOf(source: AnalyticsSource, code: string): number {
  let level = 1;
  let current = source.parentByCode.get(code);
  while (current !== undefined) {
    level += 1;
    current = source.parentByCode.get(current);
  }
  return level;
}

/**
 * What the table has to say out loud. Each cause produces at most ONE notice naming the periods
 * it affects: a base at zero is a property of the column, not of each of the 131 rows under it.
 */
function warningsFor(
  baseCode: string,
  baseLabel: string | undefined,
  baseValues: number[],
  periods: PeriodRef[],
  coverage: ReadonlySet<number>,
): string[] {
  if (baseLabel === undefined) {
    return [`La cuenta base ${baseCode} no está en este centro; la tabla queda sin porcentajes.`];
  }

  const covered = periods.filter((period) => coverage.has(period.index));
  const zero = covered.filter((period) => (baseValues[period.index] ?? 0) === 0);
  const negative = covered.filter((period) => (baseValues[period.index] ?? 0) < 0);

  const warnings: string[] = [];
  if (zero.length > 0) {
    warnings.push(
      `La cuenta base no tuvo movimiento en ${listPeriods(zero)}: ${
        zero.length === 1 ? "esa columna queda" : "esas columnas quedan"
      } sin porcentaje.`,
    );
  }
  if (negative.length > 0) {
    warnings.push(
      `La cuenta base es negativa en ${listPeriods(negative)}: esos porcentajes se leen al revés.`,
    );
  }
  return warnings;
}

/** "Ene", "Ene y Feb", "Ene, Feb y Mar" — the wording a notice needs to name its periods. */
function listPeriods(periods: PeriodRef[]): string {
  const labels = periods.map((period) => periodLabel(period));
  if (labels.length <= 1) {
    return labels[0] ?? "";
  }
  return `${labels.slice(0, -1).join(", ")} y ${labels[labels.length - 1]}`;
}
