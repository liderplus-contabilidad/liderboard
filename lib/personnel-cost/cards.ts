/**
 * The screen's FOUR readings, described as DATA (`option` + `table`) and not as markup: the partition
 * planta/externos, the ratio against ventas, the evolution by group and the ranking of concepts.
 *
 * That they are data is what lets the Datos tab, the Gráficos tab and any future printable report read
 * the same construction instead of each rebuilding its figures — two computations of one question
 * drift apart, and nothing downstream can say which of the two numbers is right.
 *
 * **Each card has TWO shapes, and the number of marked years chooses it**, never a control: with one
 * the axis is the twelve months, and with several it becomes the exercises. It is neither a fifth card
 * nor a toggle —two places to choose the same thing—, it is the same question answered over what the
 * user marked, which is «Ventas por servicio»' rule and what makes the year-on-year comparison cost no
 * new control.
 *
 * **Not one hex is written here.** Everything comes out of `lib/charts/palette.ts`, and the module
 * declares ONE colour universe (`COLOR_UNIVERSE`) covering its five named entities — the two sections
 * and the three groups — so «externos» is the same colour in the card that splits it and in the card
 * that stacks it. Handing each card its own universe would have painted the same figure two ways on
 * one screen, which is exactly the reading hazard `colorForEntity`'s stability rule exists to prevent.
 */
import {
  CHART_FONT,
  CHART_GROUND,
  CHART_INK,
  CHART_LINES,
  CHART_MARK,
  CHART_NEUTRAL,
  CHART_STAGE,
  CHART_STAGE_LIGHT,
  CHART_STAGE_MATERIAL,
  CHART_STAGE_SKY,
  CHART_SURFACE,
  colorForEntity,
  colorForSliceSlot,
  CHART_TRAJECTORY_GROUND,
  figureInk,
  stageColor,
  stageSliceColor,
  type ChartGround,
} from "@/lib/charts/palette";
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
import {
  fitDirectLabel,
  fitPercentLabel,
  labelDistance,
  labelHeadroom,
  type LabelFit,
} from "@/lib/charts/label-fit";
import {
  SOLID_BARS_HEIGHT,
  solidBarsOption,
  type SolidBarRow,
  type SolidView,
} from "@/lib/charts/solid-bars";
import { seriesRunTooltip, tooltipMarker } from "@/lib/charts/tooltip";
import { MONTHS_SHORT_ES } from "@/lib/date";
import { formatCurrency, formatPercent } from "@/lib/format";
import {
  groupsOfSection,
  PERSONNEL_GROUPS,
  PERSONNEL_SECTIONS,
  type PersonnelGroupId,
  type PersonnelSectionId,
} from "./accounts";
import { shareOf, type PersonnelCostReading, type PersonnelYearReading } from "./derive";
import { GUIDE_CONCEPTS, GUIDE_GROUPS, GUIDE_REVENUE_RATIO, GUIDE_SECTIONS } from "./guides";

/**
 * **The module's ONE colour universe**, and it deliberately does not list the sections: `planta`, plus
 * the three groups. Four fixed slots of `CHART_PALETTE`, never re-ordered.
 *
 * `externos` is missing because it is not a fourth entity — it IS `honorarios-medicos`, the same rows
 * and the same figure, which is why the grid folds their two rows into one. Giving it a slot of its
 * own painted the same number amber in the card that stacks it and pink in the card that splits it,
 * side by side on one screen; `colorForPersonnel` resolves it to the group instead. `planta` does keep
 * its own slot: it is the SUM of two groups and cannot borrow the colour of either.
 */
const COLOR_UNIVERSE: readonly string[] = ["planta", ...PERSONNEL_GROUPS.map((group) => group.id)];

/** A section's or a group's colour. The one way in, so no card can paint one figure two ways. */
function colorForPersonnel(id: string): string {
  const groups = groupsOfSection(id as PersonnelSectionId);
  // A section made of ONE group takes that group's colour, because it is that group.
  const resolved = groups.length === 1 ? groups[0].id : id;
  return colorForEntity(resolved, COLOR_UNIVERSE);
}

/** How many concepts the ranking DRAWS before folding the tail into one bar. */
export const CONCEPT_SLICES = 8;

/**
 * The two shapes «Evolución» can take, and they answer two different questions.
 *
 * `apilada` piles the groups into the month and tops them with the total's line: it reads «cuánto
 * costó el mes y qué parte es cada grupo». `skyline` gives each compared entity its own AXIS, so it
 * reads «hacia dónde va cada uno» — a trajectory a stacked band cannot show, because a segment's
 * height is measured from wherever the one below it ended.
 *
 * It is the ONE control this card has, and it lives in its header and not in the filter bar, which is
 * the house rule: the other three cards read nothing from it.
 */
export type EvolutionView = "apilada" | "skyline";

export const DEFAULT_EVOLUTION_VIEW: EvolutionView = "apilada";

const SECTIONS_HEIGHT = 300;
const RATIO_HEIGHT = 280;
const GROUPS_HEIGHT = 300;
/** The same card in three dimensions: perspective spends height a flat plot does not. */
const GROUPS_HEIGHT_3D = 400;
const CONCEPTS_HEIGHT = 340;

/** Exactly what the cards were built from — the provider exposes it so nothing recomposes it. */
export interface PersonnelCardsInput {
  reading: PersonnelCostReading;
  /** The marked groups; empty is all of them. */
  groups: readonly PersonnelGroupId[];
  /** How the span is named, so every subtitle says the same thing. */
  period: string;
  /** «Evolución»'s shape. `apilada` when not given. */
  evolutionView?: EvolutionView;
  /**
   * Which of the other three cards are standing on the stage. Flat when not given.
   *
   * They are named ONE BY ONE and not kept in a dictionary of ids: there are exactly three, they are
   * fixed, and a typo in a key would silently draw a flat card forever. «Evolución» is not among them
   * because its second shape is a skyline and not a frieze — a different reading, with a control of
   * its own (`evolutionView`).
   */
  solidViews?: {
    sections?: SolidView;
    ratio?: SolidView;
    concepts?: SolidView;
  };
}

export interface PersonnelCards {
  /** All four can come out in three dimensions — hence the widened option type on every one. */
  sections: ChartCardSpec<ChartOption | Chart3DOption>;
  ratio: ChartCardSpec<ChartOption | Chart3DOption>;
  groups: ChartCardSpec<ChartOption | Chart3DOption>;
  concepts: ChartCardSpec<ChartOption | Chart3DOption>;
  /**
   * Whether the skyline has anything to put on its depth axis. With ONE entity to compare it has
   * none, and the control is NOT DRAWN — a control that means nothing for the open data does not
   * render disabled, which is the rule the filter bar already holds everywhere else.
   */
  skylineAvailable: boolean;
}

