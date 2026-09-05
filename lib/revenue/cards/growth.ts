/**
 * 2 · **Crecimiento contra años anteriores** — the most recent marked year against each of the
 * others, month by month and over the span the two SHARE.
 *
 * Nothing here divides: `growth.ts` (the sibling one directory up, `../growth`) is THE definition of
 * a variation and this file only asks it. A builder that did its own subtraction would be the second
 * definition, and the second definition is how the source workbook ended up with four wrong numbers.
 */
import type { ChartCardSpec, ChartSeries, ChartTable, ChartTableRow } from "@/lib/charts/types";
import { MONTHS_FULL_ES, MONTHS_SHORT_ES } from "@/lib/date";
import type { RevenueYearReading } from "../derive";
import { readRevenueYears, referenceYearOf } from "../derive";
import { monthSpanLabel } from "../filters";
import { growthAgainstAll, type GrowthAgainstYear } from "../growth";
import { GUIDE_REVENUE_GROWTH } from "../guides";
import type { RevenueCardsInput } from "../types";
import {
  axisTooltip,
  baseOption,
  categoryAxis,
  currencyAxis,
  legendFor,
  money,
  percent,
  percentAxis,
  signedMoney,
  signedPercent,
  yearColor,
  zeroLine,
} from "./chrome";

/** «Ver en» — the growth's UNIT. It changes how the same numbers are written, never which they are. */
export type GrowthUnit = "dolares" | "porcentaje";

/** What the screen opens in. */
export const DEFAULT_GROWTH_UNIT: GrowthUnit = "dolares";

export const GROWTH_CARD_ID = "crecimiento";

/** The reference against every base, in ascending order of base year. Shared with the header's
 *  tiles, which ask the same question against the immediately previous year only. */
export function growthOf(
  reference: RevenueYearReading,
  bases: readonly RevenueYearReading[],
): GrowthAgainstYear[] {
  return growthAgainstAll(
    reference.monthly,
    bases.map((base) => ({ year: base.year, monthly: base.monthly })),
  );
}

/**
 * Bars grouped from the zero line: the sign is read off the AXIS, and the colour follows the base
 * year. A chart that painted a fall red would be encoding the sign twice and teaching the reader that
 * a colour means bad news.
 *
 * «Ver en» changes the UNIT and not the data — the table always carries both.
 */
