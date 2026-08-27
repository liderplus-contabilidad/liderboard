/**
 * The screen's THREE readings, described as DATA (`option` + `table`) and not as markup: composition
 * by service, concentration by payer and evolution.
 *
 * That they are data is what allows the printable report to read EXACTLY the same construction as the
 * screen instead of rebuilding its figures — the rule by which PyG's report cannot disagree with
 * Gráficos. Two computations of the same question drift apart, and nothing downstream can say which
 * of the two numbers is the right one.
 *
 * **Each card has TWO shapes, and the number of marked years chooses it**, not a control: with one it
 * draws the period's breakdown, and with several it puts one year per SERIES on the same axis. It is
 * neither a fourth card nor a toggle —two places to choose the same thing—, it is the same question
 * answered over what the user marked, which is what makes the year-on-year comparison cost no new
 * control.
 *
 * It is an OWN builder and not PyG's `option.ts`, following Ocupaciones' and Sueldos por Áreas'
 * precedent: that one is written over the types of its analytics engine (`Series`, `SeriesKey`,
 * `PeriodRef`) and bringing them here would tie this subitem to that engine through presentation.
 * What is shared is what should be: the `ChartOption` types, the palette and the formatters.
 */
import {
  CHART_FONT,
  CHART_INK,
  CHART_LINES,
  CHART_MARK,
  CHART_NEUTRAL,
  CHART_PALETTE,
  CHART_SURFACE,
  colorForEntity,
} from "@/lib/charts/palette";
import type {
  ChartAxis,
  ChartCardSpec,
  ChartLegend,
  ChartOption,
  ChartParam,
  ChartSeries,
  ChartTable,
  ChartTableRow,
  ChartTooltip,
} from "@/lib/charts/types";
import { MONTHS_SHORT_ES } from "@/lib/date";
import { formatCurrency, formatNumber, formatPercent, pluralize } from "@/lib/format";
import { shareOf, type MonthPoint, type PayerTotal, type SalesReading } from "./derive";
import { GUIDE_SALES_EVOLUTION, GUIDE_SALES_PAYERS, GUIDE_SALES_SERVICES } from "./guides";

/**
 * How many payers the concentration card DRAWS. Ten is what the firm reads in its own report and what
 * fits without the bars turning into a texture; the rest are not folded into an «Otros» bar —it would
 * be the longest in the chart and would cover precisely the concentration reading— but are counted in
 * the note and listed in full in the table twin.
 */
export const PAYER_SLICES = 10;

/**
 * How many payers the table LISTS in the PRINTED REPORT, before folding the tail into one row.
 *
 * On screen the table does not cut, and that is its job: it is the place where a payer that was not
 * drawn keeps its figure, and finding it costs a scroll. On paper that justification collapses — the
 * real file brings 956 payers, which is over twenty pages of names behind a two-page report, and most
 * of them are «Particular · 731 · $12.40» rows, anonymous by design: a twenty-page appendix nobody can
 * use for anything. It is the same kind of rule PyG's report already applies by pruning per TABLE
 * while its Excel prunes per WORKBOOK: each medium prunes the way it is read.
 *
 * What is NOT done is truncating outright. The tail is folded into ONE row with its sum, so the column
 * still closes against the TOTAL: a trimmed table whose rows do not add up to its own total is exactly
 * what makes a document untrustworthy.
 */
export const PAYER_TABLE_PRINT_LIMIT = 30;

/**
 * The colour of a PAYER bar says its CLASS, not its identity — the fourth time colour stops following
 * the entity in this app, and here for two reasons that add up: ten entities do not fit in the
 * palette's eight slots (the ninth would come out neutral and would look like a separate category),
 * and what a reader asks of this card is how much of their billing depends on INSURERS as against
 * what comes in over the counter. Each bar carries its label and its figure, so the colour is not
 * distinguishing anything the row does not already say.
 *
 * **Only in the ONE-year shape.** Comparing several, the series is the YEAR and the colour goes back
 * to being identity: tinting by class would paint the three years of one same payer in the same hue,
 * which is precisely what the comparison needs to tell apart.
 */
const PAYER_FILL = { empresa: CHART_PALETTE[0], particular: CHART_NEUTRAL } as const;

/** The fill of a month that NEVER arrived — see `absenceMarks`. */
const ABSENT_FILL = CHART_LINES.grid;