// ---------------------------------------------------------------------------
// Chrome
// ---------------------------------------------------------------------------

/**
 * Every helper of this chrome takes the GROUND it is drawn on, `surface` unless said otherwise: the
 * ratio comparing several exercises stands on the stage (`CHART_GROUND`), and there the light
 * chrome's greys are invisible.
 */
function valueAxis(unit: (value: number) => string, ground: ChartGround = "surface"): ChartAxis {
  const tones = CHART_GROUND[ground];
  return {
    type: "value",
    axisLine: { show: false },
    axisTick: { show: false },
    splitLine: { show: true, lineStyle: { color: tones.grid, width: 1, type: "solid" } },
    axisLabel: { color: tones.inkFaint, fontSize: 11, formatter: (value) => unit(Number(value)) },
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

function legendFor(show: boolean, ground: ChartGround = "surface"): ChartLegend {
  return {
    show,
    type: "scroll",
    bottom: 0,
    icon: "roundRect",
    itemWidth: 10,
    itemHeight: 10,
    itemGap: 14,
    textStyle: { color: CHART_GROUND[ground].inkMuted, fontSize: 11.5 },
  };
}

/**
 * The house tooltip, and **`confine: true` is set here once and never per card**: `ChartCard` is an
 * `overflow-hidden` —it has to be, so the table does not spill out of the rounded corners— and an
 * unconfined tooltip is CUT by the card on the last bars, exactly where the label is longest.
 */
const TOOLTIP_CHROME = {
  backgroundColor: CHART_SURFACE,
  borderColor: CHART_LINES.axis,
  borderWidth: 1,
  padding: [8, 10] as [number, number],
  textStyle: { color: CHART_INK.strong, fontSize: 12 },
  confine: true,
};

/**
 * The VENTAS a tooltip row is measured against — the divisor of «% sobre ventas» for the series and
 * the column under the cursor. `null` where no ventas are known, and the row then writes no
 * percentage at all: `shareOf`'s rule, never «0 %».
 */
type TooltipRevenue = (seriesId: string, dataIndex: number) => number | null;

function axisTooltip(
  unit: (value: number) => string,
  ground: ChartGround = "surface",
  revenueOf?: TooltipRevenue,
): ChartTooltip {
  const tones = CHART_GROUND[ground];
  // Beside the figure and not in a column of its own: the box is read one row at a time, and the
  // percentage is what the reader asked the figure for.
  const shareText = (row: ChartParam): string => {
    if (!revenueOf) {
      return "";
    }
    const share = shareOf(Number(row.value), revenueOf(row.seriesId ?? "", row.dataIndex) ?? 0);
    return share === null
      ? ""
      : ` <span style="color:${tones.inkMuted}">· ${percent(share)} de ventas</span>`;
  };
  return {
    trigger: "axis",
    ...TOOLTIP_CHROME,
    // On the stage the box is drawn in the stage's panel: a white one would be a hole in the night.
    backgroundColor: tones.panel,
    borderColor: tones.panelBorder,
    textStyle: { color: tones.ink, fontSize: 12 },
    axisPointer: { type: "shadow", lineStyle: { color: tones.axis, width: 1 } },
    formatter: (params) => {
      const rows = Array.isArray(params) ? params : [params];
      const head = rows[0]?.name ?? "";
      // A slot with no figure is OMITTED instead of saying `$0.00` — the grid's same rule.
      const body = rows
        .filter((row) => row.value !== null && row.value !== undefined)
        .map(
          (row) =>
            `<div>${row.marker ?? ""} ${row.seriesName ?? ""}: <b>${unit(Number(row.value))}</b>${shareText(row)}</div>`,
        )
        .join("");
      return `<div style="font-weight:600;margin-bottom:4px">${head}</div>${
        body || `<div style="color:${tones.inkMuted}">Sin cargar</div>`
      }`;
    },
  };
}

function itemTooltip(
  formatter: (param: ChartParam) => string,
  ground: ChartGround = "surface",
): ChartTooltip {
  const tones = CHART_GROUND[ground];
  return {
    trigger: "item",
    ...TOOLTIP_CHROME,
    backgroundColor: tones.panel,
    borderColor: tones.panelBorder,
    textStyle: { color: tones.ink, fontSize: 12 },
    formatter: (params) => formatter(Array.isArray(params) ? params[0] : params),
  };
}

const ROUND_TOP = [CHART_MARK.radius, CHART_MARK.radius, 0, 0] as [number, number, number, number];
const ROUND_RIGHT = [0, CHART_MARK.radius, CHART_MARK.radius, 0] as [
  number,
  number,
  number,
  number,
];

const money = (value: number) => formatCurrency(value);
const moneyExact = (value: number) => formatCurrency(value, { cents: true });
const percent = (value: number) => formatPercent(value);

/** A year's colour: its STABLE position in the marked list, so removing one does not repaint the
 *  others. */
function yearColor(year: number, years: readonly number[]): string {
  return colorForEntity(
    String(year),
    years.map((entry) => String(entry)),
  );
}

/** A cell of a table twin: `null` renders EMPTY and never `$0`, which is a different claim. */
function cell(value: number | null, unit: (value: number) => string): string | null {
  return value === null ? null : unit(value);
}

/**
 * The figure written over a mark — the module's ONE composition of it, so four cards cannot end up
 * writing an amount four different ways.
 *
 * Its SHAPE is `lib/charts/label-fit`'s and not this module's: body first, then the cents —which the
 * tooltip and the table twin keep— and never the figure itself. Written flat at every density, because
 * these cards are read at a glance and a turned amount is read by tilting the head.
 *
 * `read` is what the label SAYS, and it is deliberately not `param.value`: over a stack the value under
 * the label is the band's and what belongs there is the column's total. `row` is which strip of figures
 * the series writes on — one figure per column per series is what buys the width, and it is what lets
 * the ratio's exercises carry their percentage without disputing one strip.
 */
function directLabel(
  fit: LabelFit,
  read: (param: ChartParam) => number | null,
  write: (value: number) => string,
  row = 0,
  /** The ground the figure is written on: on the stage it takes the stage's ink. */
  ground: ChartGround = "surface",
): Pick<ChartSeries, "label" | "labelLayout"> {
  return {
    label: {
      show: true,
      position: "top",
      distance: labelDistance(row, fit),
      ...figureInk(ground, CHART_INK.muted),
      fontSize: fit.fontSize,
      formatter: (param: ChartParam) => {
        const value = read(param);
        // A month never loaded writes NOTHING. `$0.00` would be a claim the file never made — the
        // grid's and the tooltip's same rule.
        return value === null ? "" : write(value);
      },
    },
    // The rows keep one series' figures off the next one's; what is left for `hideOverlap` is a
    // collision INSIDE a row — two adjacent columns on an axis narrower than the fit assumed.
    labelLayout: { hideOverlap: true },
  };
}

/**
 * The figure over a COLUMN, and it is always the column's total — never the band the label happens to
 * ride on. It is Ventas' and PyG's same rule: a stack's bands are told apart by colour and read one by
 * one in the tooltip, and writing three figures up a column is how a column stops being read as one
 * amount.
 */
function columnTotalLabel(
  fit: LabelFit,
  totals: readonly (number | null)[],
): Pick<ChartSeries, "label" | "labelLayout"> {
  return directLabel(
    fit,
    (param) => totals[param.dataIndex] ?? null,
    (value) => formatCurrency(value, { cents: fit.cents }),
  );
}

/** A column's total across a set of stacked series: `null` only where NO band has a figure. */
function columnTotals(series: readonly ChartSeries[], columns: number): (number | null)[] {
  return Array.from({ length: columns }, (_, index) =>
    series.reduce<number | null>((sum, entry) => {
      const value = entry.data[index] as number | null;
      return value === null ? sum : (sum ?? 0) + value;
    }, null),
  );
}

/**
 * The total's LINE over a stack — PyG's `stackedTotalOption` same mark, in ink and not in a palette
 * slot, because it is not one more entity of the comparison. ONE definition for the two stacked
 * cards («Planta vs Externos» and the evolution), so they cannot draw the same idea two ways.
 *
 * Here it IS the stack's ceiling, since every band is a positive cost. It earns its place anyway,
 * and for the reason the reader gave: a ceiling is not a TRAJECTORY. The eye follows a coloured
 * band, not the top edge of separate bars, so «subió o bajó» costs a comparison of heights across
 * gaps. The line answers it without one.
 *
 * It is also the one mark that WRITES the column's figure: it already is the total, so hanging the
 * label on it instead of on a band means no band ever needs choosing as the carrier.
 */
function totalLine(id: string, totals: readonly (number | null)[], fit: LabelFit): ChartSeries {
  return {
    id,
    type: "line",
    name: "Total",
    data: [...totals],
    lineStyle: { color: CHART_INK.strong, width: CHART_MARK.lineWidth, type: "solid" },
    itemStyle: { color: CHART_INK.strong },
    symbol: "circle",
    symbolSize: CHART_MARK.symbolSize,
    smooth: false,
    // Measured as ONE series and not as one more band: what decides the figure's shape is its own
    // row over the columns, not the stack below it.
    ...columnTotalLabel(fit, totals),
    // Over the bars, never under: a line hidden behind the stack it measures is a line that is not
    // there.
    z: 3,
  };
}

/**
 * The SOLID body of a flat card — the same reading given depth, and the one door to it, so three
 * cards cannot end up standing on three different stages.
 *
 * It is `lib/charts/solid-bars.ts` and NOT this module's skyline, and the two are different shapes on
 * purpose: a skyline hands every entity an axis of its own to be followed month by month; a frieze
 * puts few rows behind one another so the columns can be compared. «Evolución» wants the first —it is
 * a trajectory— and these three want the second.
 *
 * **The rows go smallest FIRST.** `solidBarsOption` draws `rows[0]` nearest the reader and a bar hides
 * whatever is behind it, so the tallest at the front covers the rest whole. It is the skyline's same
 * rule read from the other end, because that camera looks at the box from the other side.
 *
 * **Unless the rows are EXERCISES** (`order: "given"`): a year is looked for by its position, so
 * they keep the chronological order they arrive in and the height does not move them — the same
 * exception the skyline makes.
 */
function solidBody(
  columns: readonly string[],
  rows: readonly SolidBarRow[],
  units: { value: (value: number) => string; axis: (value: number) => string },
  options: { order?: "peak" | "given"; colors?: readonly string[] } = {},
): Chart3DOption | null {
  const { order = "peak", colors } = options;
  if (columns.length === 0 || rows.length === 0) {
    return null;
  }
  return solidBarsOption({
    columns,
    // Sorted by PEAK and never by total: occlusion is a fact about heights, and an entity that adds up
    // to more can still have every column shorter than the one it would hide.
    rows: order === "peak" ? [...rows].sort((a, b) => peakOf(a.values) - peakOf(b.values)) : rows,
    ...(colors ? { colors } : {}),
    formatValue: units.value,
    formatAxis: units.axis,
  });
}

/** The tallest column a row reaches, which is what decides how far back it is drawn. */
function peakOf(values: readonly (number | null)[]): number {
  const heights = values.filter((value): value is number => value !== null);
  return heights.length > 0 ? Math.max(...heights) : 0;
}

/** Whether the card DRAWS its solid: the control asked for it and there is a body to draw. */
function standing(
  view: SolidView | undefined,
  solid: Chart3DOption | null,
): solid is Chart3DOption {
  return view === "solido" && solid !== null;
}

/** What a card standing on the stage says under itself, since its camera is not obvious. */
const SOLID_HINT = "Arrastra para girar la vista.";

/** A card's note, with the stage's hint appended where it is standing. */
function sentence(note: string | undefined, asSolid: boolean): string | undefined {
  const parts = [note, asSolid ? SOLID_HINT : undefined].filter(Boolean);
  return parts.length > 0 ? parts.join(" ") : undefined;
}

// ---------------------------------------------------------------------------
// 1 · Planta vs Externos
// ---------------------------------------------------------------------------

/**
 * A section's figures under the bar's «Grupo» marks: the section whole with no mark, and otherwise
 * the SUM of its marked groups — Planta narrowed to Afiliados is the Afiliados series, figure by
 * figure. A typed exercise has no groups, so a mark means nothing for it and the section stays whole,
 * the same rule the evolution and the concepts already hold. `null` when the section has no marked
 * group at all: it is then not drawn, because a stack of zeros would claim the section cost nothing.
 */
function narrowedSection(
  year: PersonnelYearReading,
  sectionId: PersonnelSectionId,
  marked: ReadonlySet<PersonnelGroupId>,
): { total: number; monthly: (number | null)[] } | null {
  const whole = year.sections.find((entry) => entry.section.id === sectionId);
  if (!whole) {
    return null;
  }
  if (marked.size === 0 || year.groups.length === 0) {
    return { total: whole.total, monthly: whole.monthly };
  }
  const groups = year.groups.filter(
    (entry) => entry.group.section === sectionId && marked.has(entry.group.id),
  );
  if (groups.length === 0) {
    return null;
  }
  return {
    total: groups.reduce((sum, entry) => sum + entry.total, 0),
    monthly: whole.monthly.map((_, month) =>
      groups.every((entry) => entry.monthly[month] === null)
        ? null
        : groups.reduce((sum, entry) => sum + (entry.monthly[month] ?? 0), 0),
    ),
  };
}

function buildSectionsCard(input: PersonnelCardsInput): ChartCardSpec<ChartOption | Chart3DOption> {
  const { reading, period } = input;
  const years = reading.years.filter((year) => year.covered);
  const comparing = years.length > 1;
  const marked = new Set(input.groups);
  // ONE year puts the months on the axis; several put the exercises. What the reader compares is what
  // they marked, and no control chooses between the two.
  const categories = comparing
    ? years.map((year) => String(year.year))
    : (years[0]?.months ?? []).map((month) => MONTHS_SHORT_ES[month]);

  // The sections the marks leave standing: a section none of whose groups is marked is not drawn,
  // and its column leaves the table twin with it.
  const drawn = PERSONNEL_SECTIONS.filter((section) =>
    years.some((year) => narrowedSection(year, section.id, marked) !== null),
  );

  const series: ChartSeries[] = drawn.map((section, index, all) => {
    const data = comparing
      ? years.map((year) => narrowedSection(year, section.id, marked)?.total ?? null)
      : (years[0]?.months ?? []).map(
          (month) =>
            (years[0] && narrowedSection(years[0], section.id, marked)?.monthly[month]) ?? null,
        );
    return {
      id: `section-${section.id}`,
      type: "bar",
      name: section.label,
      stack: "costo",
      data,
      barMaxWidth: CHART_MARK.barMaxWidth,
      itemStyle: {
        color: colorForPersonnel(section.id),
        // Only the TOP of the stack is rounded; a rounded cap inside it would read as a gap.
        borderRadius: index === all.length - 1 ? ROUND_TOP : 0,
        borderColor: CHART_SURFACE,
        borderWidth: CHART_MARK.gap / 2,
      },
      emphasis: { focus: "series" },
    };
  });

  // ONE definition of the month's total, read by the figure over the column and by the table twin —
  // two computations of the same number drift apart and nothing can say which of the two is right.
  const totals = columnTotals(series, categories.length);
  const fit = fitDirectLabel(categories.length);

  const table: ChartTable = {
    // `columns` nombra sólo las columnas de VALORES: la de la etiqueta la encabeza `ChartCard`
    // («Serie»), y anteponerla aquí corría toda la fila una posición.
    columns: [...drawn.map((s) => s.label), "Total"],
    rows: categories.map((label, index) => ({
      id: `sections-${label}`,
      label,
      values: [
        ...drawn.map((section) => {
          const found = series.find((entry) => entry.id === `section-${section.id}`);
          return cell((found?.data[index] as number | null) ?? null, moneyExact);
        }),
        cell(totals[index], moneyExact),
      ],
    })),
  };

  // The note's shares follow the narrowing: what is drawn is what is measured against ventas. With
  // no mark they are the reading's own —the same figures the tiles say—, and `shareOf` is the one
  // definition of a share either way.
  const shareOfSection = (sectionId: PersonnelSectionId): number | null | undefined => {
    if (!drawn.some((section) => section.id === sectionId)) {
      return undefined;
    }
    if (marked.size === 0) {
      return reading.sections.find((entry) => entry.section.id === sectionId)?.share;
    }
    const total = years.reduce(
      (sum, year) => sum + (narrowedSection(year, sectionId, marked)?.total ?? 0),
      0,
    );
    return shareOf(total, reading.revenue);
  };
  const planta = shareOfSection("planta");
  const externos = shareOfSection("externos");

  // On the stage the two sections stop being a pile and become two ROWS: what the stack says by
  // accumulating, the depth axis says by standing them one behind the other, and each is then read
  // from the floor instead of from wherever the one below it ended.
  const solid = solidBody(
    categories,
    drawn.map((section) => ({
      id: section.id,
      name: section.label,
      color: stageColor(colorForPersonnel(section.id)),
      values: (series.find((entry) => entry.id === `section-${section.id}`)?.data ?? []) as (
        | number
        | null
      )[],
    })),
    { value: moneyExact, axis: money },
  );
  const asSolid = standing(input.solidViews?.sections, solid);

  return {
    id: "personnel-sections",
    title: "Planta vs Externos",
    subtitle: period,
    option: asSolid
      ? solid
      : categories.length === 0
        ? null
        : {
            animationDuration: 300,
            textStyle: { fontFamily: CHART_FONT },
            grid: {
              left: 8,
              right: 12,
              // The room the row of figures asks for: `outerBoundsContain` only reserves for the
              // AXIS' labels, so without this the amount over the tallest column is cropped against
              // the card's edge — the one failure worse than the hover it replaces.
              top: labelHeadroom(1, fit, 12),
              bottom: 34,
              outerBoundsMode: "same",
              outerBoundsContain: "axisLabel",
            },
            xAxis: categoryAxis(categories),
            yAxis: valueAxis(money),
            legend: legendFor(true),
            // The column's ventas: the exercise's over the span when comparing, that month's with
            // one year — the same divisor the ratio card plots.
            tooltip: axisTooltip(moneyExact, "surface", (_series, index) =>
              comparing
                ? (years[index]?.revenue ?? null)
                : (years[0]?.revenueMonthly[years[0].months[index] ?? -1] ?? null),
            ),
            series: [...series, totalLine("sections-total", totals, fit)],
          },
    table,
    note: sentence(
      (() => {
        const parts = [
          planta === undefined ? null : `planta ${planta === null ? "—" : percent(planta)}`,
          externos === undefined ? null : `externos ${externos === null ? "—" : percent(externos)}`,
        ].filter((part): part is string => part !== null);
        return parts.length > 0 ? `Sobre ventas: ${parts.join(", ")}.` : undefined;
      })(),
      asSolid,
    ),
    guide: GUIDE_SECTIONS,
    height: asSolid ? SOLID_BARS_HEIGHT : SECTIONS_HEIGHT,
  };
}

// ---------------------------------------------------------------------------
// 2 · Costo de personal vs ventas
// ---------------------------------------------------------------------------

function buildRatioCard(input: PersonnelCardsInput): ChartCardSpec<ChartOption | Chart3DOption> {
  const { reading, period } = input;
  const years = reading.years.filter((year) => year.covered);
  const months = [...new Set(years.flatMap((year) => year.months))].sort((a, b) => a - b);
  const order = years.map((year) => year.year);

  /**
   * A month's ratio inside one exercise. It divides the month's cost by the SAME month's ventas —
   * never by the tramo's — so a point is a real monthly reading and not the year's average redrawn
   * twelve times.
   */
  const ratioAt = (year: PersonnelYearReading, month: number): number | null => {
    const cost = year.monthly[month];
    const revenue = year.revenueMonthly[month];
    if (cost === null || revenue === null) {
      return null;
    }
    return shareOf(cost, revenue);
  };

  // **The card stands on the STAGE** (`CHART_TRAJECTORY_GROUND`), one exercise or several: a thin
  // line over a white plot has nothing but its hue to be found by, and it is the ground the solid
  // body of this same reading already has. There the year wears `stageColor`'s slot —the solid's
  // same rule— and the table twin, on the white, keeps the light one.
  const ground = CHART_TRAJECTORY_GROUND;
  const lineColor = (year: number) =>
    ground === "stage" ? stageColor(yearColor(year, order)) : yearColor(year, order);

  // With SEVERAL exercises this card writes NO figure over its points: what a ratio is read for is
  // the trajectory, and a percentage over every mark of every exercise turns the line into texture.
  // The amount stays where it is never missing — in the tooltip on hover and in the table twin.
  // ALONE, an exercise has nothing to be read against but its own months, and the percentage over
  // each point is what turns «abril subió» into «abril fue 43.4 %» — Reportería's comparativo's
  // same rule, one row of figures in the ground's ink.
  const comparing = years.length > 1;
  // A percent's own fit: six characters where an amount has eleven, so it reads two points larger.
  const labelFit = fitPercentLabel(months.length);
  const series: ChartSeries[] = years.map((year) => ({
    id: `ratio-${year.year}`,
    type: "line",
    name: String(year.year),
    data: months.map((month) => ratioAt(year, month)),
    smooth: false,
    symbol: "circle",
    symbolSize: CHART_MARK.symbolSize,
    lineStyle: { color: lineColor(year.year), width: CHART_MARK.lineWidth },
    itemStyle: { color: lineColor(year.year) },
    ...(comparing
      ? {}
      : directLabel(
          labelFit,
          (param) =>
            param.value === null || param.value === undefined ? null : Number(param.value),
          percent,
          0,
          ground,
        )),
    emphasis: { focus: "series" },
    // Comparing, a line is read ONE at a time: the exercise under the pointer comes forward, the
    // others blur, and the stroke itself answers (`triggerEvent`) — not only its dots.
    ...(comparing ? { triggerEvent: "line" as const } : {}),
  }));

  // The line's box, comparing: the exercise as the head and its months as the body, in the same
  // two columns Reportería's comparativo opens (`seriesRunTooltip`). A column of six exercises
  // under one month is not what a line is followed for; the run of the one under the pointer is.
  // Alone, the column tooltip stays: one figure per month, already written over the point.
  const lineTooltip = itemTooltip((param) => {
    const year = years.find((candidate) => `ratio-${candidate.year}` === param.seriesId);
    if (!year) return "";
    const rows = months.flatMap((month) => {
      const value = ratioAt(year, month);
      return value === null ? [] : [{ label: MONTHS_SHORT_ES[month], figure: percent(value) }];
    });
    return seriesRunTooltip(
      `${tooltipMarker(lineColor(year.year))}${year.year}`,
      rows,
      param.name,
      CHART_GROUND[ground].inkMuted,
    );
  }, ground);

  const table: ChartTable = {
    columns: [...months.map((month) => MONTHS_SHORT_ES[month]), "Tramo"],
    rows: years.map((year) => ({
      id: `ratio-${year.year}`,
      label: String(year.year),
      color: yearColor(year.year, order),
      values: [
        ...months.map((month) => cell(ratioAt(year, month), percent)),
        cell(year.share, percent),
      ],
    })),
  };

  // Standing up, the trajectory gives way to a comparison of HEIGHTS from a common floor: one solid
  // per month and one row per exercise, on the same percentage scale. It is a second shape and not a
  // replacement — what a line draws and a bar cannot is exactly where the ratio is going.
  const solid = solidBody(
    months.map((month) => MONTHS_SHORT_ES[month]),
    years.map((year) => ({
      id: `ratio-${year.year}`,
      name: String(year.year),
      color: stageColor(yearColor(year.year, order)),
      values: months.map((month) => ratioAt(year, month)),
    })),
    { value: percent, axis: percent },
    // One row per EXERCISE, so they keep their order: the oldest at the back, never the shortest.
    { order: "given" },
  );
  const asSolid = standing(input.solidViews?.ratio, solid);

  return {
    id: "personnel-ratio",
    title: "Costo de personal vs ventas",
    subtitle: period,
    option: asSolid
      ? solid
      : months.length === 0
        ? null
        : {
            animationDuration: 300,
            textStyle: { fontFamily: CHART_FONT },
            ...(CHART_GROUND[ground].sky ? { backgroundColor: CHART_GROUND[ground].sky } : {}),
            grid: {
              left: 8,
              right: 12,
              // Comparing, no figure is written and the plot keeps the room; a lone exercise writes
              // one row and the grid opens what it needs — `outerBoundsContain` only reserves for
              // the axis' labels.
              top: comparing ? 12 : labelHeadroom(1, labelFit, 12),
              bottom: 34,
              outerBoundsMode: "same",
              outerBoundsContain: "axisLabel",
            },
            xAxis: categoryAxis(
              months.map((month) => MONTHS_SHORT_ES[month]),
              { ground },
            ),
            yAxis: valueAxis(percent, ground),
            legend: legendFor(years.length > 1, ground),
            tooltip: comparing ? lineTooltip : axisTooltip(percent, ground),
            series,
          },
    table,
    note: sentence(
      reading.share === null
        ? undefined
        : `En el tramo completo: ${percent(reading.share)} de ${moneyExact(reading.revenue)} facturados.`,
      asSolid,
    ),
    guide: GUIDE_REVENUE_RATIO,
    height: asSolid ? SOLID_BARS_HEIGHT : RATIO_HEIGHT,
  };
}

// ---------------------------------------------------------------------------
// 3 · Evolución mensual por grupo
// ---------------------------------------------------------------------------

/** One row of the evolution: an entity, its colour and what it cost month by month. */
interface EvolutionRow {
  id: string;
  name: string;
  color: string;
  /** Indexed by the card's month axis, not by the calendar. */
  values: (number | null)[];
}

/**
 * WHAT the evolution compares, and it is not a choice: with one exercise marked it is the three
 * GROUPS over that year's months, and with several it is the EXERCISES over the union of their
 * months.
 *
 * The months stay on the axis in BOTH cases, and that is the whole point of this card — the grid gives
 * them up when comparing exercises (fourteen columns per year is a table nobody reads), so this is
 * where «en qué mes se disparó» goes on being answerable.
 */
function evolutionRows(input: PersonnelCardsInput): {
  months: number[];
  rows: EvolutionRow[];
  depthLabel: string;
} {
  const years = input.reading.years.filter((year) => year.covered);
  const marked = new Set(input.groups);

  if (years.length > 1) {
    const months = [...new Set(years.flatMap((year) => year.months))].sort((a, b) => a - b);
    return {
      months,
      depthLabel: "Ejercicio",
      rows: years.map((year) => ({
        id: String(year.year),
        name: String(year.year),
        color: yearColor(
          year.year,
          years.map((entry) => entry.year),
        ),
        values: months.map((month) => year.monthly[month] ?? null),
      })),
    };
  }

  const year = years[0];
  const months = year?.months ?? [];

  // A TYPED exercise has no groups, so what it compares is its two SECTIONS. It is not a third shape
  // of the card: it is the same question —«qué parte de este mes es cada cosa»— answered at the only
  // level that year knows, which is the level the old sheet wrote.
  if (year && year.groups.length === 0 && year.legacyRows.length > 0) {
    return {
      months,
      depthLabel: "Sección",
      rows: PERSONNEL_SECTIONS.map((section) => ({
        id: section.id,
        name: section.label,
        color: colorForPersonnel(section.id),
        values: months.map(
          (month) => year.sections.find((e) => e.section.id === section.id)?.monthly[month] ?? null,
        ),
      })),
    };
  }

  return {
    months,
    depthLabel: "Grupo",
    rows: PERSONNEL_GROUPS.filter((group) => marked.size === 0 || marked.has(group.id)).map(
      (group) => ({
        id: group.id,
        name: group.label,
        color: colorForPersonnel(group.id),
        values: months.map(
          (month) => year?.groups.find((e) => e.group.id === group.id)?.monthly[month] ?? null,
        ),
      }),
    ),
  };
}

function buildGroupsCard(input: PersonnelCardsInput): {
  card: ChartCardSpec<ChartOption | Chart3DOption>;
  skylineAvailable: boolean;
} {
  const { period } = input;
  const { months, rows, depthLabel } = evolutionRows(input);
  const comparing = depthLabel === "Ejercicio";
  const labels = months.map((month) => MONTHS_SHORT_ES[month]);
  // With ONE entity there is no depth axis to give anything, so the shape is not offered.
  const skylineAvailable = rows.length > 1 && months.length > 0;
  const skyline = skylineAvailable && input.evolutionView === "skyline";

  /** The stack's ceiling, which is also the total — every group here is a positive cost. */
  const totals = months.map((_, index) => {
    const present = rows.map((row) => row.values[index]).filter((v): v is number => v !== null);
    return present.length > 0 ? present.reduce((sum, value) => sum + value, 0) : null;
  });

  const labelFit = fitDirectLabel(labels.length);

  const barSeries: ChartSeries[] = rows.map((row, index) => ({
    id: `evolution-${row.id}`,
    type: "bar",
    name: row.name,
    stack: "evolucion",
    data: row.values,
    barMaxWidth: CHART_MARK.barMaxWidth,
    itemStyle: {
      color: row.color,
      borderRadius: index === rows.length - 1 ? ROUND_TOP : 0,
      borderColor: CHART_SURFACE,
      borderWidth: CHART_MARK.gap / 2,
    },
    emphasis: { focus: "series" },
  }));

  const totalSeries = totalLine("evolution-total", totals, labelFit);

  const table: ChartTable = {
    columns: [...rows.map((row) => row.name), "Total"],
    rows: labels.map((label, index) => ({
      id: `evolution-${label}`,
      label,
      values: [
        ...rows.map((row) => cell(row.values[index], moneyExact)),
        cell(totals[index], moneyExact),
      ],
    })),
  };

  const flat: ChartOption = {
    animationDuration: 300,
    textStyle: { fontFamily: CHART_FONT },
    grid: {
      left: 8,
      right: 12,
      // The same headroom the sections card reserves, and for the same reason: nothing else accounts
      // for a figure written over the tallest column.
      top: labelHeadroom(1, labelFit, 12),
      bottom: 34,
      outerBoundsMode: "same",
      outerBoundsContain: "axisLabel",
    },
    xAxis: categoryAxis(labels),
    yAxis: valueAxis(money),
    legend: legendFor(true),
    // Comparing exercises each row is a year, so each divides by ITS ventas of that month; with one
    // year every band and the total divide by the same month's.
    tooltip: axisTooltip(moneyExact, "surface", (seriesId, index) => {
      const month = months[index];
      const covered = input.reading.years.filter((year) => year.covered);
      if (month === undefined) {
        return null;
      }
      // The total of several exercises in one month is measured against their ventas summed — the
      // one divisor under which the parts' percentages add up to the whole's.
      if (comparing && seriesId === "evolution-total") {
        const known = covered
          .map((entry) => entry.revenueMonthly[month])
          .filter((value): value is number => value !== null);
        return known.length > 0 ? known.reduce((sum, value) => sum + value, 0) : null;
      }
      const year = comparing
        ? covered.find((entry) => `evolution-${entry.year}` === seriesId)
        : covered[0];
      return year?.revenueMonthly[month] ?? null;
    }),
    series: [...barSeries, totalSeries],
  };

  return {
    skylineAvailable,
    card: {
      id: "personnel-groups",
      title: comparing ? "Evolución mensual por ejercicio" : "Evolución mensual por grupo",
      subtitle: period,
      option:
        months.length === 0 || rows.length === 0
          ? null
          : skyline
            ? skylineOption(rows, labels, depthLabel)
            : flat,
      table,
      note: comparing
        ? "Comparando ejercicios la tabla del comparativo suelta los meses; aquí siguen en el eje."
        : undefined,
      guide: GUIDE_GROUPS,
      height: skyline ? GROUPS_HEIGHT_3D : GROUPS_HEIGHT,
    },
  };
}

/**
 * The evolution in three dimensions: **mes × entidad × monto**.
 *
 * It is the same reading with the depth axis freed: the stack measures each band from wherever the one
 * below it ended, so a group's own trajectory is never a straight comparison; here every entity sits
 * on its own row of the floor and its six months are read left to right without subtracting anything.
 *
 * What it gives up is the month's TOTAL, which the stack states by its height and the line by its
 * shape. That is why this is a second shape of one card and not a card of its own: the two answer
 * different halves of the same question and the reader picks the half they need.
 *
 * It is drawn on THE STAGE, and the three decisions that keep it a reading and not an effect are the
 * other two skylines' (`lib/sales/cards.ts`, `lib/revenue/cards/skyline.ts`) same three:
 *
 * - **One rig, and it is what draws the EDGE.** Flat shading was the first rule here, on the reasoning
 *   that a lit face turns one colour into three. On a white card that was right; on this one it left
 *   the rows reading as a single continuous surface, because `bar3D` renders one merged mesh and has
 *   no border to fall back on. `CHART_STAGE_LIGHT` models the solid without repainting it.
 * - **The figure goes on the HOVERED bar**, through the app's own formatter — left alone gl writes the
 *   raw datum, which is how an amount reaches the screen as «144277.59000000001».
 * - **A bar takes little more than HALF its cell.** What it leaves is the gap, and in perspective the
 *   side face of the nearer bar eats most of it: at two thirds the rows closed up again.
 */
function skylineOption(
  rows: readonly EvolutionRow[],
  labels: readonly string[],
  depthLabel: string,
): Chart3DOption {
  // **The tallest goes at the BACK** — for groups and sections, which is the only thing that makes
  // a matrix of bars in perspective legible: a bar hides whatever is behind it, so with the tallest
  // in front it covers the rest whole. What decides that is the PEAK and never the total: occlusion
  // is a fact about heights, and an exercise loaded to June totals more than one loaded to January
  // and can still have every month shorter than it.
  //
  // **The EXERCISES are the exception: they go in ORDER**, the oldest at the back and the most recent
  // in front. Sorted by height the depth axis read «2026 · 2024 · 2025», and a reader looks for a
  // year by its position — the occlusion that sort spared costs more than it saves. `rows` arrive
  // chronological from `derive.ts`. The COLOUR and the legend keep their own order either way, so an
  // entity's identity does not move with the camera.
  const ordered =
    depthLabel === "Ejercicio"
      ? [...rows]
      : [...rows].sort((a, b) => peakOf(b.values) - peakOf(a.values));
  const depthOf = (index: number) => ordered.length - 1 - index;
  const names = ordered.map((row) => row.name);

  // The box FILLS the card: sized smaller it sat in the middle third of a wide one, and that empty
  // space is no longer white paper but night. The floor of the clamp keeps a three-month span from
  // collapsing into a sliver.
  const boxWidth = clamp(labels.length * 19, 120, 235);
  const boxDepth = clamp(names.length * 17, 34, 95);
  // A bar takes little more than HALF its cell, and what it leaves is what separates one row from the
  // next. It was two thirds, and that gap closed up in perspective: what is seen between two bars is
  // not the gap but its projection. Shading draws a bar's body; the gap draws that there are TWO.
  const barSize: [number, number] = [
    (boxWidth / Math.max(labels.length, 1)) * 0.52,
    (boxDepth / Math.max(names.length, 1)) * 0.52,
  ];

  const series: Chart3DSeries[] = ordered.map((row, index) => ({
    type: "bar3D",
    id: `skyline-${row.id}`,
    name: row.name,
    shading: "realistic",
    realisticMaterial: CHART_STAGE_MATERIAL,
    // The entity's colour ON THE STAGE, which is its own scale: `stageColor` translates by SLOT, so a
    // group is the same hue in every 3D card of the app — though not the one it wears on the white
    // ones, where the scale was measured against a different ground.
    itemStyle: { color: stageColor(row.color) },
    // The bevel is the EDGE's surface: `CHART_STAGE_LIGHT`'s highlight has to land on something, and a
    // chamfer of a hair is a line one pixel wide that catches nothing. Wider than this and it starts
    // eating the height of the short bars, which are the ones this shape exists to make legible.
    bevelSize: 0.2,
    bevelSmoothness: 2,
    // A real zero still gets a tile: it is a figure the file asserted, and it has to be tellable apart
    // from the empty floor of a month that never arrived.
    minHeight: 1.2,
    barSize,
    emphasis: {
      // NO `itemStyle` here, and that is the fix and not an omission: a `bar3D` is one merged mesh with
      // vertex colours, so gl reads only `color`/`opacity` and silently ignored the border this used to
      // declare. Left alone it lifts the fill itself — the same hue, plainly brighter, which is what a
      // hover is for.
      //
      // What the hover DOES say is the amount, through the same formatter as every other figure of the
      // app: gl writes the raw datum otherwise, and it is drawn on the stage's own panel.
      label: {
        show: true,
        formatter: (param) => moneyExact(param.value[2]),
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
    data: row.values.flatMap((value, month) =>
      value === null ? [] : [{ value: [month, depthOf(index), value] as [number, number, number] }],
    ),
  }));

  return {
    animationDuration: 320,
    textStyle: { fontFamily: CHART_FONT },
    // On the stage the legend goes to the TOP. The camera looks DOWN at the box, so the reading hangs
    // low in the frame and the empty sky is above it: anchored at the bottom it sat ON the last months
    // of the axis.
    legend: {
      ...legendFor(true),
      bottom: "auto",
      top: 6,
      textStyle: { color: CHART_STAGE.inkMuted, fontSize: 11.5 },
    },
    grid3D: {
      boxWidth,
      boxDepth,
      boxHeight: 82,
      // THE STAGE. `gl`'s own default is a pale gradient, and on it a bar had nothing but its own fill
      // to be found by: the short ones washed out and the tall ones read as holes in the card. The sky
      // lightens upward, so what is behind the BARS is its deepest end.
      environment: CHART_STAGE_SKY,
      light: CHART_STAGE_LIGHT,
      axisLine: { lineStyle: { color: CHART_STAGE.axis, width: 1, type: "solid" } },
      splitLine: { lineStyle: { color: CHART_STAGE.grid, width: 1, type: "solid" } },
      axisPointer: { show: false },
      viewControl: {
        // It opens STILL, from above and slightly off to one side. Below the mid thirties the front
        // face of a bar covers the gap that separates its row from the next; well above it the drawing
        // turns into a plan and the heights stop being heights. `beta` stays small so the months run
        // left to right, which is the direction a year is read in.
        alpha: 38,
        beta: 12,
        // The other half of `boxWidth`, and measured against it: a bigger box seen from further away is
        // the same picture, so the camera backs off exactly enough for the widest box to still fit.
        distance: 196,
        minDistance: 130,
        maxDistance: 330,
        // Panning is off: the box is the whole reading, and dragging it out of frame has no way back.
        panSensitivity: 0,
        rotateSensitivity: 1,
        zoomSensitivity: 1,
        damping: 0.85,
        animation: false,
      },
    },
    xAxis3D: categoryAxis3D([...labels]),
    yAxis3D: categoryAxis3D([...names].reverse(), { truncate: 18 }),
    zAxis3D: {
      type: "value",
      name: "",
      axisLine: { lineStyle: { color: CHART_STAGE.axis, width: 1, type: "solid" } },
      splitLine: { show: true, lineStyle: { color: CHART_STAGE.grid, width: 1, type: "solid" } },
      axisLabel: {
        color: CHART_STAGE.inkFaint,
        fontSize: 10.5,
        formatter: (value) => money(Number(value)),
      },
    },
    tooltip: {
      // The card's tooltip, in the stage's tones: it is drawn INSIDE the dark panel, and the white box
      // the other three cards use would be a hole punched in the night.
      trigger: "item",
      backgroundColor: CHART_STAGE.panel,
      borderColor: CHART_STAGE.panelBorder,
      borderWidth: 1,
      padding: [8, 10],
      textStyle: { color: CHART_STAGE.ink, fontSize: 12 },
      confine: true,
      formatter: (param: Chart3DParam) => {
        // The month comes from the datum's own X INDEX and not from `param.name`: in a 3D chart that
        // field carries the SERIES, and the reader hovering a bar is asking which month it is.
        const head = labels[param.value[0]] ?? "";
        return (
          `<div style="font-weight:600;margin-bottom:4px">${head}</div>` +
          `<div>${param.marker ?? ""} ${depthLabel} ${param.seriesName ?? ""}: ` +
          `<b>${moneyExact(param.value[2])}</b></div>`
        );
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
    // `echarts-gl` labels the axes «X», «Y» and «Z» unless told otherwise, and those three letters
    // mean nothing to someone reading months and groups: the EXPLICIT empty is what removes them.
    name: "",
    axisLine: { lineStyle: { color: CHART_LINES.axis, width: 1, type: "solid" } },
    axisTick: { show: false },
    splitLine: { show: false },
    axisLabel: {
      color: CHART_INK.muted,
      fontSize: 10.5,
      // `width`/`overflow` are a 2D grid's tools and the 3D one ignores them, so the cut is made here,
      // in the string. The legend and the tooltip carry the name whole.
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

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

// ---------------------------------------------------------------------------
// 4 · Composición por concepto
// ---------------------------------------------------------------------------

interface ConceptTotal {
  id: string;
  label: string;
  total: number;
}

/** Every concept in scope, summed across the marked years, largest first and zeros dropped. */
function conceptTotals(input: PersonnelCardsInput): ConceptTotal[] {
  const marked = new Set(input.groups);
  const totals = new Map<string, ConceptTotal>();
  const add = (id: string, label: string, total: number) => {
    const current = totals.get(id);
    totals.set(id, { id, label, total: (current?.total ?? 0) + total });
  };
  for (const year of input.reading.years) {
    for (const group of year.groups) {
      if (marked.size > 0 && !marked.has(group.group.id)) {
        continue;
      }
      for (const row of group.rows) {
        add(row.concept.id, row.concept.label, row.total);
      }
    }
    // The typed lines are NOT narrowed by «Grupo»: a legacy exercise has no groups, so a mark that
    // means nothing for it must not make it disappear — the grid's same rule.
    for (const row of year.legacyRows) {
      add(`legacy:${row.row.id}`, row.row.label, row.total);
    }
  }
  return [...totals.values()]
    .filter((entry) => entry.total !== 0)
    .sort((a, b) => b.total - a.total);
}

function buildConceptsCard(input: PersonnelCardsInput): ChartCardSpec<ChartOption | Chart3DOption> {
  const { period } = input;
  const all = conceptTotals(input);
  const grandTotal = all.reduce((sum, entry) => sum + entry.total, 0);
  const drawn = all.slice(0, CONCEPT_SLICES);
  const tail = all.slice(CONCEPT_SLICES);
  const tailTotal = tail.reduce((sum, entry) => sum + entry.total, 0);

  // The tail is FOLDED and never truncated: a chart whose bars do not add up to the total it is a
  // breakdown of is exactly what makes a figure untrustworthy. The table twin lists every concept.
  const bars = [
    ...drawn,
    ...(tail.length > 0
      ? [{ id: "resto", label: `Otros ${tail.length} conceptos`, total: tailTotal }]
      : []),
  ];

  const option: ChartOption | null =
    bars.length === 0
      ? null
      : {
          animationDuration: 300,
          textStyle: { fontFamily: CHART_FONT },
          grid: { left: 8, right: 90, top: 6, bottom: 6, outerBoundsMode: "same" },
          // Inverted so the largest sits on TOP, which is where a ranking is read from.
          yAxis: categoryAxis(
            bars.map((entry) => entry.label),
            { inverse: true },
          ),
          xAxis: valueAxis(money),
          legend: legendFor(false),
          tooltip: itemTooltip(
            (param) =>
              `<div style="font-weight:600;margin-bottom:4px">${param.name}</div>` +
              `<div><b>${moneyExact(Number(param.value))}</b> · ${
                shareOf(Number(param.value), grandTotal) === null
                  ? "—"
                  : percent(shareOf(Number(param.value), grandTotal) as number)
              } del costo</div>`,
          ),
          series: [
            {
              id: "concepts",
              type: "bar",
              data: bars.map((entry, index) => ({
                value: entry.total,
                itemStyle: {
                  // The head of the ranking takes the saturated slice sequence; the folded tail is
                  // NEUTRAL, because it is not one entity and must not read as the ninth.
                  color: entry.id === "resto" ? CHART_NEUTRAL : colorForSliceSlot(index),
                  borderRadius: ROUND_RIGHT,
                },
              })),
              barMaxWidth: 22,
              label: {
                show: true,
                position: "right",
                distance: 8,
                color: CHART_INK.muted,
                fontSize: 11,
                fontWeight: 600,
                formatter: (param) => money(Number(param.value)),
              },
              labelLayout: { hideOverlap: true },
            },
          ],
        };

  const rows: ChartTableRow[] = all.map((entry, index) => ({
    id: entry.id,
    label: entry.label,
    color: index < CONCEPT_SLICES ? colorForSliceSlot(index) : undefined,
    values: [moneyExact(entry.total), cell(shareOf(entry.total, grandTotal), percent)],
  }));
  if (rows.length > 0) {
    rows.push({
      id: "total",
      label: "Total costo de personal",
      emphasis: true,
      values: [moneyExact(grandTotal), percent(100)],
    });
  }

  // The ranking standing up is `solid-bars`' own case: ONE row, and the colour belongs to the COLUMN
  // because there it is the concept's identity and not the row's. Translated by slot, so a concept is
  // the same hue here and in every other 3D card.
  const solid = solidBody(
    bars.map((entry) => entry.label),
    [
      {
        id: "concepts",
        name: "Conceptos",
        color: stageSliceColor(colorForSliceSlot(0)),
        values: bars.map((entry) => entry.total),
      },
    ],
    { value: moneyExact, axis: money },
    {
      colors: bars.map((entry, index) =>
        entry.id === "resto"
          ? stageColor(CHART_NEUTRAL)
          : stageSliceColor(colorForSliceSlot(index)),
      ),
    },
  );
  const asSolid = standing(input.solidViews?.concepts, solid);

  return {
    id: "personnel-concepts",
    title: "Composición por concepto",
    subtitle: period,
    option: asSolid ? solid : option,
    table: { columns: ["Monto", "% del costo"], rows },
    note: sentence(
      tail.length > 0
        ? `${tail.length} conceptos más suman ${moneyExact(tailTotal)} y se dibujan en una sola barra; la tabla los lista todos.`
        : undefined,
      asSolid,
    ),
    guide: GUIDE_CONCEPTS,
    height: asSolid ? SOLID_BARS_HEIGHT : CONCEPTS_HEIGHT,
  };
}

export function buildPersonnelCards(input: PersonnelCardsInput): PersonnelCards {
  const groups = buildGroupsCard(input);
  return {
    sections: buildSectionsCard(input),
    ratio: buildRatioCard(input),
    groups: groups.card,
    concepts: buildConceptsCard(input),
    skylineAvailable: groups.skylineAvailable,
  };
}
