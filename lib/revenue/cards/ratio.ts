/**
 * 4 · 5 · 6 — **the three «vs» cards, out of ONE constructor.**
 *
 * They are the same question three times —one series against another, and the percentage between
 * them— so what changes between them is a descriptor (`series.ts`), not a builder. A second builder
 * is how «qué porcentaje es esto» would end up with two answers.
 *
 * Nothing here divides either: `ratio.ts` (the sibling one directory up, `../ratio`) is THE
 * definition of a share and this file asks it.
 *
 * **There is no «Ver como» here any more, and that is the point.** The card used to offer two shapes
 * —the two amounts in dollars, or the participation in percent— and they were never two readings: the
 * question this card asks is «qué parte de aquello es esto», which is an amount AND its percentage at
 * once. Split across a switch, whichever half was on screen had to be read against the other half
 * held in the reader's head, and the percentage's own axis silently rescaled between the two. Now the
 * two amounts are drawn —they are commensurable, which is why one `yAxis` carries both— and the
 * numerator's bar writes its share under its figure, in fainter ink. One chart, both halves, no
 * second scale.
 */
import type { ChartCardSpec, ChartSeries, ChartTable, ChartTableRow } from "@/lib/charts/types";
import { MONTHS_FULL_ES, MONTHS_SHORT_ES } from "@/lib/date";
import { pluralize } from "@/lib/format";
import { scopeToMonths, sumOf } from "../derive";
import { monthSpanLabel } from "../filters";
import { readRatio, shareOf, type RatioReading } from "../ratio";
import {
  SERIES_LABELS,
  SERIES_LABELS_INLINE,
  seriesOf,
  type RatioDescriptor,
  type RevenueSeriesId,
} from "../series";
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
  percent,
  percentOrDash,
  ROUND_TOP,
  seriesColor,
} from "./chrome";

/** One marked year's reading of this ratio, with the series it was read from. */
interface RatioYear {
  year: number;
  numerator: (number | null)[];
  denominator: (number | null)[];
  reading: RatioReading;
}

/**
 * **It reads the MARKED YEARS, and how many of them carry data chooses the shape** — the comparison
 * card's same figure, resolved on the axis instead of on the mark:
 *
 * - ONE year with data → the months are the axis, which is the reading of a year closing.
 * - SEVERAL → the YEARS are the axis, one column each, which is the year-on-year comparison the mark
 *   is asking for. Twelve months × three years on one axis would be thirty-six columns of two series.
 *
 * A marked year with nothing captured does not draw and is NAMED in the note. That is the point of
 * reading the marks at all: a card that quietly ignored «Año» would let the user believe the filter
 * did not reach it.
 */
export function buildRatioCard(
  descriptor: RatioDescriptor,
  input: RevenueCardsInput,
): ChartCardSpec {
  const years: RatioYear[] = input.years.map((year) => {
    const numerator = scopeToMonths(seriesOf(year, descriptor.numerator), input.months);
    const denominator = scopeToMonths(seriesOf(year, descriptor.denominator), input.months);
    return { year: year.year, numerator, denominator, reading: readRatio(numerator, denominator) };
  });

  const withData = years.filter((entry) => entry.reading.sharedMonths.length > 0);
  const idle = years
    .filter((entry) => entry.reading.sharedMonths.length === 0)
    .map((entry) => entry.year);

  return withData.length > 1
    ? ratioAcrossYears(descriptor, withData, idle)
    : ratioAcrossMonths(descriptor, withData[0] ?? years[years.length - 1], idle, input);
}

// ---------------------------------------------------------------------------
// What the two axes SHARE
// ---------------------------------------------------------------------------

/**
 * The three columns a ratio card draws, whichever its axis is.
 *
 * The two amounts go on the SAME dollar axis — they are commensurable, which is exactly why no second
 * `yAxis` is needed (and the type forbids one). `share` is not a third bar: it is written under the
 * numerator's figure, so the percentage rides the very bar it is the percentage OF. The colour
 * follows the ENTITY on both axes, so «cobros con tarjeta» is the same orange being numerator here
 * and denominator in the card below.
 */
interface RatioColumns {
  share: (number | null)[];
  numerator: (number | null)[];
  denominator: (number | null)[];
  /** Two bars side by side per category, so each has to leave room for its pair. Wider on the year
   *  axis, where there are at most a handful of columns. */
  barMaxWidth: number;
}