const SERVICES_HEIGHT = 300;
const PAYERS_HEIGHT = 420;
const EVOLUTION_HEIGHT = 300;

/** A reading and the year it belongs to. */
export interface YearReading {
  year: number;
  reading: SalesReading;
}

/** A year's twelve months, with `null` in the ones that never arrived. */
export interface YearMonths {
  year: number;
  points: MonthPoint[];
}

/** Everything the three cards need, already aggregated: none of them walks loose lines. */
export interface SalesCardsInput {
  /** The aggregate of EVERYTHING marked — what the tiles and the denominators say. */
  reading: SalesReading;
  /** One reading per marked YEAR, ascending. With just one, the cards use their simple shape. */
  byYear: readonly YearReading[];
  /** What the period is called — «Abril 2026», «Abr · 2025, 2026». The subtitles write it. */
  period: string;
  /** The twelve months of each marked year. */
  monthlyByYear: readonly YearMonths[];
  /**
   * How many payers the table lists before folding the tail. `undefined` —the screen— lists them ALL;
   * the report passes `PAYER_TABLE_PRINT_LIMIT`. It is the ONLY thing in which the paper and the
   * screen part ways, and they part ways on purpose: see `PAYER_TABLE_PRINT_LIMIT`.
   */
  payerTableLimit?: number;
}

/**
 * Display options for the sales cards. They do not affect the data, only which columns are shown on
 * the evolution's axis.
 */
export interface SalesCardsOptions {
  /**
   * Hides months with no billing on the evolution's axis. Months with no data (`null`) and at zero are
   * treated as empty columns.
   */
  hideEmptyMonths?: boolean;
}

export interface SalesCards {
  services: ChartCardSpec;
  payers: ChartCardSpec;
  evolution: ChartCardSpec;
  /**
   * How many columns of the axis move nothing. It is ALWAYS counted over the unpruned axis, which is
   * what keeps the button from vanishing just as it is pressed.
   */
  emptyMonths: number;
}

export function buildSalesCards(
  input: SalesCardsInput,
  options: SalesCardsOptions = {},
): SalesCards {
  return {
    services: buildServicesCard(input),
    payers: buildPayersCard(input),
    evolution: buildEvolutionCard(input, options),
    emptyMonths: emptyMonths(input.monthlyByYear).length,
  };
}

function emptyMonths(monthlyByYear: readonly YearMonths[]): number[] {
  const axis = monthlyByYear[0]?.points ?? [];
  return axis
    .filter((point) =>
      monthlyByYear.every((entry) => {
        const found = entry.points.find((other) => other.monthIndex === point.monthIndex);
        return found === undefined || found.amount === null || found.amount === 0;
      }),
    )
    .map((point) => point.monthIndex);
}

// ---------------------------------------------------------------------------
// Cromado compartido
// ---------------------------------------------------------------------------

function valueAxis(): ChartAxis {
  return {
    type: "value",
    axisLine: { show: false },
    axisTick: { show: false },
    splitLine: { show: true, lineStyle: { color: CHART_LINES.grid, width: 1, type: "solid" } },
    axisLabel: {
      color: CHART_INK.faint,
      fontSize: 11,
      // Without cents: an axis is the scale against which a bar's length is estimated, and six labels
      // of «$107,231.22» eat the drawing's width. The exact figure goes on the bar, in the tooltip
      // and in the table.
      formatter: (value) => formatCurrency(Number(value)),
    },
  };
}

function categoryAxis(labels: readonly string[], options?: { inverse?: boolean }): ChartAxis {
  return {
    type: "category",
    data: [...labels],
    inverse: options?.inverse ?? false,
    axisLine: { show: true, lineStyle: { color: CHART_LINES.axis, width: 1, type: "solid" } },
    axisTick: { show: false },
    splitLine: { show: false },
    axisLabel: {
      color: CHART_INK.muted,
      fontSize: 11,
      // `interval: 0` forces drawing them ALL: without it ECharts thins the axis and skips every
      // other one, and a bar with no name is identified by nothing.
      interval: 0,
      width: 190,
      overflow: "truncate",
    },
  };
}

/** The YEARS' legend. With just one it is superfluous: the card's subtitle already names it. */
function yearLegend(years: number): ChartLegend {
  return {
    show: years > 1,
    type: "scroll",
    bottom: 0,
    icon: "roundRect",
    itemWidth: 10,
    itemHeight: 10,
    itemGap: 14,
    textStyle: { color: CHART_INK.muted, fontSize: 11.5 },
  };
}

