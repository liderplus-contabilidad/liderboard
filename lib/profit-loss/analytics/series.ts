/**
 * The engine's single entry point. `buildSeries` takes materialized sources and a query and
 * returns comparable series: coverage already applied, container totals already computed, and
 * a hard cap so a wide selection degrades explicitly instead of silently.
 */
import { aggregate, rootSign } from "../derive";
import { comparePeriodRefs, periodsAlign, periodsForYear } from "./period";
import { aggregateCoverage, canReexpress } from "./source";
import type {
  AnalyticsSource,
  PeriodRef,
  Series,
  SeriesBundle,
  SeriesPoint,
  SeriesQuery,
} from "./types";

/**
 * Cap on how many series one query may produce. It belongs to the engine, not to a chart: a
 * grouped bar chart tops out around 8, but small multiples read 24 panels fine, and each view
 * can lower it with `query.limit`.
 */
export const MAX_SERIES = 24;

/**
 * The single definition of accounting sign, owned by `derive` — the same rule `computeResult`
 * applies when it subtracts costs instead of flipping them, non-operating block included. Series
 * always carry the file's own sign; applying this one is an explicit decision of whoever mixes
 * income and expenses on one axis.
 */
export { rootSign as signFor };

export function buildSeries(sources: AnalyticsSource[], query: SeriesQuery): SeriesBundle {
  const byCenterYear = new Map<string, AnalyticsSource>();
  for (const source of sources) {
    byCenterYear.set(sourceId(source.centerId, source.year), source);
  }

  const warnings = new Set<string>();
  const periods = axisFor(query);
  // Only what actually varies gets into the label; anything else is noise on the legend.
  const multiCenter = query.centerIds.length > 1;
  const multiYear = query.years.length > 1;

  const built: Series[] = [];
  for (const code of query.codes) {
    for (const centerId of query.centerIds) {
      for (const year of query.years) {
        const source = byCenterYear.get(sourceId(centerId, year));
        if (!source) {
          warnings.add(
            `No hay datos del centro ${centerNameFor(sources, centerId)} para el año ${year}.`,
          );
          continue;
        }
        if (!canReexpress(source.baseFrequency, query.frequency)) {
          warnings.add(
            `La fuente del centro ${source.centerName} (${year}) tiene base ${source.baseFrequency} y no se puede desagregar a ${query.frequency}.`,
          );
          continue;
        }
        if (!source.valuesByCode.has(code)) {
          warnings.add(`La cuenta ${code} no existe en el centro ${source.centerName} (${year}).`);
          continue;
        }

        const yearPeriods = periods.filter((period) => period.year === year);
        const coverage = aggregateCoverage(source.coverage, source.baseFrequency, query.frequency);
        const pointsFor = (target: string): SeriesPoint[] => {
          const values = aggregate(
            source.valuesByCode.get(target) ?? [],
            source.baseFrequency,
            query.frequency,
          );
          return yearPeriods.map((period) => ({
            period,
            value: coverage.has(period.index) ? (values[period.index] ?? null) : null,
          }));
        };

        const parent = source.parentByCode.get(code);
        built.push({
          key: { code, centerId, year },
          label: labelFor(source, code, { multiCenter, multiYear, year }),
          points: pointsFor(code),
          container: parent
            ? {
                code: parent,
                label: source.namesByCode.get(parent) ?? parent,
                points: pointsFor(parent),
              }
            : null,
        });
      }
    }
  }

  const limit = query.limit ?? MAX_SERIES;
  const truncated = Math.max(0, built.length - limit);
  if (truncated > 0) {
    warnings.add(
      `La selección produce ${built.length} series; se muestran las primeras ${limit} y se descartaron ${truncated}.`,
    );
  }

  return { series: built.slice(0, limit), periods, truncated, warnings: [...warnings] };
}

function sourceId(centerId: string, year: number): string {
  return `${centerId}|${year}`;
}

/** Falls back to the slug when no source of that center is loaded — the warning still names it. */
function centerNameFor(sources: AnalyticsSource[], centerId: string): string {
  return sources.find((source) => source.centerId === centerId)?.centerName ?? centerId;
}

/** Every period of the queried years, ordered by (year, index) and narrowed by `query.periods`. */
function axisFor(query: SeriesQuery): PeriodRef[] {
  const wanted = query.periods;
  return [...query.years]
    .sort((a, b) => a - b)
    .flatMap((year) => periodsForYear(year, query.frequency))
    .filter(
      (period) =>
        !wanted ||
        wanted.some((target) => target.year === period.year && periodsAlign(target, period)),
    )
    .sort(comparePeriodRefs);
}

function labelFor(
  source: AnalyticsSource,
  code: string,
  context: { multiCenter: boolean; multiYear: boolean; year: number },
): string {
  const parts = [source.namesByCode.get(code) ?? code];
  if (context.multiCenter) {
    parts.push(source.centerName);
  }
  if (context.multiYear) {
    parts.push(String(context.year));
  }
  return parts.join(" · ");
}