/**
 * The card, assembled once for both axes.
 *
 * The two readings differ in what goes ON the axis and in how the note is worded, and in NOTHING
 * else: the same two bars, the same colours, the same chrome, the same `option`/`table`/`note` shape.
 * Building that twice is how one axis quietly grew a legend the other did not, so each caller now
 * contributes only its labels, its columns and its own sentences.
 */
function assembleRatioCard(
  descriptor: RatioDescriptor,
  parts: {
    labels: string[];
    columns: RatioColumns;
    covered: boolean;
    subtitle: string;
    table: ChartTable;
    notes: (string | null)[];
    /** Named on the tooltip only where a column is a YEAR carrying the figure of a span. */
    tooltipSpan?: string;
  },
): ChartCardSpec {
  // The two amounts share the axis, so a figure per bar is TWO rows — the denominator on the first,
  // the numerator on the second — and the numerator's carries the share underneath it. That is where
  // the percentage belongs: on the bar it is the percentage OF, and not on a chart of its own the
  // reader has to switch to.
  const fit = fitDirectLabel(parts.labels.length);
  // The NUMERATOR's figure is the one with a problem, and it is not the category before it: the bar
  // immediately to its left is the denominator's, an order of magnitude taller, so a label centred on
  // the short bar printed its first digits across that fill. Anchoring its left edge to its own bar's
  // left edge is what keeps every pixel it occupies to the right of that fill.
  //
  // The denominator's stays centred: it crowns the tallest bar of the card, with nothing beside it at
  // that height.
  const startAt = -parts.columns.barMaxWidth / 2;
  const series: ChartSeries[] = [
    {
      id: descriptor.denominator,
      name: SERIES_LABELS[descriptor.denominator],
      type: "bar",
      data: parts.columns.denominator,
      itemStyle: { color: seriesColor(descriptor.denominator), borderRadius: ROUND_TOP },
      barMaxWidth: parts.columns.barMaxWidth,
      ...directLabel(fit),
    },
    {
      id: descriptor.numerator,
      name: SERIES_LABELS[descriptor.numerator],
      type: "bar",
      data: parts.columns.numerator,
      itemStyle: { color: seriesColor(descriptor.numerator), borderRadius: ROUND_TOP },
      barMaxWidth: parts.columns.barMaxWidth,
      ...directLabel(fit, { row: 1, shares: parts.columns.share, startAt }),
    },
  ];

  const notes = parts.notes.filter((note): note is string => note !== null);

  return {
    id: descriptor.id,
    title: descriptor.title,
    subtitle: parts.subtitle,
    option: parts.covered
      ? {
          ...baseOption(
            categoryAxis(parts.labels),
            currencyAxis(),
            legendFor(true),
            // Three lines over the tallest column: the denominator's row, the numerator's, and the
            // share written under it.
            { rows: 3, fit },
          ),
          tooltip: axisTooltip(money, parts.tooltipSpan),
          series,
        }
      : null,
    table: parts.table,
    ...(notes.length > 0 ? { note: notes.join(" ") } : {}),
    guide: descriptor.guide,
    height: 260,
  };
}

// ---------------------------------------------------------------------------
// The MONTHS on the axis
// ---------------------------------------------------------------------------

/**
 * ONE year's reading, which is the shape of a year being closed.
 *
 * `entry` may be a year with nothing captured —when no marked year has any— and then the card draws
 * nothing and says what is missing, which is more use than an empty plot.
 */
function ratioAcrossMonths(
  descriptor: RatioDescriptor,
  entry: RatioYear | undefined,
  idle: readonly number[],
  input: RevenueCardsInput,
): ChartCardSpec {
  const axis = [...input.months].sort((a, b) => a - b);
  const labels = axis.map((month) => MONTHS_SHORT_ES[month]);
  const reading = entry?.reading ?? readRatio([], []);
  const span = monthSpanLabel(reading.sharedMonths);

  return assembleRatioCard(descriptor, {
    labels,
    columns: {
      share: axis.map((month) => reading.points[month]?.percent ?? null),
      numerator: axis.map((month) => reading.points[month]?.numerator ?? null),
      denominator: axis.map((month) => reading.points[month]?.denominator ?? null),
      barMaxWidth: 18,
    },
    covered: reading.sharedMonths.length > 0,
    // The subtitle names the span the PERCENTAGE was measured over, which may be shorter than the
    // sales' own — and saying so is the point. With NO span there is nothing to name: «Sin meses 2026»
    // was a rótulo pretending to be a tramo, so the year says plainly that it has nothing registered.
    subtitle: entry
      ? span
        ? `${span} ${entry.year} · ${descriptor.question}`
        : `${entry.year} · sin datos registrados · ${descriptor.question}`
      : `${input.period} · ${descriptor.question}`,
    table: monthRatioTable(reading, axis, descriptor),
    notes: [
      missingMonthsNote(reading, descriptor.numerator, descriptor.denominator),
      idleYearsNote(idle, descriptor.numerator),
    ],
  });
}