/** The house tooltip: inside the CARD (`confine`), which is an `overflow-hidden`. */
function itemTooltip(formatter: (param: ChartParam) => string): ChartTooltip {
  return {
    trigger: "item",
    backgroundColor: CHART_SURFACE,
    borderColor: CHART_LINES.axis,
    borderWidth: 1,
    padding: [8, 10],
    textStyle: { color: CHART_INK.strong, fontSize: 12 },
    confine: true,
    formatter: (params) => formatter(Array.isArray(params) ? params[0] : params),
  };
}

/** A comparison's tooltip: the whole column, with one line per year. */
function axisTooltip(unit: (value: number) => string): ChartTooltip {
  return {
    trigger: "axis",
    backgroundColor: CHART_SURFACE,
    borderColor: CHART_LINES.axis,
    borderWidth: 1,
    padding: [8, 10],
    textStyle: { color: CHART_INK.strong, fontSize: 12 },
    confine: true,
    axisPointer: { type: "shadow", lineStyle: { color: CHART_LINES.axis, width: 1 } },
    formatter: (params) => {
      const rows = Array.isArray(params) ? params : [params];
      const head = rows[0]?.name ?? "";
      // A year with no figure is OMITTED instead of saying `$0.00`, the table's same rule.
      const body = rows
        .filter((row) => row.value !== null && row.value !== undefined)
        .map(
          (row) =>
            `<div>${row.marker ?? ""} ${row.seriesName ?? ""}: <b>${unit(Number(row.value))}</b></div>`,
        )
        .join("");
      return `<div style="font-weight:600;margin-bottom:4px">${head}</div>${body || `<div style="color:${CHART_INK.muted}">Sin cargar</div>`}`;
    },
  };
}

/** A year's colour: its STABLE position in the marked list, so removing one does not repaint the
 *  others — `colorForEntity`'s rule. */
function yearColor(year: number, years: readonly number[]): string {
  return colorForEntity(String(year), years.map(String));
}

const ROUND_RIGHT = [0, CHART_MARK.radius, CHART_MARK.radius, 0] as [
  number,
  number,
  number,
  number,
];
const ROUND_TOP = [CHART_MARK.radius, CHART_MARK.radius, 0, 0] as [number, number, number, number];

// ---------------------------------------------------------------------------
// 1 · Composition by service
// ---------------------------------------------------------------------------

