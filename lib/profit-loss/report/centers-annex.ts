/**
 * The by-centers annex: one column per center plus the Consolidado, answering the one question
 * that only exists in multi mode — how much each center contributes.
 *
 * It closes the report rather than repeating it: the body already shows whatever the filter bar
 * resolved (one center, or the Consolidado), and repeating the whole thing per center would turn
 * an eight-center workspace into thirty pages nobody reads.
 *
 * **What it sums.** Every period the report covers — the marked ones, or the whole axis — across
 * every visible year. A Datos column may not add 2025 to 2026, because a column headed «Ene»
 * over two years would be a figure nobody asked for; here there is no such ambiguity, because
 * the section names exactly what it summed and the cover declares the same scope. The question
 * «cuánto aportó cada centro en lo que cubre este informe» is well posed over that span.
 */
import { buildSeries } from "../analytics/series";
import type { AnalyticsSource, PeriodRef, SeriesBundle } from "../analytics/types";
import { NON_OPERATIONAL_ROOT } from "../segment";
import type { Frequency } from "../types";
import type { CentersAnnex, CentersAnnexColumn, CentersAnnexRow } from "./types";

const REVENUE_ROOT = "4";
const EXPENSE_ROOT = "5";

/** No cap: the annex has one column per center and the palette's eight slots are irrelevant. */
const UNCAPPED = Number.MAX_SAFE_INTEGER;

export interface CentersAnnexInput {
  /** Selector entries WITHOUT the Consolidado — it is appended as the closing column. */
  centers: readonly { id: string; name: string }[];
  sources: readonly AnalyticsSource[];
  years: readonly number[];
  frequency: Frequency;
  /** Marked periods; empty means the whole axis. */
  periods?: readonly PeriodRef[];
}

export function buildCentersAnnex(input: CentersAnnexInput): CentersAnnex {
  const segmented = input.sources.some((source) => source.valuesByCode.has(NON_OPERATIONAL_ROOT));
  const roots = [REVENUE_ROOT, EXPENSE_ROOT, ...(segmented ? [NON_OPERATIONAL_ROOT] : [])];

  const bundle = buildSeries([...input.sources], {
    codes: roots,
    centerIds: input.centers.map((center) => center.id),
    years: [...input.years],
    frequency: input.frequency,
    ...(input.periods && input.periods.length > 0 ? { periods: [...input.periods] } : {}),
    limit: UNCAPPED,
  });

  const columns: CentersAnnexColumn[] = [
    ...input.centers.map((center) => ({ id: center.id, name: center.name })),
    { id: "consolidado", name: "Consolidado" },
  ];

  const revenue = rowOf(bundle, REVENUE_ROOT, input.centers);
  const expense = rowOf(bundle, EXPENSE_ROOT, input.centers);
  const nonOperational = segmented ? rowOf(bundle, NON_OPERATIONAL_ROOT, input.centers) : undefined;

  // 4 − 5 − 6, the module's one sign rule: income adds, both expense roots subtract.
  const result = revenue.map((value, index) =>
    subtract(subtract(value, expense[index]), nonOperational?.[index] ?? null),
  );
  const margin = result.map((value, index) => share(value, revenue[index]));

  const rows: CentersAnnexRow[] = [
    { id: "ingresos", label: "Ingresos", kind: "amount", values: withTotal(revenue) },
    { id: "gastos", label: "Costos y Gastos", kind: "amount", values: withTotal(expense) },
    ...(nonOperational
      ? [
          {
            id: "no-operativos",
            label: "Gastos no operacionales",
            kind: "amount" as const,
            values: withTotal(nonOperational),
          },
        ]
      : []),
    { id: "utilidad", label: "Utilidad o Pérdida", kind: "result", values: withTotal(result) },
    {
      id: "margen",
      label: "Utilidad sobre ingresos",
      kind: "percent",
      // The Consolidado's margin is its OWN ratio of sums, never the average of the centers':
      // a small center at 40% and a large one at 5% do not average to 22.5%.
      values: [...margin, share(sum(result), sum(revenue))],
    },
  ];

  return { columns, rows };
}

/** One value per center: the sum of that account over every period the bundle carries. */
function rowOf(
  bundle: SeriesBundle,
  code: string,
  centers: readonly { id: string }[],
): (number | null)[] {
  return centers.map((center) => {
    const series = bundle.series.filter(
      (candidate) => candidate.key.code === code && candidate.key.centerId === center.id,
    );
    const values = series.flatMap((entry) =>
      entry.points.map((point) => point.value).filter((value): value is number => value !== null),
    );
    // No covered period at all is NOT a zero: the column stays empty, like everywhere else.
    return values.length > 0 ? values.reduce((total, value) => total + value, 0) : null;
  });
}

/** The centers' values plus the Consolidado that closes the row. */
function withTotal(values: readonly (number | null)[]): (number | null)[] {
  return [...values, sum(values)];
}

function sum(values: readonly (number | null)[]): number | null {
  const present = values.filter((value): value is number => value !== null);
  return present.length > 0 ? present.reduce((total, value) => total + value, 0) : null;
}

function subtract(a: number | null, b: number | null): number | null {
  if (a === null && b === null) {
    return null;
  }
  return (a ?? 0) - (b ?? 0);
}

/** A percentage, or `null` when the base is missing or zero — never a division by zero. */
function share(value: number | null, base: number | null): number | null {
  if (value === null || base === null || base === 0) {
    return null;
  }
  return (value / base) * 100;
}
