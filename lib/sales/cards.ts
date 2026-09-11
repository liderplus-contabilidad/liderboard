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
  CHART_GROUND,
  CHART_INK,
  CHART_MARK,
  CHART_MAX_SERIES,
  CHART_NEUTRAL,
  CHART_STAGE,
  CHART_STAGE_LIGHT,
  CHART_STAGE_MATERIAL,
  CHART_STAGE_SKY,
  stageColor,
  stageSliceColor,
  colorForEntity,
  colorForSliceSlot,
  CHART_TRAJECTORY_GROUND,
  figureInk,
  type ChartGround,
} from "@/lib/charts/palette";
/**
 * These two open PLANO and the 3D is opted into, which is the opposite of the evolution's default and
 * for a reason that belongs to the shape: they draw horizontal rows, so a whole service name
 * («EXAMENES DE LABORATORIO») and its figure sit beside every bar. Stood up on the stage the names
 * become a truncated axis and the figures move to the hover — a better picture and a poorer read, so
 * it is the reader who asks for it.
 */
export { SCREEN_SOLID_VIEW, type SolidView } from "@/lib/charts/solid-bars";
import {
  SCREEN_SOLID_VIEW,
  SOLID_BARS_HEIGHT,
  solidBarsOption,
  type SolidView,
} from "@/lib/charts/solid-bars";
import type {
  Chart3DOption,
  Chart3DParam,
  Chart3DSeries,
  ChartAxis,
  ChartAxis3D,
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
import { scopedPeriodLabel } from "./filters";
import {
  fitDirectLabel,
  labelDistance,
  labelHeadroom,
  type LabelFit,
} from "@/lib/charts/label-fit";
import { formatCurrency, formatNumber, formatPercent, pluralize } from "@/lib/format";
import {
  shareOf,
  type MonthPoint,
  type PayerTotal,
  type SalesReading,
  type ServiceMonthSeries,
  type ServiceTotal,
} from "./derive";
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
 * of them are one-off rows of a few dollars: a twenty-page appendix nobody can
 * use for anything. It is the same kind of rule PyG's report already applies by pruning per TABLE
 * while its Excel prunes per WORKBOOK: each medium prunes the way it is read.
 *
 * What is NOT done is truncating outright. The tail is folded into ONE row with its sum, so the column
 * still closes against the TOTAL: a trimmed table whose rows do not add up to its own total is exactly
 * what makes a document untrustworthy.
 */
export const PAYER_TABLE_PRINT_LIMIT = 30;

/**
 * A payer's fill: its PLACE in the ranking, taken from the sequence that OPENS WITH THE WARM
 * composition hues.
 *
 * The ten bars went first in one single blue and then in the DECORATIVE set, and both read the same
 * way against the firm's own workbook: ten bars of one texture, muted, exactly where a ranking has to
 * be walked down. They take a saturated tone each, like «Composición por servicio» right above.
 *
 * What they must NOT take is that card's own set, and the reason is on this very screen: there the
 * colour is IDENTITY —`movingServices` is the one list a service's hue comes from, so «HONORARIOS» is
 * the same blue in the composition and in the evolution's stack, where a LEGEND names it—. A first
 * payer bar out of that same blue would say that payer and that service go together. So the ranking
 * takes the other saturated set the app already measured: `CHART_SLICE_SEQUENCE` opens with the six
 * warm hues of PyG's composition —none of which is an identity slot— and continues into the
 * decorative ones, which is the shape of this card: the head of the ranking, which is what gets read,
 * comes out vivid, and the tail pays for the decorative set with the same relief the annex's doughnut
 * pays it with — every bar carries its name and its figure, and the table twin lists them all.
 *
 * What the validator says about the ten slots drawn here, so nobody re-derives it: lightness band
 * PASS, chroma floor PASS, normal-vision floor PASS —worst adjacent pair verde↔teal ΔE 16.2— and CVD
 * separation inside the 6–8 band —worst pair teal↔magenta ΔE 6.8 deutan, the ninth and tenth bars—,
 * which is legal only with that secondary encoding, and this card has it.
 *
 * **Only in the ONE-year shape.** Comparing several, the series is the YEAR and the colour goes back
 * to being identity, which is what the comparison needs to tell apart.
 */
function payerColor(index: number): string {
  return colorForSliceSlot(index);
}

/** The fill of a month that NEVER arrived — see `absenceMarks`. The ground's own grid tone: a mark
 *  that says «nothing here» has to be the most recessive thing on the plot, on either ground. */
const absentFill = (ground: ChartGround) => CHART_GROUND[ground].grid;

const SERVICES_HEIGHT = 300;
const PAYERS_HEIGHT = 420;
const EVOLUTION_HEIGHT = 300;
/** The same card in three dimensions: perspective spends height that a flat plot does not. */
const SKYLINE_HEIGHT = 420;

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
   * The marked year's months opened up BY SERVICE — what the evolution stacks. Empty or absent, the
   * evolution falls back to one bar per year, which is also what a year with no coverage draws.
   *
   * It is only read with ONE year marked: stacking services and comparing years on the same axis asks
   * for grouped stacks and takes the colour away from the year, which is the only thing telling those
   * series apart. The year-on-year reading of one service is asked for by MARKING it.
   */
  serviceMonthly?: readonly ServiceMonthSeries[];
  /**
   * How the marked services are called — «MEDICINAS», «2 de 5 servicios». It is composed ONCE
   * (`describeServiceScope`) and only placed here, so no two cards name different slices.
   */
  scope?: string;
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
/**
 * The two shapes the evolution can take when it is BROKEN DOWN by service.
 *
 * `skyline` gives the service its own axis and `stacked` piles it into the month's column. It is a
 * genuine choice and not a decoration, which is why it is a control and not a consequence of the
 * data: the stack answers «how much did this month bill and out of what» in one glance, and the
 * skyline answers «where is each service heading» — the question the stack cannot answer, because
 * only its bottom band starts at zero.
 *
 * Both are the SAME numbers, and the table twin is the same table.
 */
export type EvolutionView = "skyline" | "stacked";

/**
 * What the SCREEN opens in. The pure layer's own default is `stacked`, and the asymmetry is the
 * point: a 3D box is a WebGL canvas that a printed sheet cannot carry and a camera nobody can press
 * on paper, so the shape a caller gets BY OMISSION has to be the flat one. `lib/sales/report.ts`
 * builds the same cards through the same function, and it is the omission that keeps it right —
 * not a rule someone has to remember.
 */
export const SCREEN_EVOLUTION_VIEW: EvolutionView = "skyline";

export interface SalesCardsOptions {
  /**
   * Hides months with no billing on the evolution's axis. Months with no data (`null`) and at zero are
   * treated as empty columns.
   */
  hideEmptyMonths?: boolean;
  /**
   * Which shape the broken-down evolution takes. Ignored when there is no breakdown to shape.
   * Defaults to `stacked` — see `SCREEN_EVOLUTION_VIEW` for why the omission is the flat one.
   */
  evolutionView?: EvolutionView;
  /** Which body «Composición por servicio» takes. Defaults to `plano` — see `SolidView`. */
  servicesView?: SolidView;
  /** Which body «Concentración por pagador» takes. Defaults to `plano` — see `SolidView`. */
  payersView?: SolidView;
}

export interface SalesCards {
  services: ChartCardSpec<ChartOption | Chart3DOption>;
  payers: ChartCardSpec<ChartOption | Chart3DOption>;
  /** The card whose two shapes are two READINGS and not two bodies — see `EvolutionView`. */
  evolution: ChartCardSpec<ChartOption | Chart3DOption>;
  /**
   * How many columns of the axis move nothing. It is ALWAYS counted over the unpruned axis, which is
   * what keeps the button from vanishing just as it is pressed.
   */
  emptyMonths: number;
  /**
   * Whether choosing a shape means anything at all — decided HERE and not by the component, which
   * would have to reconstruct «is there a breakdown» out of the filters to guess it.
   *
   * It is false when there is no breakdown —several years marked (the series is the year and the
   * colour belongs to it) or a year with no service opened up— and ALSO when the axis is down to a
   * single month: the skyline exists to follow a service across its months, and with one there are
   * none to follow. A control that means nothing for the open data renders NOTHING rather than
   * sitting disabled.
   */
  skylineAvailable: boolean;
}

export function buildSalesCards(
  input: SalesCardsInput,
  options: SalesCardsOptions = {},
): SalesCards {
  const evolution = buildEvolutionCard(input, options);
  return {
    services: buildServicesCard(input, options.servicesView ?? SCREEN_SOLID_VIEW),
    payers: buildPayersCard(input, options.payersView ?? SCREEN_SOLID_VIEW),
    evolution: evolution.card,
    emptyMonths: emptyMonths(input.monthlyByYear).length,
    skylineAvailable: evolution.skylineAvailable,
  };
}

/** The period as the subtitles say it. The wording lives in `filters.ts`, next to the one that
 *  composes the slice, so the screen and the paper cannot name the same reading two ways. */
export function scopedPeriod({ scope, period }: SalesCardsInput): string {
  return scopedPeriodLabel(scope ?? null, period);
}

/**
 * The services the breakdown DRAWS, in its order — the ONE list a service's colour comes from.
 *
 * An idle service goes and is counted: the report declares the catalogue's five whether or not they
 * have movement, and an invisible bar buries the one that matters. It is judged over the AGGREGATE,
 * so a service that moved in any of the marked years stays.
 */
function movingServices(reading: SalesReading): ServiceTotal[] {
  return reading.services.filter((service) => service.amount !== 0);
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

/**
 * Every helper of this chrome takes the GROUND it is drawn on, `surface` unless said otherwise: the
 * evolution comparing several years stands on the stage (`CHART_GROUND`), and there the light
 * chrome's greys are invisible.
 */
function valueAxis(ground: ChartGround = "surface"): ChartAxis {
  const tones = CHART_GROUND[ground];
  return {
    type: "value",
    axisLine: { show: false },
    axisTick: { show: false },
    splitLine: { show: true, lineStyle: { color: tones.grid, width: 1, type: "solid" } },
    axisLabel: {
      color: tones.inkFaint,
      fontSize: 11,
      // Without cents: an axis is the scale against which a bar's length is estimated, and six labels
      // of «$107,231.22» eat the drawing's width. The exact figure goes on the bar, in the tooltip
      // and in the table.
      formatter: (value) => formatCurrency(Number(value)),
    },
  };
}

function categoryAxis(
  labels: readonly string[],
  options?: { inverse?: boolean; ground?: ChartGround },
): ChartAxis {
  const tones = CHART_GROUND[options?.ground ?? "surface"];
  return {
    type: "category",
    data: [...labels],
    inverse: options?.inverse ?? false,
    axisLine: { show: true, lineStyle: { color: tones.axis, width: 1, type: "solid" } },
    axisTick: { show: false },
    splitLine: { show: false },
    axisLabel: {
      color: tones.inkMuted,
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
function yearLegend(years: number, ground: ChartGround = "surface"): ChartLegend {
  return legendFor(years > 1, undefined, CHART_GROUND[ground].inkMuted);
}

/** The house legend. `data` names WHICH series it lists — see `ChartLegend.data`. */
function legendFor(
  show: boolean,
  data?: readonly string[],
  /** The skyline draws its legend ON the stage, where the card's ink would not be read. */
  tone: string = CHART_INK.muted,
): ChartLegend {
  return {
    show,
    ...(data ? { data: [...data] } : {}),
    type: "scroll",
    bottom: 0,
    icon: "roundRect",
    itemWidth: 10,
    itemHeight: 10,
    itemGap: 14,
    textStyle: { color: tone, fontSize: 11.5 },
  };
}

/** The house tooltip: inside the CARD (`confine`), which is an `overflow-hidden`. */
function itemTooltip(
  formatter: (param: ChartParam) => string,
  ground: ChartGround = "surface",
): ChartTooltip {
  const tones = CHART_GROUND[ground];
  return {
    trigger: "item",
    backgroundColor: tones.panel,
    borderColor: tones.panelBorder,
    borderWidth: 1,
    padding: [8, 10],
    textStyle: { color: tones.ink, fontSize: 12 },
    confine: true,
    formatter: (params) => formatter(Array.isArray(params) ? params[0] : params),
  };
}

/** A comparison's tooltip: the whole column, with one line per year. On the stage it is drawn in
 *  the stage's panel — a white box would be a hole punched in the night. */
function axisTooltip(
  unit: (value: number) => string,
  ground: ChartGround = "surface",
): ChartTooltip {
  const tones = CHART_GROUND[ground];
  return {
    trigger: "axis",
    backgroundColor: tones.panel,
    borderColor: tones.panelBorder,
    borderWidth: 1,
    padding: [8, 10],
    textStyle: { color: tones.ink, fontSize: 12 },
    confine: true,
    axisPointer: { type: "shadow", lineStyle: { color: tones.axis, width: 1 } },
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
      return `<div style="font-weight:600;margin-bottom:4px">${head}</div>${body || `<div style="color:${tones.inkMuted}">Sin cargar</div>`}`;
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

function buildServicesCard(
  input: SalesCardsInput,
  view: SolidView,
): ChartCardSpec<ChartOption | Chart3DOption> {
  const { reading, byYear, period } = input;
  const total = reading.totals.amount;
  const moving = movingServices(reading);
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
  // The SOLID body of this same reading: the same services in the same order, the same colours, and
  // the years —when there are several— as the rows the flat legend already names. Nothing new is
  // encoded; see `solidBarsOption`.
  const solid: Chart3DOption | null =
    moving.length === 0
      ? null
      : solidBarsOption({
          columns: moving.map((service) => service.name),
          rows: comparing
            ? byYear.map((entry) => ({
                id: `year-${entry.year}`,
                name: String(entry.year),
                color: stageColor(yearColor(entry.year, years)),
                values: moving.map((service) => amountOf(entry.year, service.code)),
              }))
            : [
                {
                  id: "servicios",
                  name: "Venta",
                  color: stageColor(colorForEntity(order[0] ?? "", order)),
                  values: moving.map((service) => service.amount),
                },
              ],
          ...(comparing
            ? {}
            : { colors: moving.map((service) => stageColor(colorForEntity(service.code, order))) }),
          formatValue: (value) => formatCurrency(value, { cents: true }),
          formatAxis: (value) => formatCurrency(value),
        });
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

  const asSolid = view === "solido" && solid !== null;
  return {
    id: "sales-services",
    title: "Composición por servicio",
    // With services marked, WHICH ones is worth more than HOW MANY: the count is already the length
    // of the list underneath.
    subtitle: `${input.scope ?? pluralize(moving.length, "servicio")} · ${period}`,
    option: asSolid ? solid : option,
    table,
    // The solid body adds the one thing no control announces: the camera turns.
    note: asSolid
      ? `${servicesNote(total, idle, comparing)} Arrastra para girar la vista.`
      : servicesNote(total, idle, comparing),
    guide: GUIDE_SALES_SERVICES,
    height: asSolid ? SOLID_BARS_HEIGHT : SERVICES_HEIGHT,
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

function buildPayersCard(
  input: SalesCardsInput,
  view: SolidView,
): ChartCardSpec<ChartOption | Chart3DOption> {
  const { reading, byYear, payerTableLimit } = input;
  const total = reading.totals.amount;
  const years = byYear.map((entry) => entry.year);
  const comparing = years.length > 1;
  // The largest ones are chosen over the AGGREGATE, not over one year: if the cast changed with the
  // marks, the card could not be compared with itself. And a particular's ORDINAL comes from the same
  // place, so a row means the same payer across the three series.
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
          data: drawn.map((payer, index) => ({
            value: payer.amount,
            itemStyle: { color: payerColor(index), borderRadius: ROUND_RIGHT },
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
  // The SOLID body of this same reading: the same payers in the same order —chosen over the
  // AGGREGATE, so a row means the same payer across the years— and the same colours.
  const solid: Chart3DOption | null =
    drawn.length === 0
      ? null
      : solidBarsOption({
          columns: drawn.map((payer) => payer.label),
          rows: comparing
            ? byYear.map((entry) => ({
                id: `year-${entry.year}`,
                name: String(entry.year),
                color: stageColor(yearColor(entry.year, years)),
                values: drawn.map((payer) => amountOf(entry.year, payer.id)),
              }))
            : [
                {
                  id: "pagadores",
                  name: "Venta",
                  color: stageSliceColor(payerColor(0)),
                  values: drawn.map((payer) => payer.amount),
                },
              ],
          ...(comparing
            ? {}
            : { colors: drawn.map((_payer, index) => stageSliceColor(payerColor(index))) }),
          formatValue: (value) => formatCurrency(value, { cents: true }),
          formatAxis: (value) => formatCurrency(value),
        });
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
            // The id is the POSITION and never the name: it is React's key, and a name is neither
            // unique nor stable enough to key a row by — the same payer can be written two ways
            // across two months.
            id: `payer-${index}`,
            label: payer.label,
            // Only the drawn ones carry a dot: one on a row that is not in the chart promises a bar
            // the reader will not find.
            color: index < PAYER_SLICES ? payerColor(index) : undefined,
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

  const asSolid = view === "solido" && solid !== null;
  const note = payersNote(
    drawn.length,
    drawnAmount,
    rest.length,
    restAmount,
    total,
    folded.length,
    comparing,
  );
  return {
    id: "sales-payers",
    title: "Concentración por pagador",
    subtitle: subtitleForPayers(drawn.length, reading.payers.length, scopedPeriod(input)),
    option: asSolid ? solid : option,
    table,
    // The solid body adds the one thing no control announces: the camera turns.
    note: asSolid ? `${note} Arrastra para girar la vista.` : note,
    guide: GUIDE_SALES_PAYERS,
    height: asSolid ? SOLID_BARS_HEIGHT : PAYERS_HEIGHT,
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
  return `${head} ${rest}${where}${ranking}`;
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

/** Every bar of this card lives in ONE stack, absence marks included: that is what makes a column a
 *  column. */
const STACK_ID = "mes";

/**
 * Segments the stack draws before folding its tail — the identity palette's slots.
 *
 * It is a limit of COLOUR and not of reading: past the eighth, `colorForEntity` hands out the neutral,
 * and two neutral segments touching inside the same column are indistinguishable from one. The table
 * twin does not fold, which is where a grouped service keeps its figure.
 */
const STACK_SLICES = CHART_MAX_SERIES;

/**
 * WHAT the card ended up drawing, which is the one thing its note cannot guess: the three shapes read
 * the same `segments` and say three different things about them.
 */
type EvolutionShape = "stacked" | "skyline" | "services";

/**
 * The figure written over a bar of this card — the one composition of it, so the stack, the year and
 * the service axis cannot end up writing their amount three different ways.
 *
 * It is always the COLUMN's total and it is always written: `lib/charts/label-fit` answers a cramped
 * axis with a smaller body and, past twenty columns, with the cents —which the tooltip and the table
 * twin keep— instead of with the silence this card used past six months. Flat at every density: the
 * card is read at a glance, and a turned amount is read by tilting the head.
 *
 * `hideOverlap` still drops what collides INSIDE a row, which is two adjacent months on an axis
 * narrower than the fit assumed; between rows there is nothing left to collide.
 */
function totalLabel(
  fit: LabelFit,
  row = 0,
  ground: ChartGround = "surface",
): Pick<ChartSeries, "label" | "labelLayout"> {
  return {
    label: {
      show: true,
      position: "top",
      distance: labelDistance(row, fit),
      ...figureInk(ground, CHART_INK.muted),
      fontSize: fit.fontSize,
      formatter: (param: ChartParam) =>
        param.value === null ? "" : formatCurrency(Number(param.value), { cents: fit.cents }),
    },
    labelLayout: { hideOverlap: true },
  };
}

/** One band of the stack: a service, or the «Otros» its tail folds into. */
interface StackSegment {
  id: string;
  name: string;
  color: string;
  points: MonthPoint[];
}

/**
 * 3 · Evolution — billing trends month by month and their composition.
 *
 * **With ONE year**, the column shows the BREAKDOWN by service, offering two shapes (`EvolutionView`):
 * - `skyline` (default): Each service has its own AXIS, starting at zero, enabling month-to-month tracking.
 * - `stacked`: Displays the total per month with a breakdown, emphasizing the distribution.
 *
 * Both share the same `segments` and table, providing two views of one dataset.
 *
 * **With ONE month**, the stack spreads into one bar per SERVICE, provided there are at least two segments.
 *
 * **With MULTIPLE years**, it defaults to one series per year, avoiding stacks to maintain year differentiation.
 */
function buildEvolutionCard(
  input: SalesCardsInput,
  { hideEmptyMonths = false, evolutionView = "stacked" }: SalesCardsOptions = {},
): { card: ChartCardSpec<ChartOption | Chart3DOption>; skylineAvailable: boolean } {
  const { monthlyByYear: full, reading, serviceMonthly = [] } = input;
  const hidden = hideEmptyMonths ? emptyMonths(full) : [];
  const kept = (points: readonly MonthPoint[]): MonthPoint[] =>
    points.filter((point) => !hidden.includes(point.monthIndex));
  const monthlyByYear: YearMonths[] = full.map((entry) => ({
    year: entry.year,
    points: kept(entry.points),
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
  // the year next to it, and what the stack breaks down— and the line says which way, which is what a
  // row of grouped bars forces you to reconstruct by jumping from the first of each group to the next.
  //
  // It falls back to bars ALONE with a single column, where a line is a loose point.
  const withLine = labels.length > 1;

  // **The card stands on the STAGE** (`CHART_TRAJECTORY_GROUND`) in every flat shape — one year or
  // several, the stack, the spread of one month: a thin stroke over a white plot has nothing but its
  // hue to be found by, and a ground that came and went with the marks read as a different card. What
  // stands on it is translated by slot, the skyline's same rule, so a service is one colour in the
  // stack and in the 3D box; the table twin, on white, keeps the light one.
  const ground: ChartGround = CHART_TRAJECTORY_GROUND;

  // The colour of a service comes from the SAME list the breakdown card orders by, so the two cards on
  // the screen cannot paint one service two ways.
  const order = movingServices(reading).map((service) => service.code);
  const opened = comparing
    ? []
    : serviceMonthly.map((entry) => ({ ...entry, points: kept(entry.points) }));
  const ranked = [...opened].sort((a, b) => rankOf(a.code, order) - rankOf(b.code, order));
  const segments = stackSegments(ranked, order);
  const foldedServices = Math.max(ranked.length - STACK_SLICES, 0);
  const stacked = segments.length > 0;

  // A single column: the stack has nothing to be a stack OF, and the axis is spending its width
  // repeating the month the subtitle already names.
  const spread = segments.length > 1 && axis.length === 1;
  // The skyline is offered exactly when there IS a breakdown AND months to follow; with several years
  // the series is the year, and giving the service an axis would leave the year with nothing to be
  // drawn as.
  const skylineAvailable = stacked && axis.length > 1;
  const skyline = skylineAvailable && evolutionView === "skyline";
  const shape: EvolutionShape = spread ? "services" : skyline ? "skyline" : "stacked";

  // Spread over the services, the legend would list exactly what the axis already labels.
  const legend = spread
    ? legendFor(false)
    : stacked
      ? legendFor(
          true,
          segments.map((segment) => segment.name),
          CHART_GROUND[ground].inkMuted,
        )
      : yearLegend(years.length, ground);

  // The figure over each bar. What it says is always the COLUMN's total —the month's billing, or the
  // service's when the axis is the services— and never the band it happens to sit on: a stack's bands
  // are already told apart by colour and read one by one in the tooltip, and writing five figures up
  // a column is how a column stops being read as one amount.
  //
  // The shape comes from `lib/charts/label-fit`, the same rule PyG's evolution card reads, so the two
  // cards of the app that draw months side by side write their amounts alike. Only the number of
  // COLUMNS is measured: there is one row of figures per series, and here that is one row —the total
  // line, or the bar of each year when several are compared.
  const labelFit = fitDirectLabel(spread ? segments.length : axis.length);
  const labelRows = spread || stacked ? 1 : monthlyByYear.length;

  const series: ChartSeries[] = spread
    ? serviceBars(segments, labelFit, ground)
    : stacked
      ? stackSeries(segments, axis, withLine, labelFit, ground)
      : monthlyByYear.flatMap((entry, index) =>
          yearSeries(entry, years, comparing, withLine, labelFit, index, ground),
        );

  const option: ChartOption | Chart3DOption | null =
    covered.length === 0
      ? null
      : skyline
        ? skylineOption(segments, labels)
        : {
            animationDuration: 320,
            textStyle: { fontFamily: CHART_FONT },
            ...(CHART_GROUND[ground].sky ? { backgroundColor: CHART_GROUND[ground].sky } : {}),
            grid: {
              left: 8,
              right: 16,
              // The room the top row of figures asks for; `outerBoundsContain` only reserves for the
              // axis' labels, so without this the amount over the tallest column is cropped.
              top: labelHeadroom(labelRows, labelFit, 24),
              bottom: legend.show ? 28 : 8,
              outerBoundsMode: "same",
              outerBoundsContain: "axisLabel",
            },
            legend,
            // The band is ALWAYS RESERVED —explicitly, not by ECharts' default— because there are
            // always bars: the line runs through the centre of each band, which is where the group of
            // bars is centred.
            xAxis: {
              ...categoryAxis(spread ? segments.map((segment) => segment.name) : labels, {
                ground,
              }),
              boundaryGap: true,
            },
            yAxis: valueAxis(ground),
            tooltip: spread
              ? itemTooltip((param) => {
                  const segment = segments[param.dataIndex];
                  const share = shareOf(Number(param.value), axis[0]?.amount ?? 0);
                  return [
                    `<div style="font-weight:600;margin-bottom:4px">${segment.name}</div>`,
                    `<div>${formatCurrency(Number(param.value), { cents: true })}</div>`,
                    share === null
                      ? ""
                      : `<div style="color:${CHART_GROUND[ground].inkMuted}">${formatPercent(share)} del mes</div>`,
                  ].join("");
                }, ground)
              : axisTooltip((value) => formatCurrency(value, { cents: true }), ground),
            // The absence mark is one bar per MONTH, so it has nothing to sit under on an axis of
            // services — and with a single column that never arrived there is no option to draw at all.
            series: spread ? series : [...series, ...absenceMarks(monthlyByYear, ground)],
          };

  const table: ChartTable = stacked
    ? {
        columns: labels,
        rows: [
          ...ranked.map<ChartTableRow>((entry, index) => ({
            id: `servicio-${entry.code}`,
            label: entry.name,
            sublabel: entry.code,
            // Only what is DRAWN carries a dot: one on a folded row would promise a band the reader
            // cannot find in the chart.
            ...(index < STACK_SLICES ? { color: colorForEntity(entry.code, order) } : {}),
            values: entry.points.map((point) => currencyOrDash(point.amount)),
          })),
          {
            id: "total",
            label: "TOTAL",
            emphasis: true,
            values: axis.map((point) => currencyOrDash(point.amount)),
          },
        ],
      }
    : {
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
    skylineAvailable,
    card: {
      id: "sales-evolution",
      title: "Evolución",
      subtitle: `Venta total · ${scopedPeriod(input)}`,
      option,
      table,
      // The breakdown is explained only when there is one to see: with a single service marked the
      // column IS that service, and a sentence about a stack would describe something that is not
      // there.
      note: evolutionNote(
        monthlyByYear,
        comparing,
        hidden.length,
        segments.length > 1,
        foldedServices,
        shape,
      ),
      guide: GUIDE_SALES_EVOLUTION,
      // The 3D box needs the room its perspective costs: at the flat card's height the far row of
      // months lands on top of the legend.
      height: skyline ? SKYLINE_HEIGHT : EVOLUTION_HEIGHT,
    },
  };
}

/**
 * The `skyline` shape: the SAME bands of the stack, each given its own row of the depth axis.
 *
 * What the third axis buys, and the only reason it is here: every service now rests on zero. Piled
 * up, only the bottom band does, and the ones above it sit on a floor that moves with the months —
 * so a band's height is comparable against the band beside it and against nothing else, least of all
 * against itself in another month, which is precisely what an EVOLUTION is read for.
 *
 * Three decisions keep it a reading and not an effect:
 *
 * - **One rig, and it is what draws the EDGE.** Flat shading was the first rule here and it left
 *   the rows reading as a single continuous surface: with no light every face returns the same
 *   pixel, and `bar3D` has no border to fall back on. `CHART_STAGE_LIGHT` models the solid without
 *   repainting it — the top face keeps the fill, the face turned away falls to 0.72 of it, and that
 *   floor is measured against the sky, not assumed.
 * - **A month that never arrived produces NO datum**, so the floor is empty there; a loaded month
 *   that sold nothing gets `minHeight`, a tile flat on the floor. It is the first time this module
 *   can DRAW the difference the whole engine carries — stacked, both are the same nothing.
 * - **A long box against a shallow one.** Twelve months across and few services deep is what makes a
 *   horizon; a cube of equal sides is where the back row hides behind the front one.
 */
function skylineOption(
  segments: readonly StackSegment[],
  labels: readonly string[],
): Chart3DOption {
  // **La serie MAYOR va al fondo**, que es lo único que hace legible una matriz de barras en
  // perspectiva: una barra tapa a las que tiene detrás, así que con la mayor delante —el orden del
  // desglose, que es de mayor a menor— HONORARIOS esconde entero todo lo demás. Invertida, una barra
  // corta nunca llega a tapar a la que tiene detrás. El orden del COLOR y el de la leyenda no se
  // tocan: siguen siendo los del desglose, para que el tono de un servicio sea el mismo en las tres
  // tarjetas.
  const depthOf = (index: number) => segments.length - 1 - index;
  const services = segments.map((segment) => segment.name);

  // La caja LLENA la tarjeta, dentro de unos topes: doce meses y cinco servicios es el archivo real,
  // pero «Mes» acota a dos y un cliente puede declarar más servicios que eso. El tope subió de 210 a
  // 235 al pintarse el fondo: a 210 el dibujo ocupaba el tercio central de una tarjeta ancha, y ese
  // vacío ya no es papel en blanco sino noche. El suelo del clamp es lo que impide que un tramo de
  // tres meses se vuelva una astilla.
  const boxWidth = clamp(labels.length * 19, 120, 235);
  const boxDepth = clamp(services.length * 17, 34, 95);
  // Una barra ocupa POCO MÁS DE LA MITAD de su casilla, y lo que deja es lo que separa una fila de
  // la de al lado. Eran dos tercios, y el hueco que quedaba se cerraba en perspectiva: lo que se ve
  // entre dos barras no es el hueco, es su proyección, y la cara lateral de la de delante se la come
  // casi entera. Sombrear la barra dibuja su cuerpo; el hueco es lo que dibuja que son DOS.
  const barSize: [number, number] = [
    (boxWidth / Math.max(labels.length, 1)) * 0.52,
    (boxDepth / Math.max(services.length, 1)) * 0.52,
  ];
  const series: Chart3DSeries[] = segments.map((segment, index) => ({
    type: "bar3D",
    id: segment.id,
    name: segment.name,
    shading: "realistic",
    realisticMaterial: CHART_STAGE_MATERIAL,
    // The service's colour ON THE STAGE, which is its own scale: `stageColor` translates by SLOT, so
    // the service that is first in the breakdown is the same turquoise in every 3D card — and is the
    // blue of «Composición por servicio», whose ground is white and whose scale is another.
    itemStyle: { color: stageColor(segment.color) },
    // The bevel is the EDGE's surface: `CHART_STAGE_LIGHT`'s highlight has to land on something, and
    // a chamfer of a hair is a line one pixel wide that catches nothing. Wider than this and it starts
    // eating the height of the short bars, which are the ones this shape exists to make legible.
    bevelSize: 0.2,
    bevelSmoothness: 2,
    // A real zero still gets a tile: it is a figure the file asserted, and it has to be tellable
    // apart from the empty floor of a month that never arrived.
    minHeight: 1.2,
    barSize,
    emphasis: {
      // NO `itemStyle` here, and that is the fix and not an omission: a `bar3D` is one merged mesh
      // with vertex colours, so gl reads only `color`/`opacity` and silently ignored the border
      // this used to declare. Left alone it lifts the fill itself — the same hue, plainly brighter,
      // which is what a hover is for. A second definition would only be a worse one.
      // `echarts-gl` writes the RAW datum on the hovered bar unless told otherwise, so the one
      // figure of this app that reached the screen as «39684.6195…» was this one. It goes through
      // the same formatter as every other amount —comma thousands, two decimals— and it is drawn on
      // the stage's own panel, which is the tooltip's chrome and not gl's default box.
      label: {
        show: true,
        formatter: (param) => formatCurrency(param.value[2], { cents: true }),
        textStyle: {
          color: CHART_STAGE.ink,
          fontSize: 11.5,
          fontFamily: CHART_FONT,
          backgroundColor: CHART_STAGE.panel,
          borderColor: CHART_STAGE.panelBorder,
          borderWidth: 1,
          borderRadius: 4,
          padding: [4, 6],
        },
      },
    },
    data: segment.points.flatMap((point, month) =>
      point.amount === null
        ? []
        : [{ value: [month, depthOf(index), point.amount] as [number, number, number] }],
    ),
  }));

  return {
    animationDuration: 320,
    textStyle: { fontFamily: CHART_FONT },
    // On the stage the legend goes to the TOP. The camera looks DOWN at the box, so the reading hangs
    // low in the frame and the empty sky is above it: anchored at the bottom the legend sat ON the
    // last months of the axis, and «Nov» and «Dic» were read through it.
    legend: { ...legendFor(true, services, CHART_STAGE.inkMuted), bottom: "auto", top: 6 },
    grid3D: {
      boxWidth,
      boxDepth,
      boxHeight: 82,
      // THE STAGE. `gl`'s own default is a pale gradient, and on it a bar had nothing but its own
      // fill to be found by: the short ones washed out and the tall ones read as holes in the card.
      // The sky lightens upward, so what is behind the BARS is the deepest end of it — see
      // `CHART_STAGE`, where every figure of this ground is measured.
      environment: CHART_STAGE_SKY,
      light: CHART_STAGE_LIGHT,
      axisLine: { lineStyle: { color: CHART_STAGE.axis, width: 1, type: "solid" } },
      splitLine: { lineStyle: { color: CHART_STAGE.grid, width: 1, type: "solid" } },
      axisPointer: { show: false },
      viewControl: {
        // It opens STILL, from above and slightly off to one side. The elevation is the measured
        // one, not a taste: below the mid thirties the front face of a bar covers the gap that
        // separates its row from the next and the three read as one continuous surface; well above
        // it the drawing turns into a plan and the heights stop being heights. `beta` stays small so
        // the twelve months run left to right, which is the direction a year is read in.
        alpha: 38,
        beta: 12,
        // La otra mitad de `boxWidth`, y medida CONTRA él: una caja mayor vista desde más lejos es
        // la misma imagen, así que la cámara retrocede lo justo para que la caja más ancha siga
        // entrando entera. Más cerca, la fila de delante —«Dic» y su rótulo de servicio— se sale
        // por la esquina inferior derecha del escenario, que ahora se ve porque tiene color.
        distance: 196,
        minDistance: 130,
        maxDistance: 330,
        // Panning is off: the box is the whole reading, and dragging it out of frame has no way back
        // short of reloading. Rotating and zooming stay.
        panSensitivity: 0,
        rotateSensitivity: 1,
        zoomSensitivity: 1,
        damping: 0.85,
        animation: false,
      },
    },
    xAxis3D: categoryAxis3D([...labels]),
    yAxis3D: categoryAxis3D([...services].reverse(), { truncate: 16 }),
    zAxis3D: {
      type: "value",
      name: "",
      axisLine: { lineStyle: { color: CHART_STAGE.axis, width: 1, type: "solid" } },
      splitLine: { show: true, lineStyle: { color: CHART_STAGE.grid, width: 1, type: "solid" } },
      axisLabel: {
        color: CHART_STAGE.inkFaint,
        fontSize: 10.5,
        // Without cents, `valueAxis`'s same rule: a scale is estimated against, not read off.
        formatter: (value) => formatCurrency(Number(value)),
      },
    },
    tooltip: {
      // The card's tooltip, in the stage's tones: it is drawn INSIDE the dark panel, and the white
      // box the rest of the module uses would be a hole punched in the night.
      trigger: "item",
      backgroundColor: CHART_STAGE.panel,
      borderColor: CHART_STAGE.panelBorder,
      borderWidth: 1,
      padding: [8, 10],
      textStyle: { color: CHART_STAGE.ink, fontSize: 12 },
      confine: true,
      formatter: (param: Chart3DParam) => {
        // The month comes from the datum's own X INDEX and not from `param.name`: in a 3D chart that
        // field carries the series, and the reader hovering a bar is asking which month it is.
        const head = labels[param.value[0]] ?? "";
        return `<div style="font-weight:600;margin-bottom:4px">${head}</div><div>${param.marker ?? ""} ${param.seriesName ?? ""}: <b>${formatCurrency(param.value[2], { cents: true })}</b></div>`;
      },
    },
    series,
  };
}

/** A 3D category axis with the house chrome. `truncate` caps a label that would run into the box. */
function categoryAxis3D(labels: string[], options?: { truncate?: number }): ChartAxis3D {
  const cap = options?.truncate;
  return {
    type: "category",
    data: labels,
    // `echarts-gl` rotula los ejes «X», «Y» y «Z» si no se le dice otra cosa, y son tres letras que
    // no significan nada para quien lee meses y servicios: el vacío EXPLÍCITO es lo que las quita.
    name: "",
    axisLine: { lineStyle: { color: CHART_STAGE.axis, width: 1, type: "solid" } },
    axisTick: { show: false },
    splitLine: { show: false },
    axisLabel: {
      color: CHART_STAGE.inkMuted,
      fontSize: 10.5,
      // `width`/`overflow` are a 2D grid's tools and the 3D one ignores them, so the cut is made
      // here, in the string. An ellipsis is what says the name goes on — the legend and the tooltip
      // carry it whole.
      ...(cap
        ? {
            formatter: (value: string | number) => {
              const text = String(value);
              return text.length > cap ? `${text.slice(0, cap - 1)}…` : text;
            },
          }
        : {}),
    },
  };
}

/** Keeps a computed box side inside the range where the shape still reads. */
function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** A service's place in the breakdown's order. One it does not declare —netted to zero over the
 *  period— goes last instead of stealing a slot. */
function rankOf(code: string, order: readonly string[]): number {
  const slot = order.indexOf(code);
  return slot < 0 ? order.length : slot;
}

/** The stack's bands: the services the palette can tell apart, and the tail folded into one «Otros».
 *  Folding is not truncating — the sum stays, and the table twin still lists them one by one. */
function stackSegments(
  ranked: readonly ServiceMonthSeries[],
  order: readonly string[],
): StackSegment[] {
  const drawn = ranked.slice(0, STACK_SLICES).map<StackSegment>((entry) => ({
    id: `servicio-${entry.code}`,
    name: entry.name,
    color: colorForEntity(entry.code, order),
    points: entry.points,
  }));
  const rest = ranked.slice(STACK_SLICES);
  if (rest.length === 0) {
    return drawn;
  }
  return [
    ...drawn,
    {
      id: "servicio-otros",
      name: "Otros",
      // Not a slot of the scale: it is what is left over, and `CHART_NEUTRAL` is how this app says so.
      color: CHART_NEUTRAL,
      points: sumPoints(rest.map((entry) => entry.points)),
    },
  ];
}

/** The tail added up, column by column, WITHOUT turning a gap into a zero: a month nobody loaded is
 *  `null` in every service, so it stays `null` in their sum. */
function sumPoints(points: readonly MonthPoint[][]): MonthPoint[] {
  const first = points[0] ?? [];
  return first.map((point, index) => {
    const values = points.map((entry) => entry[index]?.amount ?? null);
    const present = values.filter((value): value is number => value !== null);
    return {
      monthIndex: point.monthIndex,
      amount: present.length === 0 ? null : present.reduce((sum, value) => sum + value, 0),
    };
  });
}

/**
 * The stack and the line of its total.
 *
 * The bands go WITHOUT the rounding a lone bar carries: which service is on top changes from column to
 * column, so a rounded segment would be a cap in the middle of a stack. And the line takes a shade of
 * INK and not a step of the palette, the rule the combo in PyG already follows: it is a reading of the
 * same figure the bands break down, not one more entity.
 */
function stackSeries(
  segments: readonly StackSegment[],
  axis: readonly MonthPoint[],
  withLine: boolean,
  fit: LabelFit,
  ground: ChartGround,
): ChartSeries[] {
  const tones = CHART_GROUND[ground];
  const bands = segments.map<ChartSeries>((segment) => ({
    id: segment.id,
    name: segment.name,
    type: "bar",
    stack: STACK_ID,
    data: segment.points.map((point) => point.amount),
    itemStyle: { color: groundColor(segment.color, ground) },
    barMaxWidth: CHART_MARK.barMaxWidth,
  }));
  if (!withLine) {
    // With no line there is a single column and a single band —several bands over one month spread
    // out into `serviceBars` instead— so the band IS the total, and it is what carries the figure.
    // Nothing changes for the reader: the amount is still written once, over the column.
    const last = bands.at(-1);
    return last ? [...bands.slice(0, -1), { ...last, ...totalLabel(fit, 0, ground) }] : bands;
  }
  return [
    ...bands,
    {
      id: "total",
      name: "Total",
      type: "line",
      data: axis.map((point) => point.amount),
      // In the ground's INK and not in a palette slot: it is not one more service of the stack.
      itemStyle: { color: tones.ink },
      lineStyle: { color: tones.ink, width: CHART_MARK.lineWidth },
      symbol: "circle",
      symbolSize: CHART_MARK.symbolSize,
      // Straight and not `smooth`: a curve invents values between two months nobody measured. And a
      // gap BREAKS the line, which is right: joining January with March would draw a February that
      // never arrived.
      smooth: false,
      // It is measured as ONE series and not as the ninth: it is the only one carrying a figure, so
      // what decides its shape is its own row over the columns and not the stack below.
      ...totalLabel(fit, 0, ground),
      // Above the bars, which is where it has to be read.
      z: 3,
    },
  ];
}

/** A segment's colour on its ground: on the stage, `stageColor`'s slot — the skyline's same
 *  translation, so a service is one colour in the stack and in the 3D box. */
function groundColor(color: string, ground: ChartGround): string {
  return ground === "stage" ? stageColor(color) : color;
}

/**
 * Single month breakdown: stack bands side by side on a service axis.
 *
 * Colors match `colorForEntity`, ensuring consistency across cards. Bars have rounded tops since
 * each is standalone. No line or absence mark is included as they are irrelevant here.
 */
function serviceBars(
  segments: readonly StackSegment[],
  fit: LabelFit,
  ground: ChartGround,
): ChartSeries[] {
  return [
    {
      id: "servicios",
      type: "bar",
      data: segments.map((segment) => ({
        value: segment.points[0]?.amount ?? null,
        itemStyle: { color: groundColor(segment.color, ground), borderRadius: ROUND_TOP },
      })),
      barMaxWidth: CHART_MARK.barMaxWidth,
      // Here the column IS the service, so its own amount is what the total label writes.
      ...totalLabel(fit, 0, ground),
    },
  ];
}

/**
 * A year's bar and its line — the comparative shape, and the one a year with no breakdown falls back
 * to. The TWO series share a `name`, which is why the legend dedupes: one item per year, and
 * switching it off takes its bar and its line at once.
 */
function yearSeries(
  entry: YearMonths,
  years: readonly number[],
  comparing: boolean,
  withLine: boolean,
  fit: LabelFit,
  row: number,
  ground: ChartGround,
): ChartSeries[] {
  // On the stage the year wears `stageColor`'s slot, the skyline's same rule: the light scale was
  // measured against white and two of its steps fall under 3:1 on the navy. The table twin, on the
  // white, keeps the light slot — the declared cost of `CHART_STAGE_PALETTE`.
  const color = groundColor(yearColor(entry.year, years), ground);
  const data = entry.points.map((point) => point.amount);
  const bar: ChartSeries = {
    id: `year-${entry.year}`,
    name: String(entry.year),
    type: "bar",
    data,
    itemStyle: { color, borderRadius: ROUND_TOP },
    barMaxWidth: comparing ? 18 : CHART_MARK.barMaxWidth,
    // Comparing several years, each one writes on its OWN row: that is what keeps 24 or 36 amounts
    // from disputing one strip, and what tells the reader whose figure is whose — they come down the
    // column in the legend's order.
    ...totalLabel(fit, comparing ? row : 0, ground),
  };
  if (!withLine) {
    return [bar];
  }
  return [
    bar,
    {
      id: `year-${entry.year}-linea`,
      name: String(entry.year),
      type: "line",
      data,
      itemStyle: { color },
      lineStyle: { color, width: CHART_MARK.lineWidth },
      symbol: "circle",
      symbolSize: CHART_MARK.symbolSize,
      smooth: false,
      z: 3,
    },
  ];
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
function absenceMarks(monthlyByYear: readonly YearMonths[], ground: ChartGround): ChartSeries[] {
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
        color: absentFill(ground),
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
  brokenDown: boolean,
  foldedServices: number,
  shape: EvolutionShape,
): string {
  const axisLength = monthlyByYear[0]?.points.length ?? 0;
  // What the shape on screen IS, said once — and it is not the same sentence for the two: the stack
  // adds up to the line above it, the skyline gives each service a row of its own. And what it
  // folded, if it folded anything: a band grouping three services otherwise reads as one more.
  const breakdown = !brokenDown
    ? ""
    : ` ${
        {
          skyline:
            "Cada fila del fondo es un servicio y cada una arranca en cero, así que su altura se compara mes a mes. Arrastra para girar la vista.",
          services:
            "Un solo mes en el eje: cada barra es un servicio de ese mes, no un mes. Marca otro mes y vuelven a ser columnas.",
          stacked: "Cada columna es el desglose por servicio del mes y la línea, su total.",
        }[shape]
      }${
        foldedServices === 0
          ? ""
          : ` ${pluralize(foldedServices, "servicio")} más quedan agrupados en «Otros»; la tabla los lista uno a uno.`
      }`;
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
        : `Sin huecos: ${what} del eje tienen su archivo cargado.`) +
      breakdown +
      pruned
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
  return `${head} Un mes que nunca llegó no es un mes en cero — la misma regla de cobertura de PyG.${breakdown}${pruned}`;
}

/** A table amount, with the DASH of «this period never arrived». */
function currencyOrDash(value: number | null): string {
  return value === null ? "–" : formatCurrency(value, { cents: true });
}

/** A table percentage, with the dash of «this question has no answer». */
function formatShare(share: number | null): string {
  return share === null ? "–" : formatPercent(share);
}