function buildServicesCard(input: SalesCardsInput): ChartCardSpec {
  const { reading, byYear, period } = input;
  const total = reading.totals.amount;
  // An idle service goes and is counted: the report declares the catalogue's five whether or not they
  // have movement, and an invisible bar buries the one that matters. It is judged over the AGGREGATE,
  // so a service that moved in any of the marked years stays.
  const moving = reading.services.filter((service) => service.amount !== 0);
  const idle = reading.services.length - moving.length;
  const years = byYear.map((entry) => entry.year);
  const comparing = years.length > 1;
  const order = moving.map((service) => service.code);

  /** What each year billed in a service; `null` if that year did not touch it. */
  const amountOf = (year: number, code: string): number | null =>
    byYear.find((entry) => entry.year === year)?.reading.services.find((s) => s.code === code)
      ?.amount ?? null;

  const series: ChartSeries[] = comparing
    ? byYear.map((entry) => ({
        id: `year-${entry.year}`,
        name: String(entry.year),
        type: "bar" as const,
        data: moving.map((service) => amountOf(entry.year, service.code)),
        itemStyle: { color: yearColor(entry.year, years), borderRadius: ROUND_RIGHT },
        barMaxWidth: 18,
      }))
    : [
        {
          id: "servicios",
          type: "bar" as const,
          data: moving.map((service) => ({
            value: service.amount,
            itemStyle: {
              color: colorForEntity(service.code, order),
              borderRadius: ROUND_RIGHT,
            },
          })),
          barMaxWidth: CHART_MARK.barMaxWidth,
          label: {
            show: true,
            position: "right" as const,
            distance: 6,
            color: CHART_INK.muted,
            fontSize: 11,
            formatter: (param: ChartParam) => formatCurrency(Number(param.value)),
          },
          labelLayout: { hideOverlap: true },
        },
      ];

  const legend = yearLegend(years.length);
  const option: ChartOption | null =
    moving.length === 0
      ? null
      : {
          animationDuration: 320,
          textStyle: { fontFamily: CHART_FONT },
          grid: {
            left: 8,
            right: 24,
            top: 12,
            bottom: legend.show ? 28 : 8,
            outerBoundsMode: "same",
            outerBoundsContain: "axisLabel",
          },
          legend,
          // HORIZONTAL bars: the labels are whole service names («EXÁMENES DE LABORATORIO»), which do
          // not fit under a column, and the breakdown already arrives ordered largest to smallest, so
          // the length of each aligned row says its weight at a glance.
          xAxis: valueAxis(),
          yAxis: categoryAxis(
            moving.map((service) => service.name),
            { inverse: true },
          ),
          tooltip: comparing
            ? axisTooltip((value) => formatCurrency(value, { cents: true }))
            : itemTooltip((param) => {
                const service = moving[param.dataIndex];
                const share = shareOf(service.amount, total);
                return [
                  `<div style="font-weight:600;margin-bottom:4px">${service.name}</div>`,
                  `<div>${formatCurrency(service.amount, { cents: true })}</div>`,
                  share === null
                    ? ""
                    : `<div style="color:${CHART_INK.muted}">${formatPercent(share)} de la venta del periodo</div>`,
                ].join("");
              }),
          series,
        };

  const table: ChartTable = comparing
    ? {
        columns: [...years.map(String), "Total", "% del periodo"],
        rows: [
          ...moving.map<ChartTableRow>((service) => ({
            id: service.code,
            label: service.name,
            sublabel: service.code,
            values: [
              ...years.map((year) => currencyOrDash(amountOf(year, service.code))),
              formatCurrency(service.amount, { cents: true }),
              formatShare(shareOf(service.amount, total)),
            ],
          })),
          {
            id: "total",
            label: "TOTAL",
            emphasis: true,
            values: [
              ...years.map((year) =>
                currencyOrDash(
                  byYear.find((entry) => entry.year === year)?.reading.totals.amount ?? null,
                ),
              ),
              formatCurrency(total, { cents: true }),
              formatShare(total === 0 ? null : 100),
            ],
          },
        ],
      }
    : {
        columns: ["Venta", "% del periodo", "Cantidad"],
        rows: [
          ...moving.map<ChartTableRow>((service) => ({
            id: service.code,
            label: service.name,
            sublabel: service.code,
            color: colorForEntity(service.code, order),
            values: [
              formatCurrency(service.amount, { cents: true }),
              formatShare(shareOf(service.amount, total)),
              formatNumber(service.quantity),
            ],
          })),
          {
            id: "total",
            label: "TOTAL",
            emphasis: true,
            values: [
              formatCurrency(total, { cents: true }),
              formatShare(total === 0 ? null : 100),
              "",
            ],
          },
        ],
      };

  return {
    id: "sales-services",
    title: "Composición por servicio",
    subtitle: `${pluralize(moving.length, "servicio")} · ${period}`,
    option,
    table,
    note: servicesNote(total, idle, comparing),
    guide: GUIDE_SALES_SERVICES,
    height: SERVICES_HEIGHT,
  };
}

function servicesNote(total: number, idle: number, comparing: boolean): string {
  // The denominator IS NAMED, with its figure: a percentage that does not say what it is measured
  // against forces deducing it from the title, and that is the computation nobody does and everybody
  // assumes.
  const base = comparing
    ? `Una barra por año y servicio. Los porcentajes de la tabla son la parte del periodo entero (${formatCurrency(total, { cents: true })}), sumados los años.`
    : `Los porcentajes son la parte de la venta del periodo (${formatCurrency(total, { cents: true })}) que representa cada servicio.`;
  return idle === 0
    ? base
    : `${base} ${pluralize(idle, "servicio")} del catálogo no se movió en el periodo y no se dibuja.`;
}

// ---------------------------------------------------------------------------
// 2 · Concentration by payer
// ---------------------------------------------------------------------------