// ---------------------------------------------------------------------------
// The YEARS on the axis
// ---------------------------------------------------------------------------

/**
 * One column per marked year that has data.
 *
 * **Every year is read over the span they ALL share**, which is rules (c) and (d) applied at once —
 * both terms present, and the same months for every year compared. Without it, a year with twelve
 * months of card collections would tower over one with six for no reason but the calendar, which is
 * exactly the defect this module exists to correct in the workbook it replaces.
 */
function ratioAcrossYears(
  descriptor: RatioDescriptor,
  years: readonly RatioYear[],
  idle: readonly number[],
): ChartCardSpec {
  const common = sharedAcrossYears(years);
  // Re-read over the common span: what each year contributes has to be measured on the same months as
  // the year beside it.
  const compared = years.map((entry) => ({
    year: entry.year,
    reading: readRatio(
      scopeToMonths(entry.numerator, common),
      scopeToMonths(entry.denominator, common),
    ),
  }));

  const labels = compared.map((entry) => String(entry.year));
  const covered = common.length > 0;
  const span = monthSpanLabel(common);
  const numerator = SERIES_LABELS_INLINE[descriptor.numerator];
  const denominator = SERIES_LABELS_INLINE[descriptor.denominator];

  const amountOf = (reading: RatioReading, pick: "numeratorTotal" | "denominatorTotal") =>
    reading.sharedMonths.length > 0 ? reading[pick] : null;

  return assembleRatioCard(descriptor, {
    labels,
    columns: {
      share: compared.map((entry) => entry.reading.percent),
      numerator: compared.map((entry) => amountOf(entry.reading, "numeratorTotal")),
      denominator: compared.map((entry) => amountOf(entry.reading, "denominatorTotal")),
      barMaxWidth: 28,
    },
    covered,
    subtitle: `${labels.join(", ")} · ${span ?? "sin tramo común"} · ${descriptor.question}`,
    table: yearRatioTable(compared, descriptor),
    notes: [
      covered
        ? `Los ${compared.length} años se miden sobre ${span}, el tramo en que todos tienen ${numerator} y ${denominator}: comparar un año de doce meses contra uno de seis diría más del calendario que del negocio.`
        : `Los años marcados no comparten ningún mes con ${numerator} y ${denominator} a la vez, así que no hay tramo sobre el que compararlos.`,
      idleYearsNote(idle, descriptor.numerator),
    ],
    ...(span ? { tooltipSpan: span } : {}),
  });
}

/** The months every compared year has BOTH terms in — the span the comparison is measured over. */
function sharedAcrossYears(years: readonly RatioYear[]): number[] {
  if (years.length === 0) {
    return [];
  }
  return years
    .slice(1)
    .reduce<number[]>(
      (common, entry) => common.filter((month) => entry.reading.sharedMonths.includes(month)),
      [...years[0].reading.sharedMonths],
    );
}

// ---------------------------------------------------------------------------
// Tables and notes
// ---------------------------------------------------------------------------

function ratioColumns(descriptor: RatioDescriptor): string[] {
  return [
    SERIES_LABELS[descriptor.numerator],
    SERIES_LABELS[descriptor.denominator],
    descriptor.shareLabel,
  ];
}

function monthRatioTable(
  reading: RatioReading,
  axis: readonly number[],
  descriptor: RatioDescriptor,
): ChartTable {
  const rows: ChartTableRow[] = axis.map((month) => {
    const point = reading.points[month];
    return {
      id: `mes-${month}`,
      label: MONTHS_FULL_ES[month],
      values: [
        moneyOrDash(point?.numerator ?? null),
        moneyOrDash(point?.denominator ?? null),
        percentOrDash(point?.percent ?? null),
      ],
    };
  });

  return {
    columns: ratioColumns(descriptor),
    rows: [
      ...rows,
      {
        id: "total",
        label: monthSpanLabel(reading.sharedMonths) ?? "Sin datos registrados",
        emphasis: true,
        values: reading.sharedMonths.length
          ? [
              money(reading.numeratorTotal),
              money(reading.denominatorTotal),
              percentOrDash(reading.percent),
            ]
          : [null, null, null],
      },
    ],
  };
}

