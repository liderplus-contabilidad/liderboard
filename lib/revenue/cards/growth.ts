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
  directLabel,
  fitBarWidth,
  fitDirectLabel,
  GROUPED_BAR_GAP,
  labelHeadroom,
  legendFor,
  MAX_LABEL_ROWS,
  type LabelFit,
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

/** Up to how many months on the axis the variation is written over the bar. Past it the figures are
 *  in the cursor and in the table — see `writesFigures`. */
const MAX_LABELLED_MONTHS = 3;

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
 *
 * **This card has NO solid body, and that is deliberate.** Every other card of the module offers one,
 * so the absence has to be written down or it reads as an oversight: what this one draws is a
 * variation, and a variation is read against the ZERO — whether the mark hangs above the line or
 * below it. `zeroLine` is a `markLine` and `echarts-gl` has none, so on the stage that line becomes a
 * floor the reader has to infer from where the solids start, and each one is a body whose base is
 * hidden behind the body in front of it. The shape that carries the reading is the flat one.
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
  // One bar per base year inside every month's column: what is left over after dividing the band is
  // the air between them, and that division is the fit's job and not a number written here.
  const barMaxWidth = fitBarWidth(axis.length, growths.length);
  /** There is a base year AND a month the two share: without both there is nothing to draw, in any
   *  body and on either axis. */
  const drawable = growths.length > 0 && shared.length > 0;

  /**
   * **Con UN solo mes compartido el eje son los AÑOS BASE, no el mes.**
   *
   * It is the module's recurring figure —the ratio cards resolve it the same way, on the AXIS and
   * never on a control—: what the marks differ in is what goes on the axis. With several months the
   * card follows a trajectory and the base years are its series; with one, the month distinguishes
   * nothing —it is a single label under everything— and five series pile into ONE category slot,
   * capped at 30 px and stranded as an island in the middle of an empty plot. The variable that does
   * vary there is the base year, so it takes the axis and the bars spread over the whole width, the
   * way «Ventas por año» spreads its years right above.
   *
   * The legend goes with it: naming «vs 2018» twice, once under the bar and once in a swatch below,
   * is the legend saying what the axis already said.
   */
  const byBase = drawable && shared.length === 1;
  const singleMonth = shared[0];
  const baseLabels = growths.map((entry) => `vs ${entry.baseYear}`);
  const baseValues = growths.map((entry) => {
    const point = entry.points[singleMonth];
    return inPercent ? point.percent : point.delta;
  });
  /**
   * **La cifra va escrita sobre cada barra, con su signo.**
   *
   * Two things make it possible where it was not before, and both are the module's own rules rather
   * than anything invented here:
   *
   * - **Each base year writes on its OWN ROW** (`labelDistance`). A month packs one bar per base year
   *   into a single column, and a signed figure is some 90 px wide, so measured against ONE strip
   *   they could not coexist — measured against as many strips as there are series, what each row
   *   holds is one figure per COLUMN, which is the same density the annual card writes at. Past
   *   `MAX_LABEL_ROWS` rows the figures lose their CENTS and never the figure: five rows of
   *   «+$155,079.71» eat a third of the card, and what a variation is read for is its size.
   * - **The SIGN chooses the side.** A falling bar's rect runs from zero downwards, so its `"top"`
   *   edge IS the zero line and every negative figure would park on the axis, one on top of another.
   *   `position` takes no function, so it is resolved per DATUM — the one thing `ChartBarDatum.label`
   *   exists for — and each figure lands at the end of its own bar: above a gain, below a fall.
   *
   * `hideOverlap` stays on for what neither rule catches: two near-zero bars of the same month whose
   * figures meet at the axis. What it drops is a label, never a bar, and the table twin carries Δ$ and
   * Δ% against every base year whichever unit the chart is in.
   */
  /**
   * **Up to three months the figures are WRITTEN; past that they live in the cursor.**
   *
   * The rows below do make a signed figure fit at any density —that is what they are for— but fitting
   * is not the same as being read: seven months of five base years is thirty-five amounts, and a
   * reader who has to walk that grid to find one is slower than a reader who hovers the month. What
   * survives the crowd is the SHAPE —how far each bar reaches from the zero line— and the figures
   * stay one hover away in the tooltip, which gives the whole month at once, and in the table twin,
   * which gives Δ$ and Δ% against every base year whichever unit the chart is in.
   *
   * The base-year axis always writes them: there is a single month there, one bar per column and a
   * whole band each — «Ventas por año»' same case, right above.
   */
  const writesFigures = byBase || axis.length <= MAX_LABELLED_MONTHS;
  const fitBase = fitDirectLabel(byBase ? growths.length : axis.length);
  const fit: LabelFit = { ...fitBase, cents: fitBase.cents && growths.length <= MAX_LABEL_ROWS };
  const write = (value: number) =>
    (inPercent ? signedPercent(value) : signedMoney(value, fit.cents)) ?? "";
  /**
   * The side its figure is written on. `null` keeps travelling as a bare value: a month with nothing
   * to compare draws no bar, and a datum with a label over an absence is a figure hanging in the air.
   */
  const signed = (value: number | null) =>
    value === null
      ? null
      : { value, ...(value < 0 ? { label: { position: "bottom" as const } } : {}) };
  /**
   * Whether anything FALLS, which is what decides the reserve under the plot.
   *
   * A card of nothing but gains writes every figure upwards and has no reason to push the months'
   * own names down; one with a single fall has to, because the deepest bar ends at the floor and its
   * figure is written under that end — over the axis, if nobody made room.
   */
  const falls = growths.some((entry) =>
    axis.some((month) => {
      const point = entry.points[month];
      // `percent` is null where the base month sold nothing: no bar, and nothing to hang under it.
      const value = inPercent ? point.percent : point.delta;
      return value !== null && value < 0;
    }),
  );
  const rows = byBase ? 1 : growths.length;
  const rowsBelow = writesFigures && falls ? rows : 0;
  /** What the axis' own names step down by, so a figure hanging under a bar is never printed on
   *  them. It is the room `baseOption`'s `below` reserved. */
  const axisMargin = rowsBelow > 0 ? labelHeadroom(rowsBelow, fit, 8) : undefined;

  const baseSeries: ChartSeries[] = [
    {
      id: "variacion",
      name: "Variación",
      type: "bar",
      // The colour still follows the BASE YEAR and never the sign, so a year keeps the hue it wears
      // in the comparativo's line and in «Ventas por año» — what changed is where its name is
      // written, not what it is.
      data: growths.map((entry, index) => ({
        ...signed(baseValues[index]),
        value: baseValues[index],
        itemStyle: { color: yearColor(entry.baseYear, baseYears) },
      })),
      // One bar per column, so ONE row of figures — the annual card's same shape right above.
      ...directLabel(fit, { unit: write }),
      // With the years on the axis each one owns its column, so the fit is asked for a single bar.
      barMaxWidth: fitBarWidth(growths.length),
      // No `barGap` here: one series per category has nothing to be spaced from.
      markLine: zeroLine(),
    },
  ];

  const series: ChartSeries[] = growths.map((entry, index) => ({
    id: `vs-${entry.baseYear}`,
    name: `vs ${entry.baseYear}`,
    type: "bar",
    data: axis.map((month) => {
      const point = entry.points[month];
      const value = inPercent ? point.percent : point.delta;
      // The datum only carries the side its figure is written on where a figure is written at all.
      return writesFigures ? signed(value) : value;
    }),
    itemStyle: { color: yearColor(entry.baseYear, baseYears) },
    barMaxWidth,
    // Set on every series and not only on the first: ECharts reads it off the LAST one that declares
    // it, so leaving it on one of the five is one reorder away from being silently dropped.
    barGap: GROUPED_BAR_GAP,
    // Its OWN row of figures — see the note above `writesFigures`.
    ...(writesFigures ? directLabel(fit, { row: index, unit: write }) : {}),
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
    option: drawable
      ? {
          ...baseOption(
            categoryAxis(byBase ? baseLabels : labels, axisMargin),
            inPercent ? percentAxis() : currencyAxis(),
            // With the years on the axis there is one series, and its legend would name what the
            // axis names.
            legendFor(!byBase && growths.length > 1),
            // The rows written ABOVE the plot: one per base year, or a single one when the years are
            // the axis. `outerBoundsContain` only reserves for the axis' own labels, so without this
            // the top row is cropped against the edge of the card. What hangs BELOW is reserved by
            // the axis' own margin, which `outerBoundsContain` already accounts for. With no figure
            // written there is nothing to reserve and the plot gets the whole card.
            ...(writesFigures ? [{ rows, fit }] : []),
          ),
          // The month is named in the tooltip's HEAD when it is no longer on the axis: «vs 2018 ·
          // Enero» is what says over which month that variation was measured.
          tooltip: axisTooltip(
            inPercent ? percent : money,
            byBase ? MONTHS_FULL_ES[singleMonth] : undefined,
          ),
          series: byBase ? baseSeries : series,
        }
      : null,
    table: growthTable(growths, axis),
    ...(note ? { note } : {}),
    guide: GUIDE_REVENUE_GROWTH,
    // The rows of figures are paid for in HEIGHT and not out of the plot: five of them over a 280 px
    // card leave the bars a third shorter, and a variation is read by how far the bar reaches. Both
    // sides are paid for, because a card that gains and falls writes rows above AND below.
    height: writesFigures
      ? 280 +
        Math.max(0, labelHeadroom(rows, fit, 16) - 16) +
        (rowsBelow > 0 ? labelHeadroom(rowsBelow, fit, 0) : 0)
      : 280,
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