function buildPayersCard(input: SalesCardsInput): ChartCardSpec {
  const { reading, byYear, period, payerTableLimit } = input;
  const total = reading.totals.amount;
  const years = byYear.map((entry) => entry.year);
  const comparing = years.length > 1;
  // The largest ones are chosen over the AGGREGATE, not over one year: if the cast changed with the
  // marks, the card could not be compared with itself. And a particular's ORDINAL comes from the same
  // place, so «Particular · 1» means the same person across the three series.
  const drawn = reading.payers.slice(0, PAYER_SLICES);
  const rest = reading.payers.slice(PAYER_SLICES);
  const restAmount = rest.reduce((sum, payer) => sum + payer.amount, 0);
  const drawnAmount = drawn.reduce((sum, payer) => sum + payer.amount, 0);

  const amountOf = (year: number, id: string): number | null =>
    byYear.find((entry) => entry.year === year)?.reading.payers.find((p) => p.id === id)?.amount ??
    null;

  const series: ChartSeries[] = comparing
    ? byYear.map((entry) => ({
        id: `year-${entry.year}`,
        name: String(entry.year),
        type: "bar" as const,
        data: drawn.map((payer) => amountOf(entry.year, payer.id)),
        itemStyle: { color: yearColor(entry.year, years), borderRadius: ROUND_RIGHT },
        barMaxWidth: 12,
      }))
    : [
        {
          id: "pagadores",
          type: "bar" as const,
          data: drawn.map((payer) => ({
            value: payer.amount,
            itemStyle: { color: PAYER_FILL[payer.kind], borderRadius: ROUND_RIGHT },
          })),
          barMaxWidth: 22,
          label: {
            show: true,
            position: "right" as const,
            distance: 6,
            color: CHART_INK.muted,
            fontSize: 11,
            formatter: (param: ChartParam) => formatCurrency(Number(param.value)),
          },
          labelLayout: { hideOverlap: true },
        },
      ];

  const legend = yearLegend(years.length);
  const option: ChartOption | null =
    drawn.length === 0
      ? null
      : {
          animationDuration: 320,
          textStyle: { fontFamily: CHART_FONT },
          grid: {
            left: 8,
            right: 24,
            top: 12,
            bottom: legend.show ? 28 : 8,
            outerBoundsMode: "same",
            outerBoundsContain: "axisLabel",
          },
          legend,
          xAxis: valueAxis(),
          yAxis: categoryAxis(
            drawn.map((payer) => payer.label),
            { inverse: true },
          ),
          tooltip: comparing
            ? axisTooltip((value) => formatCurrency(value, { cents: true }))
            : itemTooltip((param) => {
                const payer = drawn[param.dataIndex];
                const share = shareOf(payer.amount, total);
                return [
                  `<div style="font-weight:600;margin-bottom:4px">${payer.label}</div>`,
                  `<div>${formatCurrency(payer.amount, { cents: true })}</div>`,
                  share === null
                    ? ""
                    : `<div style="color:${CHART_INK.muted}">${formatPercent(share)} de la venta del periodo</div>`,
                ].join("");
              }),
          series,
        };

  // On screen the table does NOT cut: it is the place where a payer that was not drawn keeps its
  // figure. On paper the tail is folded, with its sum, so the column still closes against the TOTAL.
  const listed =
    payerTableLimit === undefined ? reading.payers : reading.payers.slice(0, payerTableLimit);
  const folded = payerTableLimit === undefined ? [] : reading.payers.slice(payerTableLimit);

  const table: ChartTable = comparing
    ? {
        columns: [...years.map(String), "Total", "% del periodo"],
        rows: [
          ...listed.map<ChartTableRow>((payer, index) => ({
            id: `payer-${index}`,
            label: payer.label,
            values: [
              ...years.map((year) => currencyOrDash(amountOf(year, payer.id))),
              formatCurrency(payer.amount, { cents: true }),
              formatShare(shareOf(payer.amount, total)),
            ],
          })),
          ...foldedRow(folded, total, years, byYear),
          {
            id: "total",
            label: "TOTAL",
            emphasis: true,
            values: [
              ...years.map((year) =>
                currencyOrDash(
                  byYear.find((entry) => entry.year === year)?.reading.totals.amount ?? null,
                ),
              ),
              formatCurrency(total, { cents: true }),
              formatShare(total === 0 ? null : 100),
            ],
          },
        ],
      }
    : {
        columns: ["Venta", "% del periodo", "Líneas"],
        rows: [
          ...listed.map<ChartTableRow>((payer, index) => ({
            // The id is the POSITION and never the name: it is React's key and it travels to the
            // report, and a patient's name cannot slip into a structure just because it is not
            // rendered there.
            id: `payer-${index}`,
            label: payer.label,
            color: index < PAYER_SLICES ? PAYER_FILL[payer.kind] : undefined,
            values: [
              formatCurrency(payer.amount, { cents: true }),
              formatShare(shareOf(payer.amount, total)),
              formatNumber(payer.lineCount),
            ],
          })),
          ...foldedRow(folded, total, [], byYear),
          {
            id: "total",
            label: "TOTAL",
            emphasis: true,
            values: [
              formatCurrency(total, { cents: true }),
              formatShare(total === 0 ? null : 100),
              formatNumber(reading.totals.lineCount),
            ],
          },
        ],
      };

  return {
    id: "sales-payers",
    title: "Concentración por pagador",
    subtitle: subtitleForPayers(drawn.length, reading.payers.length, period),
    option,
    table,
    note: payersNote(
      drawn.length,
      drawnAmount,
      rest.length,
      restAmount,
      total,
      folded.length,
      comparing,
    ),
    guide: GUIDE_SALES_PAYERS,
    height: PAYERS_HEIGHT,
  };
}

