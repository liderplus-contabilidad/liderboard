/**
 * 3 · **Ventas por año** — the annual reading, which until now existed only as the two summary rows
 * of the comparativo's table.
 *
 * It is the link the chain was missing. The comparativo reads a year MONTH BY MONTH and the
 * crecimiento reads one year AGAINST another; between them nobody drew the year as a single figure,
 * which is the first thing the firm is asked for and the last thing the workbook's «hoja anual»
 * shows. With it the reading goes mensual → anual → comparativo → consolidado.
 *
 * **«Cifra» is not decoration here, it is the correction.** A «Total» bar makes 2026 —seven
 * months— the worst year on the board, which is exactly the defect this module exists to fix: the bar
 * is short because the calendar is short, not because the business was. «Promedio mensual» divides by
 * the loaded months (rule (b)) and is the shape under which the four years are actually comparable.
 * Both are dollars, so ONE axis carries either — the app forbids a second `yAxis`, and drawing total
 * and average together would leave the average a stub an order of magnitude below the total.
 *
 * That control chooses a FIGURE, and «Ver como» —this card's other one— chooses a BODY: the same
 * figure flat or standing on the stage. They are two different questions, which is why they are two
 * controls and not four options of one: whichever figure is being read can be read in either body.
 */
import { stageColor } from "@/lib/charts/palette";
import {
  SCREEN_SOLID_VIEW,
  SOLID_BARS_HEIGHT,
  solidBarsOption,
  type SolidView,
} from "@/lib/charts/solid-bars";
import type {
  Chart3DOption,
  ChartCardSpec,
  ChartOption,
  ChartSeries,
  ChartTable,
} from "@/lib/charts/types";
import { MONTHS_FULL_ES } from "@/lib/date";
import { pluralize } from "@/lib/format";
import { readRevenueYears, type RevenueYearReading } from "../derive";
import { GUIDE_REVENUE_ANNUAL } from "../guides";
import type { RevenueCardsInput } from "../types";
import {
  axisMoney,
  axisTooltip,
  baseOption,
  categoryAxis,
  currencyAxis,
  directLabel,
  fitBarWidth,
  fitDirectLabel,
  legendFor,
  money,
  moneyOrDash,
  ROUND_TOP,
  yearColor,
} from "./chrome";

/** «Cifra» — WHICH figure the annual card draws. Same unit, same axis; what changes is what is
 *  being measured. The BODY it is drawn in is the other control, «Ver como». */
export type AnnualShape = "total" | "promedio";

/** The screen opens on the total, which is the figure the firm asks for first. */
export const DEFAULT_ANNUAL_SHAPE: AnnualShape = "total";

export const ANNUAL_CARD_ID = "anual";

export function buildAnnualCard(
  input: RevenueCardsInput,
  shape: AnnualShape,
  view: SolidView = SCREEN_SOLID_VIEW,
): ChartCardSpec<ChartOption | Chart3DOption> {
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
      // A year is a column of its own, so the fit gives it the band whole — five years used to be
      // five 44 px fills lost in a plot with room for twice that.
      barMaxWidth: fitBarWidth(years.length),
      // The year as ONE figure is what this card exists for, so it is written on the bar and not left
      // to a hover: «Cifra» moves which figure it is, never whether it is there.
      ...directLabel(fit),
    },
  ];

  const note = annualNote(readings, asAverage);

  /**
   * The SAME bars, given a body — one row, because a year is a column and this card has nothing to
   * put on the depth axis; there the depth is the bar's thickness, which is `solidBarsOption`'s
   * single-row case.
   *
   * The colour travels PER COLUMN and not on the row for the reason the flat card paints it that
   * way: here the hue is the YEAR's identity —2024 wears it in the comparativo's line, in the
   * growth's bars and in the skyline's row— and `stageColor` is what steps it into the register the
   * navy asks for, by slot, so it is the same year in the same colour on either ground.
   *
   * The figure written over each bar does NOT travel: a label in perspective lands at a depth of its
   * own and stops lining up with the bar under it. It goes to the hovered bar, to the table twin —
   * which carries the three figures whichever shape is on screen— and one click away in «Plano».
   */
  const solid: Chart3DOption | null =
    drawn.length > 0
      ? solidBarsOption({
          columns: years.map(String),
          rows: [
            {
              id: shape,
              name: asAverage ? "Promedio mensual" : "Total del tramo",
              // The row's fill is only the fallback for a column the list does not reach.
              color: stageColor(yearColor(years[0], years)),
              values: drawn.map((entry) => (asAverage ? entry.average : entry.total)),
            },
          ],
          colors: drawn.map((entry) => stageColor(yearColor(entry.year, years))),
          formatValue: money,
          formatAxis: axisMoney,
        })
      : null;
  const asSolid = view === "solido" && solid !== null;

  return {
    id: ANNUAL_CARD_ID,
    title: "Ventas por año",
    subtitle: `${input.period} · ${
      asAverage ? "promedio mensual sobre los meses cargados" : "total del tramo"
    }`,
    option: asSolid
      ? solid
      : drawn.length > 0
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
    // The camera is the one thing the body adds that no control announces.
    ...(note || asSolid
      ? { note: [note, asSolid ? "Arrastra para girar la vista." : null].filter(Boolean).join(" ") }
      : {}),
    guide: GUIDE_REVENUE_ANNUAL,
    height: asSolid ? SOLID_BARS_HEIGHT : 260,
  };
}

/** The three figures at once, whichever figure and whichever body is drawn — neither «Cifra» nor
 *  «Ver como» touches the table, so the reader never has to switch to reach a number. */
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
