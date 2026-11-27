/**
 * The screen's FIVE readings, described as DATA (`option` + `table`) and not as markup:
 * composition by service type, concentration by insurer, the article and salesperson rankings and
 * the evolution. Being data is what lets the printed report read the same construction as the
 * screen.
 *
 * Each card has TWO shapes and the number of marked years chooses it, never a control. The three
 * rankings go through ONE builder (`buildRankingCard`); what differs between them is a spec.
 * Everything is measured on the NETO.
 */
import {
  CHART_FONT,
  CHART_GROUND,
  CHART_INK,
  CHART_MARK,
  CHART_MAX_SERIES,
  CHART_NEUTRAL,
  CHART_RANKING_MAX,
  CHART_STAGE,
  CHART_STAGE_LIGHT,
  CHART_STAGE_MATERIAL,
  CHART_STAGE_SKY,
  CHART_TRAJECTORY_GROUND,
  colorForEntity,
  colorForRankingSlot,
  colorForSliceSlot,
  figureInk,
  stageColor,
  stageSliceColor,
  type ChartGround,
} from "@/lib/charts/palette";
/**
 * The flat bar cards open PLANO and the 3D is opted into, which is the opposite of the evolution's
 * default and for a reason that belongs to the shape: they draw horizontal rows, so a whole label
 * («EXAMENES DE LABORATORIO») and its figure sit beside every bar. Stood up on the stage the names
 * become a truncated axis and the figures move to the hover — a better picture and a poorer read,
 * so it is the reader who asks for it.
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
  ChartGuide,
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
  type SalesGroup,
  type SalesReading,
  type TypeMonthSeries,
} from "./derive";
import {
  GUIDE_SALES_ARTICLES,
  GUIDE_SALES_EVOLUTION,
  GUIDE_SALES_INSURERS,
  GUIDE_SALES_TYPE_DETAIL,
  GUIDE_SALES_TYPES,
  GUIDE_SALES_VENDORS,
} from "./guides";

/**
 * WHICH SCALE EACH CARD WEARS. Four cards colour their rows BY POSITION and the app has two
 * sequences long enough, so two pairs share one:
 *
 *   - composition by type · concentration by insurer → `CHART_SLICE_SEQUENCE`
 *   - articles · salespeople · a type's detail → `CHART_RANKING_SEQUENCE`
 *   - the YEAR, comparing → `CHART_PALETTE` (identity)
 *
 * The pairing keeps the one related pair of axes —tipo ↔ artículo— on different sequences. Both
 * are used inside the counts their own docstrings measured.
 */

/**
 * How many INSURERS the concentration card draws. Ten is what the firm reads in its own report and
 * what fits without the bars turning into a texture; the rest are not folded into an «Otros» bar
 * —it would be the longest in the chart and would cover precisely the concentration reading— but
 * are counted in the note and listed in full in the table twin.
 */
export const INSURER_SLICES = 10;

/** How many rows the article and salesperson rankings draw: the expense ranking's own cut. */
export const RANKING_SLICES = CHART_RANKING_MAX;

/**
 * How many rows a ranking's table lists in the PRINTED report before folding the tail into one row
 * with its sum, so the column still closes against the TOTAL. On screen the table does not cut.
 */
export const RANKING_TABLE_PRINT_LIMIT = 30;

const TYPES_HEIGHT = 420;
const RANKING_HEIGHT = 460;
const EVOLUTION_HEIGHT = 380;
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

/** Everything the five cards need, already aggregated: none of them walks loose lines. */
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
   * The marked year's months opened up BY SERVICE TYPE — what the evolution stacks. Empty or
   * absent, the evolution falls back to one bar per year, which is also what a year with no
   * coverage draws.
   *
   * It is only read with ONE year marked: stacking types and comparing years on the same axis asks
   * for grouped stacks and takes the colour away from the year, which is the only thing telling
   * those series apart. The year-on-year reading of one type is asked for by MARKING it.
   */
  typeMonthly?: readonly TypeMonthSeries[];
  /**
   * How the marks narrow the screen — «HUMANA», «2 de 14 tipos». It is composed ONCE
   * (`describeScope`) and only placed here, so no two cards name different slices.
   */
  scope?: string;
  /**
   * How many rows a ranking's table lists before folding the tail. `undefined` —the screen— lists
   * them ALL; the report passes `RANKING_TABLE_PRINT_LIMIT`. It is the ONLY thing in which the
   * paper and the screen part ways, and they part ways on purpose.
   */
  rankingTableLimit?: number;
}

/**
 * The two shapes the evolution can take when it is BROKEN DOWN by service type.
 *
 * `skyline` gives the type its own axis and `stacked` piles it into the month's column. It is a
 * genuine choice and not a decoration, which is why it is a control and not a consequence of the
 * data: the stack answers «how much did this month bill and out of what» in one glance, and the
 * skyline answers «where is each type heading» — the question the stack cannot answer, because only
 * its bottom band starts at zero.
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
   * Hides months with no billing on the evolution's axis. Months with no data (`null`) and at zero
   * are treated as empty columns.
   */
  hideEmptyMonths?: boolean;
  /** Which shape the broken-down evolution takes. Ignored when there is no breakdown to shape. */
  evolutionView?: EvolutionView;
  /** Which body «Composición por tipo de servicio» takes. Defaults to `plano` — see `SolidView`. */
  typesView?: SolidView;
  /** Which body «Concentración por seguro» takes. Defaults to `plano`. */
  insurersView?: SolidView;
}

export interface SalesCards {
  types: ChartCardSpec<ChartOption | Chart3DOption>;
  /** The ids of the types the composition draws, in row order — what turns a click on the n-th
   *  bar into «open THIS type» (`buildTypeDetailCard`). */
  typeOrder: string[];
  insurers: ChartCardSpec<ChartOption | Chart3DOption>;
  /** The card whose two shapes are two READINGS and not two bodies — see `EvolutionView`. */
  evolution: ChartCardSpec<ChartOption | Chart3DOption>;
  articles: ChartCardSpec<ChartOption | Chart3DOption>;
  /** `null` when nothing marked declares a salesperson: the card is then not drawn. */
  vendors: ChartCardSpec<ChartOption | Chart3DOption> | null;
  /**
   * How many columns of the axis move nothing. It is ALWAYS counted over the unpruned axis, which
   * is what keeps the button from vanishing just as it is pressed.
   */
  emptyMonths: number;
  /**
   * Whether choosing a shape means anything at all — decided HERE and not by the component, which
   * would have to reconstruct «is there a breakdown» out of the filters to guess it.
   */
  skylineAvailable: boolean;
}