function subtitleForPayers(drawn: number, all: number, period: string): string {
  return drawn >= all
    ? `${pluralize(all, "pagador", "pagadores")} · ${period}`
    : `Los ${drawn} mayores de ${formatNumber(all)} · ${period}`;
}

/**
 * The concentration is stated IN ONE FIGURE —what part of the period the drawn ones are—, because it
 * is this card's whole reading and estimating it by adding ten bars by eye is not something anyone
 * does.
 */
function payersNote(
  drawn: number,
  drawnAmount: number,
  restCount: number,
  restAmount: number,
  total: number,
  foldedCount: number,
  comparing: boolean,
): string {
  const share = shareOf(drawnAmount, total);
  const head =
    share === null
      ? `Estos ${drawn} son la venta del periodo.`
      : `Estos ${drawn} son el ${formatPercent(share)} de la venta del periodo.`;
  const rest =
    restCount === 0
      ? ""
      : `Los ${formatNumber(restCount)} restantes suman ${formatCurrency(restAmount, { cents: true })}. `;
  // What the TABLE does with those remaining ones is said here and not taken for granted: it is the
  // difference between the screen and the paper, and a note promising the complete list in a report
  // that folds it would be the only thing on the card that cannot be checked by looking at it.
  const where =
    foldedCount === 0
      ? "La tabla los lista uno a uno."
      : `La tabla lista los mayores y agrupa a los ${formatNumber(foldedCount)} últimos en una fila, que sigue sumando en el total.`;
  // Which ones are drawn is decided over the AGGREGATE, and with several years that is not obvious:
  // without this line, a payer who was one year's largest and does not appear reads as a missing
  // datum.
  const ranking = comparing
    ? " Los mayores se eligen por el total del periodo, no por un año, para que el elenco no cambie al mover las marcas."
    : "";
  // The anonymity rule is DECLARED where it is applied: a row saying «Particular · 4» without this
  // line reads as a payer called that.
  return `${head} ${rest}${where}${ranking} Los pacientes particulares van sin nombre; las aseguradoras, con el suyo.`;
}

/**
 * The tail folded into ONE row, or none. It carries its own sum so the column still closes against the
 * TOTAL, and it says HOW MUCH the largest of the ones it groups was: it is the question a folded row
 * raises —«what am I missing?»— and answering it is what makes it acceptable.
 */
function foldedRow(
  folded: readonly PayerTotal[],
  total: number,
  years: readonly number[],
  byYear: readonly YearReading[],
): ChartTableRow[] {
  if (folded.length === 0) {
    return [];
  }
  const ids = new Set(folded.map((payer) => payer.id));
  const amount = folded.reduce((sum, payer) => sum + payer.amount, 0);
  const lines = folded.reduce((sum, payer) => sum + payer.lineCount, 0);
  const largest = Math.max(...folded.map((payer) => payer.amount));
  const perYear = years.map((year) => {
    const payers = byYear.find((entry) => entry.year === year)?.reading.payers ?? [];
    const sum = payers
      .filter((payer) => ids.has(payer.id))
      .reduce((acc, payer) => acc + payer.amount, 0);
    return currencyOrDash(sum === 0 ? null : sum);
  });
  return [
    {
      id: "otros",
      label: "Otros pagadores",
      sublabel: `${pluralize(folded.length, "pagador", "pagadores")} · ninguno supera ${formatCurrency(largest, { cents: true })}`,
      values:
        years.length > 0
          ? [
              ...perYear,
              formatCurrency(amount, { cents: true }),
              formatShare(shareOf(amount, total)),
            ]
          : [
              formatCurrency(amount, { cents: true }),
              formatShare(shareOf(amount, total)),
              formatNumber(lines),
            ],
    },
  ];
}