export function buildGrowthCard(input: RevenueCardsInput, unit: GrowthUnit): ChartCardSpec {
  const readings = readRevenueYears(input.years, input.months);
  const reference = referenceYearOf(readings);
  const bases = readings.slice(0, -1);
  const growths = reference ? growthOf(reference, bases) : [];
  const inPercent = unit === "porcentaje";

  const shared = growths[0]?.sharedMonths ?? [];
  /**
   * **The axis is the SHARED tramo, not the marked span.** They are different sets whenever the
   * reference is half-loaded, and the difference is dead columns: with 2026 reaching julio and 2024
   * whole, the marked span is twelve months and only seven of them can carry a bar — agosto a
   * diciembre drew an empty fifth of the plot with nothing to hover and nothing in the tooltip.
   *
   * It is also what makes the card agree with itself: the note, the TOTAL row and the subtitle all
   * already name `growths[0].sharedMonths` as THE tramo compared, so an axis wider than it was the
   * one part of the card contradicting the other three.
   *
   * With no base year there is nothing shared and nothing to draw; the table keeps the marked span so
   * the twelve month rows are still there for «marca otro año para comparar».
   */
  const axis = growths.length > 0 ? shared : [...input.months].sort((a, b) => a - b);
  const labels = axis.map((month) => MONTHS_SHORT_ES[month]);

  const baseYears = growths.map((entry) => entry.baseYear);
  // With few columns the default grouped width leaves the bars stranded in an empty plot; with many it
  // is what stops them touching. It is the count on the axis that decides, not the card.
  const barMaxWidth = axis.length <= 6 ? 30 : 18;

  const series: ChartSeries[] = growths.map((entry, index) => ({
    id: `vs-${entry.baseYear}`,
    name: `vs ${entry.baseYear}`,
    type: "bar",
    data: axis.map((month) => {
      const point = entry.points[month];
      return inPercent ? point.percent : point.delta;
    }),
    itemStyle: { color: yearColor(entry.baseYear, baseYears) },
    barMaxWidth,
    /**
     * **This card writes NO figure over its bars.**
     *
     * What it draws is a variation, and a variation is read off the ZERO LINE: whether the bar hangs
     * above it or below, and how far. That reading survives at a glance across a whole year of
     * columns, and it is what a printed amount interrupts — a month packs one bar per base year into
     * a single category slot, so a signed figure some 90px wide either sits across the fills beside
     * it or steps aside into a staircase the reader has to walk row by row. Neither is faster than
     * the shape it covers.
     *
     * The figures are not out of reach: the tooltip gives the month's, and the table twin carries Δ$
     * AND Δ% against every base year, always and whichever unit the chart is in.
     */
    // The ZERO LINE, drawn ONCE — on the first series, because a mark line per series would paint the
    // same rule three times over itself. It is what turns the axis into the divider between a gain and
    // a loss: without it, a bar hanging below the grid's first line is read as a small bar and not as
    // a fall.
    ...(index === 0 ? { markLine: zeroLine() } : {}),
  }));

  const sharedLabel = monthSpanLabel(shared);
  const note = growthNote(reference, growths);

  return {
    id: GROWTH_CARD_ID,
    title: "Crecimiento contra años anteriores",
    subtitle: reference
      ? bases.length > 0
        ? `${reference.year} medido contra ${bases.map((entry) => entry.year).join(", ")}${
            sharedLabel ? ` · ${sharedLabel}, el tramo que comparten` : " · sin tramo compartido"
          }`
        : `${reference.year} · marca otro año para comparar`
      : input.period,
    option:
      growths.length > 0 && shared.length > 0
        ? {
            ...baseOption(
              categoryAxis(labels),
              inPercent ? percentAxis() : currencyAxis(),
              legendFor(growths.length > 1),
            ),
            tooltip: axisTooltip(inPercent ? percent : money),
            series,
          }
        : null,
    table: growthTable(growths, axis),
    ...(note ? { note } : {}),
    guide: GUIDE_REVENUE_GROWTH,
    height: 280,
  };
}

/** Δ dollars AND Δ percent against every base — both always, because «Ver en» moves the chart's unit
 *  and the table is where the other one has to stay reachable. */
function growthTable(growths: readonly GrowthAgainstYear[], axis: readonly number[]): ChartTable {
  const columns = growths.flatMap((entry) => [
    `vs ${entry.baseYear} · Δ $`,
    `vs ${entry.baseYear} · Δ %`,
  ]);

  const rows: ChartTableRow[] = axis.map((month) => ({
    id: `mes-${month}`,
    label: MONTHS_FULL_ES[month],
    values: growths.flatMap((entry) => [
      signedMoney(entry.points[month].delta),
      signedPercent(entry.points[month].percent),
    ]),
  }));

  const shared = growths[0]?.sharedMonths ?? [];
  return {
    columns,
    rows: [
      ...rows,
      {
        id: "total",
        label: monthSpanLabel(shared) ?? "Sin tramo compartido",
        emphasis: true,
        values: growths.flatMap((entry) => [
          signedMoney(entry.total.delta),
          signedPercent(entry.total.percent),
        ]),
      },
    ],
  };
}

/**
 * The note the workbook needed and never had: which span the totals were measured over, and that it
 * is NOT the full year of the base when the reference is half-loaded.
 */
function growthNote(
  reference: RevenueYearReading | null,
  growths: readonly GrowthAgainstYear[],
): string | null {
  if (!reference || growths.length === 0) {
    return null;
  }
  const first = growths[0];
  if (first.sharedMonths.length === 0) {
    return "Los años marcados no comparten ningún mes cargado, así que no hay tramo sobre el que comparar.";
  }
  if (first.sharedMonths.length === 12) {
    return null;
  }
  return `El tramo comparado es ${monthSpanLabel(first.sharedMonths)}, que es lo que ${reference.year} tiene cargado: un año a medias nunca se mide contra los doce meses del otro.`;
}
