/**
 * 3 · **Ventas por año** — the annual reading, which until now existed only as the two summary rows
 * of the comparativo's table.
 *
 * It is the link the chain was missing. The comparativo reads a year MONTH BY MONTH and the
 * crecimiento reads one year AGAINST another; between them nobody drew the year as a single figure,
 * which is the first thing the firm is asked for and the last thing the workbook's «hoja anual»
 * shows. With it the reading goes mensual → anual → comparativo → consolidado.
 *
 * **«Ver como» is not decoration here, it is the correction.** A «Total» bar makes 2026 —seven
 * months— the worst year on the board, which is exactly the defect this module exists to fix: the bar
 * is short because the calendar is short, not because the business was. «Promedio mensual» divides by
 * the loaded months (rule (b)) and is the shape under which the four years are actually comparable.
 * Both are dollars, so ONE axis carries either — the app forbids a second `yAxis`, and drawing total
 * and average together would leave the average a stub an order of magnitude below the total.
 */
import { CHART_MARK } from "@/lib/charts/palette";
import type { ChartCardSpec, ChartSeries, ChartTable } from "@/lib/charts/types";
import { MONTHS_FULL_ES } from "@/lib/date";
import { pluralize } from "@/lib/format";
import { readRevenueYears, type RevenueYearReading } from "../derive";
import { GUIDE_REVENUE_ANNUAL } from "../guides";
import type { RevenueCardsInput } from "../types";
import {
  axisTooltip,
  baseOption,
  categoryAxis,
  currencyAxis,
  directLabel,
  fitDirectLabel,
  legendFor,
  money,
  moneyOrDash,
  ROUND_TOP,
  yearColor,
} from "./chrome";

/** «Ver como» — the annual card's SHAPE. Same unit, same axis; what changes is which figure. */
export type AnnualShape = "total" | "promedio";

/** The screen opens on the total, which is the figure the firm asks for first. */
export const DEFAULT_ANNUAL_SHAPE: AnnualShape = "total";

export const ANNUAL_CARD_ID = "anual";

export function buildAnnualCard(input: RevenueCardsInput, shape: AnnualShape): ChartCardSpec {
  const readings = readRevenueYears(input.years, input.months);
  // A year with no loaded month is NOT a bar of zero: it does not draw, and the table gives it a
  // dash. It is the module's one rule reaching the newest card.
  const drawn = readings.filter((entry) => entry.covered);
  const years = drawn.map((entry) => entry.year);
  const asAverage = shape === "promedio";

  // One column per year and one series, so the figure over each bar has the whole strip to itself:
  // four years give it 250 px where it needs sixty.
  const fit = fitDirectLabel(years.length);

  const series: ChartSeries[] = [
    {
      id: shape,
      name: asAverage ? "Promedio mensual" : "Total del tramo",
      type: "bar",
      // The colour is IDENTITY and not decoration: 2024 wears here the hue it wears in the
      // comparativo's line, in the growth's bars and in the skyline's row.
      data: drawn.map((entry) => ({
        value: asAverage ? entry.average : entry.total,
        itemStyle: { color: yearColor(entry.year, years), borderRadius: ROUND_TOP },
      })),
      barMaxWidth: CHART_MARK.barMaxWidth,
      // The year as ONE figure is what this card exists for, so it is written on the bar and not left
      // to a hover: «Ver como» moves which figure it is, never whether it is there.
      ...directLabel(fit),
    },
  ];

  const note = annualNote(readings, asAverage);

  return {
    id: ANNUAL_CARD_ID,
    title: "Ventas por año",
    subtitle: `${input.period} · ${
      asAverage ? "promedio mensual sobre los meses cargados" : "total del tramo"
    }`,
    option:
      drawn.length > 0
        ? {
            ...baseOption(
              categoryAxis(years.map(String)),
              currencyAxis(),
              // One series: a legend would name the shape the header's own control already names.
              legendFor(false),
              { rows: 1, fit },
            ),
            tooltip: axisTooltip(money),
            series,
          }
        : null,
    table: annualTable(readings),
    ...(note ? { note } : {}),
    guide: GUIDE_REVENUE_ANNUAL,
    height: 260,
  };
}

/** The three figures at once, whichever shape is drawn — «Ver como» moves the chart and never the
 *  table, so the reader never has to switch to reach a number. */
function annualTable(readings: readonly RevenueYearReading[]): ChartTable {
  return {
    columns: ["Total", "Promedio mensual", "Meses cargados"],
    rows: readings.map((entry) => ({
      id: `anio-${entry.year}`,
      label: String(entry.year),
      values: entry.covered
        ? [
            money(entry.total),
            moneyOrDash(entry.average),
            pluralize(entry.loadedMonths.length, "mes", "meses"),
          ]
        : [null, null, null],
    })),
  };
}

/** Which years are half-loaded, and which of the two shapes answers for that. */
function annualNote(readings: readonly RevenueYearReading[], asAverage: boolean): string | null {
  const partial = readings.filter((entry) => entry.covered && entry.loadedMonths.length < 12);
  if (partial.length === 0) {
    return null;
  }
  const named = partial
    .map(
      (entry) =>
        `${entry.year} llega hasta ${MONTHS_FULL_ES[entry.loadedMonths[entry.loadedMonths.length - 1]].toLowerCase()}`,
    )
    .join("; ");
  return asAverage
    ? `${named}. El promedio divide entre los meses cargados, no entre doce: es la forma bajo la que un año a medias se compara con uno entero.`
    : `${named}. Su barra es más corta porque le faltan meses, no porque haya vendido menos — «Promedio mensual» es la forma que los hace comparables.`;
}