// ---------------------------------------------------------------------------
// 3 · Evolution
// ---------------------------------------------------------------------------

function buildEvolutionCard(
  { monthlyByYear: full, period }: SalesCardsInput,
  { hideEmptyMonths = false }: SalesCardsOptions = {},
): ChartCardSpec {
  const hidden = hideEmptyMonths ? emptyMonths(full) : [];
  const monthlyByYear: YearMonths[] = full.map((entry) => ({
    year: entry.year,
    points: entry.points.filter((point) => !hidden.includes(point.monthIndex)),
  }));
  const years = monthlyByYear.map((entry) => entry.year);
  const comparing = years.length > 1;
  // The axis comes from the POINTS and not from the twelve months: when «Mes» narrows, the card draws
  // what is marked, and the subtitle and the columns say the same thing.
  const axis = monthlyByYear[0]?.points ?? [];
  const labels = axis.map((point) => MONTHS_SHORT_ES[point.monthIndex]);
  const covered = monthlyByYear.flatMap((entry) =>
    entry.points.filter((point) => point.amount !== null),
  );

  // **Bars WITH a line above**: the bar says how much —which is what is compared against the one of
  // the year next to it— and the line says which way, which is what a row of grouped bars forces you
  // to reconstruct by jumping from the first of each group to the next. They are the two halves of
  // «evolution» and neither is superfluous.
  //
  // It falls back to bars ALONE with a single column, where a line is a loose point. The combo
  // precedent in this app is the total's line over «Distribución»'s stack in PyG.
  const withLine = labels.length > 1;

  const legend = yearLegend(years.length);
  // A year's TWO series share a `name`, which is why the legend dedupes: one item comes out per year
  // and switching it off takes its bar and its line at once.
  const series: ChartSeries[] = monthlyByYear.flatMap((entry) => {
    const color = yearColor(entry.year, years);
    const data = entry.points.map((point) => point.amount);
    const bar: ChartSeries = {
      id: `year-${entry.year}`,
      name: String(entry.year),
      type: "bar",
      data,
      itemStyle: { color, borderRadius: ROUND_TOP },
      barMaxWidth: comparing ? 18 : CHART_MARK.barMaxWidth,
      label: {
        // A figure per mark stops being readable past a few: with several years there are 24 or 36.
        show: !comparing && covered.length <= 6,
        position: "top",
        color: CHART_INK.muted,
        fontSize: 11,
        formatter: (param: ChartParam) =>
          param.value === null ? "" : formatCurrency(Number(param.value)),
      },
      labelLayout: { hideOverlap: true },
    };
    if (!withLine) {
      return [bar];
    }
    const line: ChartSeries = {
      id: `year-${entry.year}-linea`,
      name: String(entry.year),
      type: "line",
      data,
      itemStyle: { color },
      lineStyle: { color, width: CHART_MARK.lineWidth },
      symbol: "circle",
      symbolSize: CHART_MARK.symbolSize,
      // Straight and not `smooth`: a curve invents values between two months nobody measured. And a
      // gap BREAKS the line —ECharts does not join `null` by default—, which is right: joining January
      // with March would draw a February that never arrived.
      smooth: false,
      // Above the bars, which is where it has to be read.
      z: 3,
    };
    return [bar, line];
  });

  const option: ChartOption | null =
    covered.length === 0
      ? null
      : {
          animationDuration: 320,
          textStyle: { fontFamily: CHART_FONT },
          grid: {
            left: 8,
            right: 16,
            top: 24,
            bottom: legend.show ? 28 : 8,
            outerBoundsMode: "same",
            outerBoundsContain: "axisLabel",
          },
          legend,
          // The band is ALWAYS RESERVED —explicitly, not by ECharts' default— because there are
          // always bars: the line runs through the centre of each band, which is where the group of
          // bars is centred.
          xAxis: { ...categoryAxis(labels), boundaryGap: true },
          yAxis: valueAxis(),
          tooltip: axisTooltip((value) => formatCurrency(value, { cents: true })),
          series: [...series, ...absenceMarks(monthlyByYear)],
        };

  const table: ChartTable = {
    columns: labels,
    rows: monthlyByYear.map((entry) => ({
      id: `year-${entry.year}`,
      label: String(entry.year),
      color: yearColor(entry.year, years),
      // The DASH, not a blank cell nor a `$0.00`: it is what says «this month never arrived», as
      // against the zero a loaded month does assert.
      values: entry.points.map((point) => currencyOrDash(point.amount)),
    })),
  };

  return {
    id: "sales-evolution",
    title: "Evolución",
    subtitle: `Venta total · ${period}`,
    option,
    table,
    note: evolutionNote(monthlyByYear, comparing, hidden.length),
    guide: GUIDE_SALES_EVOLUTION,
    height: EVOLUTION_HEIGHT,
  };
}