export function buildSalesCards(
  input: SalesCardsInput,
  options: SalesCardsOptions = {},
): SalesCards {
  const evolution = buildEvolutionCard(input, options);
  return {
    types: buildTypesCard(input, options.typesView ?? SCREEN_SOLID_VIEW),
    typeOrder: movingTypes(input.reading).map((type) => type.id),
    insurers: buildInsurersCard(input, options.insurersView ?? SCREEN_SOLID_VIEW),
    evolution: evolution.card,
    articles: buildArticlesCard(input),
    vendors: buildVendorsCard(input),
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
 * The service types the composition DRAWS, in its order — the ONE list a type's colour comes from.
 *
 * An idle type goes and is counted: the catalogue declares fourteen whether or not they all have
 * movement, and an invisible bar buries the one that matters. It is judged over the AGGREGATE, so a
 * type that moved in any of the marked years stays.
 */
function movingTypes(reading: SalesReading): SalesGroup[] {
  return reading.types.filter((type) => type.amount !== 0);
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
 * evolution stands on the stage (`CHART_TRAJECTORY_GROUND`), and there the light chrome's greys are
 * invisible.
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
      // Without cents: an axis is the scale against which a bar's length is estimated, and six
      // labels of «$107,231.22» eat the drawing's width. The exact figure goes on the bar, in the
      // tooltip and in the table.
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

/** A year's colour: an identity slot by its stable position among the marked years. */
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

/** The figure written beside a bar: its amount and its share. */
function barFigure(amount: number, total: number): string {
  const share = shareOf(amount, total);
  const figure = formatCurrency(amount, { cents: true });
  return share === null ? figure : `${figure} · ${formatPercent(share)}`;
}

/** A table amount, with the DASH of «this period never arrived». */
function currencyOrDash(value: number | null): string {
  return value === null ? "–" : formatCurrency(value, { cents: true });
}

/** A table percentage, with the dash of «this question has no answer». */
function formatShare(share: number | null): string {
  return share === null ? "–" : formatPercent(share);
}

/** What one year billed in one group of one axis; `null` if that year did not touch it. */
function amountIn(
  byYear: readonly YearReading[],
  axis: (reading: SalesReading) => readonly SalesGroup[],
  year: number,
  id: string,
): number | null {
  return (
    axis(byYear.find((entry) => entry.year === year)?.reading ?? emptyReading()).find(
      (group) => group.id === id,
    )?.amount ?? null
  );
}

function emptyReading(): SalesReading {
  return {
    totals: { amount: 0, lineCount: 0, insurerCount: 0, averageLine: null },
    insurers: [],
    types: [],
    typeArticles: [],
    articles: [],
    vendors: [],
    unattributed: { amount: 0, lineCount: 0, share: null },
  };
}

// ---------------------------------------------------------------------------
// 1 · Composición por tipo de servicio
// ---------------------------------------------------------------------------

/**
 * The composition, level one: every service type, not a top-N. It wears `CHART_SLICE_SEQUENCE`
 * because fourteen types do not fit the eight identity slots.
 */
function buildTypesCard(
  input: SalesCardsInput,
  view: SolidView,
): ChartCardSpec<ChartOption | Chart3DOption> {
  const { reading, byYear, period } = input;
  const total = reading.totals.amount;
  const moving = movingTypes(reading);
  const idle = reading.types.length - moving.length;
  const years = byYear.map((entry) => entry.year);
  const comparing = years.length > 1;
  const colorOf = (index: number) => colorForSliceSlot(index);
  const amountOf = (year: number, id: string) => amountIn(byYear, (r) => r.types, year, id);

  const series: ChartSeries[] = comparing
    ? byYear.map((entry) => ({
        id: `year-${entry.year}`,
        name: String(entry.year),
        type: "bar" as const,
        data: moving.map((type) => amountOf(entry.year, type.id)),
        itemStyle: { color: yearColor(entry.year, years), borderRadius: ROUND_RIGHT },
        barMaxWidth: 18,
      }))
    : [
        {
          id: "tipos",
          type: "bar" as const,
          data: moving.map((type, index) => ({
            value: type.amount,
            itemStyle: { color: colorOf(index), borderRadius: ROUND_RIGHT },
          })),
          barMaxWidth: CHART_MARK.barMaxWidth,
          label: {
            show: true,
            position: "right" as const,
            distance: 6,
            color: CHART_INK.muted,
            fontSize: 11,
            formatter: (param: ChartParam) => barFigure(Number(param.value), total),
          },
          labelLayout: { hideOverlap: true },
        },
      ];

  const legend = yearLegend(years.length);
  const solid: Chart3DOption | null =
    moving.length === 0
      ? null
      : solidBarsOption({
          columns: moving.map((type) => type.label),
          rows: comparing
            ? byYear.map((entry) => ({
                id: `year-${entry.year}`,
                name: String(entry.year),
                // A year is identity: `stageColor`, not the rows' slice translation.
                color: stageColor(yearColor(entry.year, years)),
                values: moving.map((type) => amountOf(entry.year, type.id)),
              }))
            : [
                {
                  id: "tipos",
                  name: "Venta",
                  color: stageSliceColor(colorOf(0)),
                  values: moving.map((type) => type.amount),
                },
              ],
          ...(comparing
            ? {}
            : { colors: moving.map((_type, index) => stageSliceColor(colorOf(index))) }),
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
          // HORIZONTAL bars: the labels are whole type names («EXAMENES DE LABORATORIO»), which do
          // not fit under a column, and the breakdown already arrives ordered largest to smallest,
          // so the length of each aligned row says its weight at a glance.
          xAxis: valueAxis(),
          yAxis: categoryAxis(
            moving.map((type) => type.label),
            { inverse: true },
          ),
          tooltip: comparing
            ? axisTooltip((value) => formatCurrency(value, { cents: true }))
            : itemTooltip((param) => {
                const type = moving[param.dataIndex];
                const share = shareOf(type.amount, total);
                return [
                  `<div style="font-weight:600;margin-bottom:4px">${type.label}</div>`,
                  `<div>${formatCurrency(type.amount, { cents: true })}</div>`,
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
          ...moving.map<ChartTableRow>((type) => ({
            id: type.id,
            label: type.label,
            values: [
              ...years.map((year) => currencyOrDash(amountOf(year, type.id))),
              formatCurrency(type.amount, { cents: true }),
              formatShare(shareOf(type.amount, total)),
            ],
          })),
          totalRow(years, byYear, total),
        ],
      }
    : {
        columns: ["Venta", "% del periodo", "Líneas"],
        rows: [
          ...moving.map<ChartTableRow>((type, index) => ({
            id: type.id,
            label: type.label,
            color: colorOf(index),
            values: [
              formatCurrency(type.amount, { cents: true }),
              formatShare(shareOf(type.amount, total)),
              formatNumber(type.lineCount),
            ],
          })),
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
  const note = typesNote(total, idle, comparing);
  return {
    id: "sales-types",
    title: "Composición por tipo de servicio",
    subtitle: `${input.scope ?? pluralize(moving.length, "tipo")} · ${period}`,
    option: asSolid ? solid : option,
    table,
    // The solid body adds the one thing no control announces: the camera turns.
    note: asSolid ? `${note} Arrastra para girar la vista.` : note,
    guide: GUIDE_SALES_TYPES,
    height: asSolid ? SOLID_BARS_HEIGHT : TYPES_HEIGHT,
  };
}

function typesNote(total: number, idle: number, comparing: boolean): string {
  // The denominator IS NAMED, with its figure: a percentage that does not say what it is measured
  // against forces deducing it from the title, and that is the computation nobody does and
  // everybody assumes.
  const base = comparing
    ? `Una barra por año y tipo de servicio. Los porcentajes de la tabla son la parte del periodo entero (${formatCurrency(total, { cents: true })}), sumados los años.`
    : `Los porcentajes son la parte de la venta del periodo (${formatCurrency(total, { cents: true })}) que representa cada tipo de servicio.`;
  return idle === 0
    ? base
    : `${base} ${pluralize(idle, "tipo")} no se movió en el periodo y no se dibuja.`;
}

function totalRow(
  years: readonly number[],
  byYear: readonly YearReading[],
  total: number,
): ChartTableRow {
  return {
    id: "total",
    label: "TOTAL",
    emphasis: true,
    values: [
      ...years.map((year) =>
        currencyOrDash(byYear.find((entry) => entry.year === year)?.reading.totals.amount ?? null),
      ),
      formatCurrency(total, { cents: true }),
      formatShare(total === 0 ? null : 100),
    ],
  };
}

// ---------------------------------------------------------------------------
// 2 · Los tres RANKINGS — seguros, artículos, vendedores
// ---------------------------------------------------------------------------

/** What tells one ranking from another; everything else is shared by `buildRankingCard`. */
interface RankingSpec {
  id: string;
  title: string;
  /** Singular and plural, for the note and the subtitle. */
  noun: [string, string];
  /** The aggregate ranking, largest first. */
  groups: readonly SalesGroup[];
  /** The same axis inside one year's reading. */
  axis: (reading: SalesReading) => readonly SalesGroup[];
  /** How many bars are drawn. */
  slices: number;
  /** A drawn row's colour, by its PLACE in the ranking. */
  color: (index: number) => string;
  /** The same colour translated onto the stage. */
  stage: (color: string) => string;
  guide: ChartGuide;
  /** Appended to the note. It is where the salesperson card declares what it cannot measure. */
  tail?: string;
  /** The label of the «how many lines» column. */
  countLabel: string;
  height?: number;
  /** What the shares are measured against; absent, the whole period. A type's detail measures
   *  against its type. */
  base?: {
    amount: number;
    lineCount: number;
    name: string;
    byYear: (year: number) => number | null;
  };
}

function buildRankingCard(
  input: SalesCardsInput,
  spec: RankingSpec,
  view: SolidView = "plano",
): ChartCardSpec<ChartOption | Chart3DOption> {
  const { reading, byYear, rankingTableLimit } = input;
  // The denominator of every share on this card.
  const total = spec.base?.amount ?? reading.totals.amount;
  const baseName = spec.base?.name ?? "la venta del periodo";
  const years = byYear.map((entry) => entry.year);
  const comparing = years.length > 1;
  // The largest ones are chosen over the AGGREGATE, not over one year: if the cast changed with the
  // marks, the card could not be compared with itself, and a row would stop meaning the same thing
  // across the series.
  const drawn = spec.groups.slice(0, spec.slices);
  const rest = spec.groups.slice(spec.slices);
  const restAmount = rest.reduce((sum, group) => sum + group.amount, 0);
  const drawnAmount = drawn.reduce((sum, group) => sum + group.amount, 0);
  const amountOf = (year: number, id: string) => amountIn(byYear, spec.axis, year, id);

  const series: ChartSeries[] = comparing
    ? byYear.map((entry) => ({
        id: `year-${entry.year}`,
        name: String(entry.year),
        type: "bar" as const,
        data: drawn.map((group) => amountOf(entry.year, group.id)),
        itemStyle: { color: yearColor(entry.year, years), borderRadius: ROUND_RIGHT },
        barMaxWidth: 12,
      }))
    : [
        {
          id: spec.id,
          type: "bar" as const,
          data: drawn.map((group, index) => ({
            value: group.amount,
            itemStyle: { color: spec.color(index), borderRadius: ROUND_RIGHT },
          })),
          barMaxWidth: 22,
          label: {
            show: true,
            position: "right" as const,
            distance: 6,
            color: CHART_INK.muted,
            fontSize: 11,
            formatter: (param: ChartParam) => barFigure(Number(param.value), total),
          },
          labelLayout: { hideOverlap: true },
        },
      ];

  const legend = yearLegend(years.length);
  const solid: Chart3DOption | null =
    drawn.length === 0
      ? null
      : solidBarsOption({
          columns: drawn.map((group) => group.label),
          rows: comparing
            ? byYear.map((entry) => ({
                id: `year-${entry.year}`,
                name: String(entry.year),
                // A year is identity: `stageColor`, never `spec.stage`.
                color: stageColor(yearColor(entry.year, years)),
                values: drawn.map((group) => amountOf(entry.year, group.id)),
              }))
            : [
                {
                  id: spec.id,
                  name: "Venta",
                  color: spec.stage(spec.color(0)),
                  values: drawn.map((group) => group.amount),
                },
              ],
          ...(comparing
            ? {}
            : { colors: drawn.map((_group, index) => spec.stage(spec.color(index))) }),
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
            drawn.map((group) => group.label),
            { inverse: true },
          ),
          tooltip: comparing
            ? axisTooltip((value) => formatCurrency(value, { cents: true }))
            : itemTooltip((param) => {
                const group = drawn[param.dataIndex];
                const share = shareOf(group.amount, total);
                return [
                  `<div style="font-weight:600;margin-bottom:4px">${group.label}</div>`,
                  `<div>${formatCurrency(group.amount, { cents: true })}</div>`,
                  share === null
                    ? ""
                    : `<div style="color:${CHART_INK.muted}">${formatPercent(share)} de ${baseName}</div>`,
                ].join("");
              }),
          series,
        };

  // On screen the table does NOT cut: it is the place where a value that was not drawn keeps its
  // figure. On paper the tail is folded, with its sum, so the column still closes against the TOTAL.
  const listed =
    rankingTableLimit === undefined ? spec.groups : spec.groups.slice(0, rankingTableLimit);
  const folded = rankingTableLimit === undefined ? [] : spec.groups.slice(rankingTableLimit);

  const table: ChartTable = comparing
    ? {
        columns: [...years.map(String), "Total", spec.base ? "% del tipo" : "% del periodo"],
        rows: [
          ...listed.map<ChartTableRow>((group, index) => ({
            id: `${spec.id}-${index}`,
            label: group.label,
            values: [
              ...years.map((year) => currencyOrDash(amountOf(year, group.id))),
              formatCurrency(group.amount, { cents: true }),
              formatShare(shareOf(group.amount, total)),
            ],
          })),
          ...foldedRow(spec, folded, total, years, byYear),
          spec.base
            ? {
                id: "total",
                label: "TOTAL",
                emphasis: true,
                values: [
                  ...years.map((year) => currencyOrDash(spec.base?.byYear(year) ?? null)),
                  formatCurrency(total, { cents: true }),
                  formatShare(total === 0 ? null : 100),
                ],
              }
            : totalRow(years, byYear, total),
        ],
      }
    : {
        columns: ["Venta", spec.base ? "% del tipo" : "% del periodo", spec.countLabel],
        rows: [
          ...listed.map<ChartTableRow>((group, index) => ({
            // The id is the POSITION and never the name: it is React's key, and a label is neither
            // unique nor stable enough to key a row by.
            id: `${spec.id}-${index}`,
            label: group.label,
            // Only the drawn ones carry a dot: one on a row that is not in the chart promises a bar
            // the reader will not find.
            color: index < spec.slices ? spec.color(index) : undefined,
            values: [
              formatCurrency(group.amount, { cents: true }),
              formatShare(shareOf(group.amount, total)),
              formatNumber(group.lineCount),
            ],
          })),
          ...foldedRow(spec, folded, total, [], byYear),
          {
            id: "total",
            label: "TOTAL",
            emphasis: true,
            values: [
              formatCurrency(total, { cents: true }),
              formatShare(total === 0 ? null : 100),
              formatNumber(spec.base?.lineCount ?? reading.totals.lineCount),
            ],
          },
        ],
      };

  const asSolid = view === "solido" && solid !== null;
  const note = rankingNote(spec, {
    drawn: drawn.length,
    drawnAmount,
    restCount: rest.length,
    restAmount,
    total,
    foldedCount: folded.length,
    comparing,
  });
  return {
    id: spec.id,
    title: spec.title,
    subtitle: subtitleFor(spec, drawn.length, spec.groups.length, scopedPeriod(input)),
    option: asSolid ? solid : option,
    table,
    note: asSolid ? `${note} Arrastra para girar la vista.` : note,
    guide: spec.guide,
    height: asSolid ? SOLID_BARS_HEIGHT : (spec.height ?? RANKING_HEIGHT),
  };
}

function subtitleFor(spec: RankingSpec, drawn: number, all: number, period: string): string {
  return drawn >= all
    ? `${pluralize(all, spec.noun[0], spec.noun[1])} · ${period}`
    : `Los ${drawn} mayores de ${formatNumber(all)} · ${period}`;
}

/**
 * The concentration stated IN ONE FIGURE —what part of the period the drawn ones are—, because it
 * is a ranking's whole reading and estimating it by adding fifteen bars by eye is not something
 * anyone does.
 */
function rankingNote(
  spec: RankingSpec,
  figures: {
    drawn: number;
    drawnAmount: number;
    restCount: number;
    restAmount: number;
    total: number;
    foldedCount: number;
    comparing: boolean;
  },
): string {
  const share = shareOf(figures.drawnAmount, figures.total);
  const baseName = spec.base?.name ?? "la venta del periodo";
  const head =
    share === null
      ? `Estos ${figures.drawn} son ${baseName}.`
      : `Estos ${figures.drawn} son el ${formatPercent(share)} de ${baseName}.`;
  const rest =
    figures.restCount === 0
      ? ""
      : `Los ${formatNumber(figures.restCount)} restantes suman ${formatCurrency(figures.restAmount, { cents: true })}. `;
  // What the TABLE does with those remaining ones is said here and not taken for granted: it is the
  // difference between the screen and the paper, and a note promising the complete list in a report
  // that folds it would be the only thing on the card that cannot be checked by looking at it.
  const where =
    figures.foldedCount === 0
      ? "La tabla los lista uno a uno."
      : `La tabla lista los mayores y agrupa a los ${formatNumber(figures.foldedCount)} últimos en una fila, que sigue sumando en el total.`;
  // Which ones are drawn is decided over the AGGREGATE, and with several years that is not obvious:
  // without this line, one that was a year's largest and does not appear reads as a missing datum.
  const ranking = figures.comparing
    ? " Los mayores se eligen por el total del periodo, no por un año, para que el elenco no cambie al mover las marcas."
    : "";
  return `${head} ${rest}${where}${ranking}${spec.tail ? ` ${spec.tail}` : ""}`;
}

/**
 * The tail folded into ONE row, or none. It carries its own sum so the column still closes against
 * the TOTAL, and it says HOW MUCH the largest of the ones it groups was: it is the question a
 * folded row raises —«what am I missing?»— and answering it is what makes it acceptable.
 */
function foldedRow(
  spec: RankingSpec,
  folded: readonly SalesGroup[],
  total: number,
  years: readonly number[],
  byYear: readonly YearReading[],
): ChartTableRow[] {
  if (folded.length === 0) {
    return [];
  }
  const ids = new Set(folded.map((group) => group.id));
  const amount = folded.reduce((sum, group) => sum + group.amount, 0);
  const lines = folded.reduce((sum, group) => sum + group.lineCount, 0);
  const largest = Math.max(...folded.map((group) => group.amount));
  const perYear = years.map((year) => {
    const groups = spec.axis(
      byYear.find((entry) => entry.year === year)?.reading ?? emptyReading(),
    );
    const sum = groups
      .filter((group) => ids.has(group.id))
      .reduce((acc, group) => acc + group.amount, 0);
    return currencyOrDash(sum === 0 ? null : sum);
  });
  return [
    {
      id: "otros",
      label: `Otros ${spec.noun[1]}`,
      sublabel: `${pluralize(folded.length, spec.noun[0], spec.noun[1])} · ninguno supera ${formatCurrency(largest, { cents: true })}`,
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

/** 2a · Concentration by insurer. */
function buildInsurersCard(
  input: SalesCardsInput,
  view: SolidView,
): ChartCardSpec<ChartOption | Chart3DOption> {
  return buildRankingCard(
    input,
    {
      id: "sales-insurers",
      title: "Concentración por seguro",
      noun: ["seguro", "seguros"],
      groups: input.reading.insurers,
      axis: (reading) => reading.insurers,
      slices: INSURER_SLICES,
      color: colorForSliceSlot,
      stage: stageSliceColor,
      guide: GUIDE_SALES_INSURERS,
      countLabel: "Líneas",
    },
    view,
  );
}

/** 2b · The article ranking, over whatever is marked. */
function buildArticlesCard(input: SalesCardsInput): ChartCardSpec<ChartOption | Chart3DOption> {
  return buildRankingCard(input, {
    id: "sales-articles",
    title: "Artículos más vendidos",
    noun: ["artículo", "artículos"],
    groups: input.reading.articles,
    axis: (reading) => reading.articles,
    slices: RANKING_SLICES,
    color: colorForRankingSlot,
    stage: stageColor,
    guide: GUIDE_SALES_ARTICLES,
    countLabel: "Líneas",
    height: 520,
  });
}

/**
 * LEVEL TWO of the composition: one service type opened into its articles, with the shares
 * measured against THE TYPE. The screen swaps it into the composition's slot when a bar is
 * pressed; it is one card's control and narrows nothing else.
 *
 * `null` when the type is not in the reading any more — the screen is then back on level one.
 */
export function buildTypeDetailCard(
  input: SalesCardsInput,
  typeId: string,
): ChartCardSpec<ChartOption | Chart3DOption> | null {
  const articlesOf = (reading: SalesReading) =>
    reading.typeArticles.find((type) => type.id === typeId);
  const type = articlesOf(input.reading);
  if (!type || type.amount === 0) {
    return null;
  }
  return buildRankingCard(input, {
    id: "sales-type-detail",
    title: `Artículos de ${type.label}`,
    noun: ["artículo", "artículos"],
    groups: type.articles,
    axis: (reading) => articlesOf(reading)?.articles ?? [],
    slices: RANKING_SLICES,
    color: colorForRankingSlot,
    stage: stageColor,
    guide: GUIDE_SALES_TYPE_DETAIL,
    countLabel: "Líneas",
    height: 520,
    base: {
      amount: type.amount,
      lineCount: type.lineCount,
      name: `la venta de ${type.label}`,
      byYear: (year) =>
        articlesOf(input.byYear.find((entry) => entry.year === year)?.reading ?? emptyReading())
          ?.amount ?? null,
    },
  });
}

/**
 * 2c · The salesperson ranking. Most of the real file's net carries NO salesperson: those lines
 * are neither drawn as a bar nor dropped in silence — the note states their amount and share.
 * `null` when nothing marked declares one.
 */
function buildVendorsCard(
  input: SalesCardsInput,
): ChartCardSpec<ChartOption | Chart3DOption> | null {
  const { vendors, unattributed } = input.reading;
  if (vendors.length === 0) {
    return null;
  }
  const tail =
    unattributed.amount === 0
      ? undefined
      : `${formatCurrency(unattributed.amount, { cents: true })}` +
        `${unattributed.share === null ? "" : ` (${formatPercent(unattributed.share)} del periodo)`}` +
        ` no trae vendedor en el archivo y no entra en este ranking.`;
  return buildRankingCard(input, {
    id: "sales-vendors",
    title: "Venta por vendedor",
    noun: ["vendedor", "vendedores"],
    groups: vendors,
    axis: (reading) => reading.vendors,
    slices: RANKING_SLICES,
    color: colorForRankingSlot,
    stage: stageColor,
    guide: GUIDE_SALES_VENDORS,
    countLabel: "Líneas",
    tail,
    height: 520,
  });
}

// ---------------------------------------------------------------------------
// 3 · Evolución
// ---------------------------------------------------------------------------

/** Every bar of this card lives in ONE stack, absence marks included: that is what makes a column a
 *  column. */
const STACK_ID = "mes";

/** Bands the stack draws before folding its tail — a limit of reading. The table does not fold. */
const STACK_SLICES = CHART_MAX_SERIES;

/**
 * WHAT the card ended up drawing, which is the one thing its note cannot guess: the three shapes
 * read the same `segments` and say three different things about them.
 */
type EvolutionShape = "stacked" | "skyline" | "types";

/**
 * The figure written over a bar of this card — the one composition of it, so the stack, the year
 * and the type axis cannot end up writing their amount three different ways.
 *
 * It is always the COLUMN's total and it is always written: `lib/charts/label-fit` answers a
 * cramped axis with a smaller body and, past twenty columns, with the cents —which the tooltip and
 * the table twin keep— instead of with silence.
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

/** One band of the stack: a service type, or the «Otros» its tail folds into. */
interface StackSegment {
  id: string;
  name: string;
  color: string;
  points: MonthPoint[];
}

/**
 * 3 · Evolution — billing month by month and what each month is made of.
 *
 * **With ONE year**, the column shows the BREAKDOWN by service type, in two shapes
 * (`EvolutionView`): `skyline`, where each type has its own AXIS starting at zero so it can be
 * followed month to month, and `stacked`, where the month's total is broken down in place.
 *
 * **With ONE month**, the stack spreads into one bar per TYPE.
 *
 * **With SEVERAL years**, one series per year and no stack: the colour belongs to the year, which
 * is the only thing telling those series apart.
 */
function buildEvolutionCard(
  input: SalesCardsInput,
  { hideEmptyMonths = false, evolutionView = "stacked" }: SalesCardsOptions = {},
): { card: ChartCardSpec<ChartOption | Chart3DOption>; skylineAvailable: boolean } {
  const { monthlyByYear: full, reading, typeMonthly = [] } = input;
  const hidden = hideEmptyMonths ? emptyMonths(full) : [];
  const kept = (points: readonly MonthPoint[]): MonthPoint[] =>
    points.filter((point) => !hidden.includes(point.monthIndex));
  const monthlyByYear: YearMonths[] = full.map((entry) => ({
    year: entry.year,
    points: kept(entry.points),
  }));
  const years = monthlyByYear.map((entry) => entry.year);
  const comparing = years.length > 1;
  // The axis comes from the POINTS and not from the twelve months: when «Mes» narrows, the card
  // draws what is marked, and the subtitle and the columns say the same thing.
  const axis = monthlyByYear[0]?.points ?? [];
  const labels = axis.map((point) => MONTHS_SHORT_ES[point.monthIndex]);
  const covered = monthlyByYear.flatMap((entry) =>
    entry.points.filter((point) => point.amount !== null),
  );

  // **Bars WITH a line above**: the bar says how much —which is what is compared against the one of
  // the year next to it, and what the stack breaks down— and the line says which way.
  const withLine = labels.length > 1;

  // **The card stands on the STAGE** in every flat shape — one year or several, the stack, the
  // spread of one month: a thin stroke over a white plot has nothing but its hue to be found by,
  // and a ground that came and went with the marks read as a different card.
  const ground: ChartGround = CHART_TRAJECTORY_GROUND;

  // The colour of a type comes from the SAME list the composition card orders by, so the two cards
  // on the screen cannot paint one type two ways.
  const order = movingTypes(reading).map((type) => type.id);
  const opened = comparing
    ? []
    : typeMonthly.map((entry) => ({ ...entry, points: kept(entry.points) }));
  const ranked = [...opened].sort((a, b) => rankOf(a.id, order) - rankOf(b.id, order));
  const segments = stackSegments(ranked, order);
  const foldedTypes = Math.max(ranked.length - STACK_SLICES, 0);
  const stacked = segments.length > 0;

  // A single column: the stack has nothing to be a stack OF, and the axis is spending its width
  // repeating the month the subtitle already names.
  const spread = segments.length > 1 && axis.length === 1;
  const skylineAvailable = stacked && axis.length > 1;
  const skyline = skylineAvailable && evolutionView === "skyline";
  const shape: EvolutionShape = spread ? "types" : skyline ? "skyline" : "stacked";

  // Spread over the types, the legend would list exactly what the axis already labels.
  const legend = spread
    ? legendFor(false)
    : stacked
      ? legendFor(
          true,
          segments.map((segment) => segment.name),
          CHART_GROUND[ground].inkMuted,
        )
      : yearLegend(years.length, ground);

  const labelFit = fitDirectLabel(spread ? segments.length : axis.length);
  const labelRows = spread || stacked ? 1 : monthlyByYear.length;

  const series: ChartSeries[] = spread
    ? typeBars(segments, labelFit, ground)
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
              // The room the top row of figures asks for; `outerBoundsContain` only reserves for
              // the axis' labels, so without this the amount over the tallest column is cropped.
              top: labelHeadroom(labelRows, labelFit, 24),
              bottom: legend.show ? 28 : 8,
              outerBoundsMode: "same",
              outerBoundsContain: "axisLabel",
            },
            legend,
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
            // types — and with a single column that never arrived there is no option to draw at all.
            series: spread ? series : [...series, ...absenceMarks(monthlyByYear, ground)],
          };

  const table: ChartTable = stacked
    ? {
        columns: labels,
        rows: [
          ...ranked.map<ChartTableRow>((entry, index) => ({
            id: `tipo-${entry.id}`,
            label: entry.label,
            // Only what is DRAWN carries a dot: one on a folded row would promise a band the reader
            // cannot find in the chart.
            ...(index < STACK_SLICES ? { color: colorForSliceSlot(rankOf(entry.id, order)) } : {}),
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
          // The DASH, not a blank cell nor a `$0.00`: it is what says «this month never arrived»,
          // as against the zero a loaded month does assert.
          values: entry.points.map((point) => currencyOrDash(point.amount)),
        })),
      };

  return {
    skylineAvailable,
    card: {
      id: "sales-evolution",
      title: "Evolución mensual de la venta",
      subtitle: `${evolutionBasis(comparing, segments.length > 1, shape)} · ${scopedPeriod(input)}`,
      option,
      table,
      note: evolutionNote(
        monthlyByYear,
        comparing,
        hidden.length,
        segments.length > 1,
        foldedTypes,
        shape,
      ),
      guide: GUIDE_SALES_EVOLUTION,
      // The 3D box needs the room its perspective costs: at the flat card's height the far row of
      // months lands on top of the legend.
      height: skyline ? SKYLINE_HEIGHT : EVOLUTION_HEIGHT,
    },
  };
}

/** What each month is read against, for the card's subtitle. */
function evolutionBasis(comparing: boolean, brokenDown: boolean, shape: EvolutionShape): string {
  if (comparing) {
    return "Venta neta de cada mes, un año contra otro";
  }
  if (!brokenDown) {
    return "Venta neta de cada mes";
  }
  return shape === "types"
    ? "Venta neta del mes, por tipo de servicio"
    : "Venta neta de cada mes, desglosada por tipo de servicio";
}

/**
 * The `skyline` shape: the SAME bands of the stack, each given its own row of the depth axis.
 *
 * What the third axis buys, and the only reason it is here: every type now rests on zero. Piled up,
 * only the bottom band does, and the ones above it sit on a floor that moves with the months — so a
 * band's height is comparable against the band beside it and against nothing else, least of all
 * against itself in another month, which is precisely what an EVOLUTION is read for.
 *
 * Three decisions keep it a reading and not an effect:
 *
 * - **One rig, and it is what draws the EDGE.** Flat shading left the rows reading as a single
 *   continuous surface: with no light every face returns the same pixel, and `bar3D` has no border
 *   to fall back on. `CHART_STAGE_LIGHT` models the solid without repainting it.
 * - **A month that never arrived produces NO datum**, so the floor is empty there; a loaded month
 *   that sold nothing gets `minHeight`, a tile flat on the floor. It is the only place this module
 *   can DRAW the difference the whole engine carries.
 * - **A long box against a shallow one.** Twelve months across and few types deep is what makes a
 *   horizon; a cube of equal sides is where the back row hides behind the front one.
 */
function skylineOption(
  segments: readonly StackSegment[],
  labels: readonly string[],
): Chart3DOption {
  // **La serie MAYOR va al fondo**, que es lo único que hace legible una matriz de barras en
  // perspectiva: una barra tapa a las que tiene detrás, así que con la mayor delante —el orden del
  // desglose, que es de mayor a menor— el tipo más grande esconde entero todo lo demás. Invertida,
  // una barra corta nunca llega a tapar a la que tiene detrás. El orden del COLOR y el de la
  // leyenda no se tocan.
  const depthOf = (index: number) => segments.length - 1 - index;
  const types = segments.map((segment) => segment.name);

  const boxWidth = clamp(labels.length * 19, 120, 235);
  const boxDepth = clamp(types.length * 17, 34, 95);
  // Una barra ocupa POCO MÁS DE LA MITAD de su casilla, y lo que deja es lo que separa una fila de
  // la de al lado: lo que se ve entre dos barras no es el hueco, es su proyección, y la cara
  // lateral de la de delante se la come casi entera.
  const barSize: [number, number] = [
    (boxWidth / Math.max(labels.length, 1)) * 0.52,
    (boxDepth / Math.max(types.length, 1)) * 0.52,
  ];
  const series: Chart3DSeries[] = segments.map((segment, index) => ({
    type: "bar3D",
    id: segment.id,
    name: segment.name,
    shading: "realistic",
    realisticMaterial: CHART_STAGE_MATERIAL,
    itemStyle: { color: stageSliceColor(segment.color) },
    bevelSize: 0.2,
    bevelSmoothness: 2,
    // A real zero still gets a tile: it is a figure the file asserted, and it has to be tellable
    // apart from the empty floor of a month that never arrived.
    minHeight: 1.2,
    barSize,
    emphasis: {
      // NO `itemStyle` here, and that is the fix and not an omission: a `bar3D` is one merged mesh
      // with vertex colours, so gl reads only `color`/`opacity` and silently ignores a border.
      // `echarts-gl` writes the RAW datum on the hovered bar unless told otherwise, so the amount
      // goes through the same formatter as every other one in the app.
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
    // On the stage the legend goes to the TOP: the camera looks DOWN at the box, so the reading
    // hangs low in the frame and the empty sky is above it.
    legend: { ...legendFor(true, types, CHART_STAGE.inkMuted), bottom: "auto", top: 6 },
    grid3D: {
      boxWidth,
      boxDepth,
      boxHeight: 82,
      // THE STAGE. `gl`'s own default is a pale gradient, and on it a bar had nothing but its own
      // fill to be found by: the short ones washed out and the tall ones read as holes in the card.
      environment: CHART_STAGE_SKY,
      light: CHART_STAGE_LIGHT,
      axisLine: { lineStyle: { color: CHART_STAGE.axis, width: 1, type: "solid" } },
      splitLine: { lineStyle: { color: CHART_STAGE.grid, width: 1, type: "solid" } },
      axisPointer: { show: false },
      viewControl: {
        // It opens STILL, from above and slightly off to one side. Below the mid thirties the front
        // face of a bar covers the gap that separates its row from the next; well above it the
        // drawing turns into a plan and the heights stop being heights.
        alpha: 38,
        beta: 12,
        distance: 196,
        minDistance: 130,
        maxDistance: 330,
        // Panning is off: the box is the whole reading, and dragging it out of frame has no way
        // back short of reloading. Rotating and zooming stay.
        panSensitivity: 0,
        rotateSensitivity: 1,
        zoomSensitivity: 1,
        damping: 0.85,
        animation: false,
      },
    },
    xAxis3D: categoryAxis3D([...labels]),
    yAxis3D: categoryAxis3D([...types].reverse(), { truncate: 16 }),
    zAxis3D: {
      type: "value",
      name: "",
      axisLine: { lineStyle: { color: CHART_STAGE.axis, width: 1, type: "solid" } },
      splitLine: { show: true, lineStyle: { color: CHART_STAGE.grid, width: 1, type: "solid" } },
      axisLabel: {
        color: CHART_STAGE.inkFaint,
        fontSize: 10.5,
        formatter: (value) => formatCurrency(Number(value)),
      },
    },
    tooltip: {
      trigger: "item",
      backgroundColor: CHART_STAGE.panel,
      borderColor: CHART_STAGE.panelBorder,
      borderWidth: 1,
      padding: [8, 10],
      textStyle: { color: CHART_STAGE.ink, fontSize: 12 },
      confine: true,
      formatter: (param: Chart3DParam) => {
        // The month comes from the datum's own X INDEX and not from `param.name`: in a 3D chart
        // that field carries the series, and the reader hovering a bar is asking which month it is.
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
    // no significan nada para quien lee meses y tipos: el vacío EXPLÍCITO es lo que las quita.
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

/** A type's place in the composition's order. One it does not declare —netted to zero over the
 *  period— goes last instead of stealing a slot. */
function rankOf(id: string, order: readonly string[]): number {
  const slot = order.indexOf(id);
  return slot < 0 ? order.length : slot;
}

/** The stack's bands: the types the reader can follow, and the tail folded into one «Otros».
 *  Folding is not truncating — the sum stays, and the table twin still lists them one by one. */
function stackSegments(
  ranked: readonly TypeMonthSeries[],
  order: readonly string[],
): StackSegment[] {
  const drawn = ranked.slice(0, STACK_SLICES).map<StackSegment>((entry) => ({
    id: `tipo-${entry.id}`,
    name: entry.label,
    color: colorForSliceSlot(rankOf(entry.id, order)),
    points: entry.points,
  }));
  const rest = ranked.slice(STACK_SLICES);
  if (rest.length === 0) {
    return drawn;
  }
  return [
    ...drawn,
    {
      id: "tipo-otros",
      name: "Otros",
      // Not a slot of the scale: it is what is left over, and `CHART_NEUTRAL` is how this app says
      // so.
      color: CHART_NEUTRAL,
      points: sumPoints(rest.map((entry) => entry.points)),
    },
  ];
}

/** The tail added up, column by column, WITHOUT turning a gap into a zero: a month nobody loaded is
 *  `null` in every type, so it stays `null` in their sum. */
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
 * The bands go WITHOUT the rounding a lone bar carries: which type is on top changes from column to
 * column, so a rounded segment would be a cap in the middle of a stack. And the line takes a shade
 * of INK and not a step of the palette, the rule the combo in PyG already follows: it is a reading
 * of the same figure the bands break down, not one more entity.
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
    // out into `typeBars` instead— so the band IS the total, and it is what carries the figure.
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
      // In the ground's INK and not in a palette slot: it is not one more type of the stack.
      itemStyle: { color: tones.ink },
      lineStyle: { color: tones.ink, width: CHART_MARK.lineWidth },
      symbol: "circle",
      symbolSize: CHART_MARK.symbolSize,
      // Straight and not `smooth`: a curve invents values between two months nobody measured. And a
      // gap BREAKS the line, which is right: joining January with March would draw a February that
      // never arrived.
      smooth: false,
      ...totalLabel(fit, 0, ground),
      // Above the bars, which is where it has to be read.
      z: 3,
    },
  ];
}

/** A segment's colour on its ground: on the stage, the slice slot's own translation, so a type is
 *  one colour in the stack and in the 3D box. */
function groundColor(color: string, ground: ChartGround): string {
  return ground === "stage" ? stageSliceColor(color) : color;
}

/**
 * Single month broken down: the stack's bands side by side on an axis of TYPES.
 *
 * Colours are the composition's, so a type is one hue across the screen. Bars are rounded on top
 * since each stands alone, and neither the line nor the absence mark applies: there is one column
 * per type and no month to be missing.
 */
function typeBars(
  segments: readonly StackSegment[],
  fit: LabelFit,
  ground: ChartGround,
): ChartSeries[] {
  return [
    {
      id: "tipos",
      type: "bar",
      data: segments.map((segment) => ({
        value: segment.points[0]?.amount ?? null,
        itemStyle: { color: groundColor(segment.color, ground), borderRadius: ROUND_TOP },
      })),
      barMaxWidth: CHART_MARK.barMaxWidth,
      // Here the column IS the type, so its own amount is what the total label writes.
      ...totalLabel(fit, 0, ground),
    },
  ];
}

/**
 * A year's bar and its line — the comparative shape, and the one a year with no breakdown falls
 * back to. The TWO series share a `name`, which is why the legend dedupes: one item per year, and
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
    // from disputing one strip, and what tells the reader whose figure is whose.
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
 * distinction the whole module rests on would disappear precisely in the card that exists to show
 * it. It goes `silent` (out of hover and of emphasis) because its height is NOT a datum: it is a
 * fixed fraction of the scale, and a tooltip stating it would be inventing a figure.
 *
 * **Only with ONE year**, which is also the only case drawn with bars. Comparing several, a gap is
 * already visible because the line breaks and because the other years do have a point in that
 * column.
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
      stack: STACK_ID,
      data: points.map((point) => (point.amount === null ? stub : null)),
      itemStyle: {
        color: absentFill(ground),
        borderRadius: [2, 2, 0, 0] as [number, number, number, number],
      },
      barMaxWidth: CHART_MARK.barMaxWidth,
    },
  ];
}

/** The absence mark's fill: recessive on whichever ground the card stands on. */
function absentFill(ground: ChartGround): string {
  return ground === "stage" ? CHART_STAGE.grid : CHART_GROUND[ground].grid;
}

function evolutionNote(
  monthlyByYear: readonly YearMonths[],
  comparing: boolean,
  hidden: number,
  brokenDown: boolean,
  foldedTypes: number,
  shape: EvolutionShape,
): string {
  const axisLength = monthlyByYear[0]?.points.length ?? 0;
  // What the shape on screen IS, said once — and it is not the same sentence for the three.
  const breakdown = !brokenDown
    ? ""
    : ` ${
        {
          skyline:
            "Cada fila del fondo es un tipo de servicio y cada una arranca en cero, así que su altura se compara mes a mes. Arrastra para girar la vista.",
          types:
            "Un solo mes en el eje: cada barra es un tipo de servicio de ese mes, no un mes. Marca otro mes y vuelven a ser columnas.",
          stacked: "Cada columna es el desglose por tipo de servicio del mes y la línea, su total.",
        }[shape]
      }${
        foldedTypes === 0
          ? ""
          : ` ${pluralize(foldedTypes, "tipo")} más quedan agrupados en «Otros»; la tabla los lista uno a uno.`
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
    // It talks about the AXIS that is on screen and not about «the twelve months».
    const what = axisLength === 12 ? "los doce meses" : pluralize(axisLength, "mes", "meses");
    return (
      (comparing
        ? `Todos los años comparados tienen ${what} del eje cargados.`
        : `Sin huecos: ${what} del eje tienen su archivo cargado.`) +
      breakdown +
      pruned
    );
  }
  // The gaps are said PER YEAR, never one per month: with three half-loaded years, one line per
  // month would be thirty notices for a single idea.
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