/** One row per compared year. No TOTAL row: summing several years is a figure nobody asked for, and
 *  each row is already a total. */
function yearRatioTable(
  compared: readonly { year: number; reading: RatioReading }[],
  descriptor: RatioDescriptor,
): ChartTable {
  return {
    columns: ratioColumns(descriptor),
    rows: compared.map((entry) => ({
      id: `anio-${entry.year}`,
      label: String(entry.year),
      values:
        entry.reading.sharedMonths.length > 0
          ? [
              money(entry.reading.numeratorTotal),
              money(entry.reading.denominatorTotal),
              percentOrDash(entry.reading.percent),
            ]
          : [null, null, null],
    })),
  };
}

/**
 * Rule (d), said out loud on the card where it applies.
 *
 * When a month has the denominator and not the numerator, the note names the span really used, its
 * two totals and the percentage — AND what the naive division would have given, which is the figure
 * the workbook writes. That second number is COMPUTED here (numerator's total over the denominator's
 * whole span), never quoted: the app can derive what the wrong division yields, and inventing it
 * would be the very defect the note warns about.
 */
function missingMonthsNote(
  reading: RatioReading,
  numerator: RevenueSeriesId,
  denominator: RevenueSeriesId,
): string | null {
  if (reading.missingMonths.length === 0 || reading.sharedMonths.length === 0) {
    return null;
  }
  const missing = reading.missingMonths.map((month) => MONTHS_FULL_ES[month]);
  // What dividing over EVERY month with a denominator would give — the workbook's mistake, computed.
  const denominatorOverAll =
    reading.denominatorTotal +
    sumOf(reading.missingMonths.map((month) => reading.points[month].denominator));
  const naive = shareOf(reading.numeratorTotal, denominatorOverAll);
  // Written, never lower-cased: `.toLowerCase()` does not know a sigla from a proper noun and turned
  // «Comisiones TC» into «comisiones tc».
  const numeratorInline = SERIES_LABELS_INLINE[numerator];
  const denominatorInline = SERIES_LABELS_INLINE[denominator];

  return `${missing.join(", ")} ${missing.length === 1 ? "tiene" : "tienen"} ${denominatorInline} y ningún dato de ${numeratorInline}: ${
    missing.length === 1 ? "ese mes queda" : "esos meses quedan"
  } fuera del porcentaje, que se calcula sobre ${monthSpanLabel(reading.sharedMonths)} — ${money(
    reading.numeratorTotal,
  )} de ${money(reading.denominatorTotal)}, el ${percent(reading.percent as number)}.${
    naive === null
      ? ""
      : ` Dividir entre ${pluralize(reading.sharedMonths.length + missing.length, "mes", "meses")} de ${denominatorInline} daría ${percent(naive)}, que compara tramos distintos.`
  }`;
}

/**
 * The marked years this card has nothing to draw for.
 *
 * It is NOT decoration: without it a card that reads the year marks and finds only one year with data
 * looks exactly like a card that ignores the marks altogether, and the reader has no way of telling
 * which of the two is happening.
 *
 * **The verb carries the agreement, not a participle.** «no tienen … registrado» disagreed with its
 * subject, and the obvious repair —«registrados»— is right for two of the three series and wrong for
 * the third: «la pauta de Facebook» is singular and feminine. `no registran` agrees with the YEARS,
 * which the branch below already counts, so one sentence covers all six combinations without a
 * gender table travelling beside every label.
 */
function idleYearsNote(idle: readonly number[], numerator: RevenueSeriesId): string | null {
  if (idle.length === 0) {
    return null;
  }
  const one = idle.length === 1;
  return `${idle.join(", ")} ${one ? "está marcado y no registra" : "están marcados y no registran"} ${SERIES_LABELS_INLINE[numerator]}: ${
    one ? "no se dibuja" : "no se dibujan"
  }. Regístra${one ? "lo" : "los"} en «Registrar datos».`;
}