/**
 * The ABSENCE MARK: a recessive cap under the months that never arrived.
 *
 * Without it an absent month and a month loaded at zero are drawn alike —both, nothing—, and the
 * distinction the whole module rests on would disappear precisely in the card that exists to show it.
 * It goes `silent` (out of hover and of emphasis) because its height is NOT a datum: it is a fixed
 * fraction of the scale, and a tooltip stating it would be inventing a figure.
 *
 * **Only with ONE year**, which is also the only case drawn with bars. Comparing several, the reading
 * is a LINE, and there a gap is already visible because the line breaks and because the other years do
 * have a point in that column; a row of grey caps would add false marks to a chart that already
 * carries three real ones.
 */
function absenceMarks(monthlyByYear: readonly YearMonths[]): ChartSeries[] {
  if (monthlyByYear.length !== 1) {
    return [];
  }
  const points = monthlyByYear[0].points;
  const absent = points.filter((point) => point.amount === null);
  if (absent.length === 0) {
    return [];
  }
  const max = Math.max(...points.map((point) => point.amount ?? 0), 0);
  const stub = max === 0 ? 1 : max * 0.012;
  return [
    {
      id: "sin-cargar",
      type: "bar",
      silent: true,
      // Stacked over the real series so both share a column: a month with an absence mark has no
      // value, so there is nothing to ride on top of it.
      stack: "mes",
      data: points.map((point) => (point.amount === null ? stub : null)),
      itemStyle: {
        color: ABSENT_FILL,
        borderRadius: [2, 2, 0, 0] as [number, number, number, number],
      },
      barMaxWidth: CHART_MARK.barMaxWidth,
    },
  ];
}

function evolutionNote(
  monthlyByYear: readonly YearMonths[],
  comparing: boolean,
  hidden: number,
): string {
  const axisLength = monthlyByYear[0]?.points.length ?? 0;
  const pruned =
    hidden === 0
      ? ""
      : ` Se ocultaron ${pluralize(hidden, "mes", "meses")} sin facturación —los que nunca llegaron y los que llegaron en cero—; el interruptor los devuelve.`;
  const gaps = monthlyByYear
    .map((entry) => ({
      year: entry.year,
      missing: entry.points.filter((point) => point.amount === null).map((p) => p.monthIndex),
    }))
    .filter((entry) => entry.missing.length > 0);

  if (gaps.length === 0) {
    // It talks about the AXIS that is on screen and not about «the twelve months»: with «Mes»
    // narrowed, claiming the year is complete would be saying something the card is not showing.
    const what = axisLength === 12 ? "los doce meses" : pluralize(axisLength, "mes", "meses");
    return (
      (comparing
        ? `Todos los años comparados tienen ${what} del eje cargados.`
        : `Sin huecos: ${what} del eje tienen su archivo cargado.`) + pruned
    );
  }
  // The gaps are said PER YEAR, never one per month: with three half-loaded years, one line per month
  // would be thirty notices for a single idea.
  const detail = gaps
    .map((entry) =>
      comparing
        ? `${entry.year}: ${pluralize(entry.missing.length, "mes", "meses")}`
        : `${pluralize(entry.missing.length, "mes", "meses")} sin cargar (${entry.missing.map((month) => MONTHS_SHORT_ES[month]).join(", ")})`,
    )
    .join(" · ");
  const head = comparing ? `Meses sin cargar — ${detail}.` : `${detail}.`;
  return `${head} Un mes que nunca llegó no es un mes en cero — la misma regla de cobertura de PyG.${pruned}`;
}

/** A table amount, with the DASH of «this period never arrived». */
function currencyOrDash(value: number | null): string {
  return value === null ? "–" : formatCurrency(value, { cents: true });
}

/** A table percentage, with the dash of «this question has no answer». */
function formatShare(share: number | null): string {
  return share === null ? "–" : formatPercent(share);
}
