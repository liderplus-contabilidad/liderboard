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
  CHART_INK,
  CHART_LINES,
  CHART_MARK,
  CHART_NEUTRAL,
  CHART_SURFACE,
  colorForEntity,
  colorForSliceSlot,
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
}

export interface PersonnelCards {
  sections: ChartCardSpec;
  ratio: ChartCardSpec;
  /** The only card that can come out in three dimensions — hence the widened option type. */
  groups: ChartCardSpec<ChartOption | Chart3DOption>;
  concepts: ChartCardSpec;
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

function valueAxis(unit: (value: number) => string): ChartAxis {
  return {
    type: "value",
    axisLine: { show: false },
    axisTick: { show: false },
    splitLine: { show: true, lineStyle: { color: CHART_LINES.grid, width: 1, type: "solid" } },
    axisLabel: { color: CHART_INK.faint, fontSize: 11, formatter: (value) => unit(Number(value)) },
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

function legendFor(show: boolean): ChartLegend {
  return {
    show,
    type: "scroll",
    bottom: 0,
    icon: "roundRect",
    itemWidth: 10,
    itemHeight: 10,
    itemGap: 14,
    textStyle: { color: CHART_INK.muted, fontSize: 11.5 },
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

function axisTooltip(unit: (value: number) => string): ChartTooltip {
  return {
    trigger: "axis",
    ...TOOLTIP_CHROME,
    axisPointer: { type: "shadow", lineStyle: { color: CHART_LINES.axis, width: 1 } },
    formatter: (params) => {
      const rows = Array.isArray(params) ? params : [params];
      const head = rows[0]?.name ?? "";
      // A slot with no figure is OMITTED instead of saying `$0.00` — the grid's same rule.
      const body = rows
        .filter((row) => row.value !== null && row.value !== undefined)
        .map(
          (row) =>
            `<div>${row.marker ?? ""} ${row.seriesName ?? ""}: <b>${unit(Number(row.value))}</b></div>`,
        )
        .join("");
      return `<div style="font-weight:600;margin-bottom:4px">${head}</div>${
        body || `<div style="color:${CHART_INK.muted}">Sin cargar</div>`
      }`;
    },
  };
}

function itemTooltip(formatter: (param: ChartParam) => string): ChartTooltip {
  return {
    trigger: "item",
    ...TOOLTIP_CHROME,
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

// ---------------------------------------------------------------------------
// 1 · Planta vs Externos
// ---------------------------------------------------------------------------

function buildSectionsCard(input: PersonnelCardsInput): ChartCardSpec {
  const { reading, period } = input;
  const years = reading.years.filter((year) => year.covered);
  const comparing = years.length > 1;
  // ONE year puts the months on the axis; several put the exercises. What the reader compares is what
  // they marked, and no control chooses between the two.
  const categories = comparing
    ? years.map((year) => String(year.year))
    : (years[0]?.months ?? []).map((month) => MONTHS_SHORT_ES[month]);

  const series: ChartSeries[] = PERSONNEL_SECTIONS.map((section, index, all) => {
    const data = comparing
      ? years.map(
          (year) => year.sections.find((entry) => entry.section.id === section.id)?.total ?? null,
        )
      : (years[0]?.months ?? []).map(
          (month) =>
            years[0]?.sections.find((entry) => entry.section.id === section.id)?.monthly[month] ??
            null,
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

  const table: ChartTable = {
    // `columns` nombra sólo las columnas de VALORES: la de la etiqueta la encabeza `ChartCard`
    // («Serie»), y anteponerla aquí corría toda la fila una posición.
    columns: [...PERSONNEL_SECTIONS.map((s) => s.label), "Total"],
    rows: categories.map((label, index) => ({
      id: `sections-${label}`,
      label,
      values: [
        ...PERSONNEL_SECTIONS.map((section) => {
          const found = series.find((entry) => entry.id === `section-${section.id}`);
          return cell((found?.data[index] as number | null) ?? null, moneyExact);
        }),
        cell(
          series.reduce<number | null>((sum, entry) => {
            const value = entry.data[index] as number | null;
            return value === null ? sum : (sum ?? 0) + value;
          }, null),
          moneyExact,
        ),
      ],
    })),
  };

  const planta = reading.sections.find((entry) => entry.section.id === "planta");
  const externos = reading.sections.find((entry) => entry.section.id === "externos");

  return {
    id: "personnel-sections",
    title: "Planta vs Externos",
    subtitle: period,
    option:
      categories.length === 0
        ? null
        : {
            animationDuration: 300,
            textStyle: { fontFamily: CHART_FONT },
            grid: { left: 8, right: 12, top: 12, bottom: 34, outerBoundsMode: "same" },
            xAxis: categoryAxis(categories),
            yAxis: valueAxis(money),
            legend: legendFor(true),
            tooltip: axisTooltip(moneyExact),
            series,
          },
    table,
    note:
      planta && externos
        ? `Sobre ventas: planta ${planta.share === null ? "—" : percent(planta.share)}, externos ${
            externos.share === null ? "—" : percent(externos.share)
          }.`
        : undefined,
    guide: GUIDE_SECTIONS,
    height: SECTIONS_HEIGHT,
  };
}

// ---------------------------------------------------------------------------
// 2 · Costo de personal vs ventas
// ---------------------------------------------------------------------------

function buildRatioCard(input: PersonnelCardsInput): ChartCardSpec {
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

  const series: ChartSeries[] = years.map((year) => ({
    id: `ratio-${year.year}`,
    type: "line",
    name: String(year.year),
    data: months.map((month) => ratioAt(year, month)),
    smooth: false,
    symbol: "circle",
    symbolSize: CHART_MARK.symbolSize,
    lineStyle: { color: yearColor(year.year, order), width: CHART_MARK.lineWidth },
    itemStyle: { color: yearColor(year.year, order) },
    emphasis: { focus: "series" },
  }));

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

  return {
    id: "personnel-ratio",
    title: "Costo de personal vs ventas",
    subtitle: period,
    option:
      months.length === 0
        ? null
        : {
            animationDuration: 300,
            textStyle: { fontFamily: CHART_FONT },
            grid: { left: 8, right: 12, top: 12, bottom: 34, outerBoundsMode: "same" },
            xAxis: categoryAxis(months.map((month) => MONTHS_SHORT_ES[month])),
            yAxis: valueAxis(percent),
            legend: legendFor(years.length > 1),
            tooltip: axisTooltip(percent),
            series,
          },
    table,
    note:
      reading.share === null
        ? undefined
        : `En el tramo completo: ${percent(reading.share)} de ${moneyExact(reading.revenue)} facturados.`,
    guide: GUIDE_REVENUE_RATIO,
    height: RATIO_HEIGHT,
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

  /**
   * The total's LINE over the stack — PyG's `stackedTotalOption` same mark, in ink and not in a
   * palette slot, because it is not a fourth entity of the comparison.
   *
   * Unlike over there it IS the stack's ceiling, since every group is a positive cost. It earns its
   * place anyway, and for the reason the reader gave: a ceiling is not a TRAJECTORY. The eye follows a
   * coloured band, not the top edge of six separate bars, so «subió o bajó» costs a comparison of
   * heights across gaps. The line answers it without one.
   */
  const totalSeries: ChartSeries = {
    id: "evolution-total",
    type: "line",
    name: "Total",
    data: totals,
    lineStyle: { color: CHART_INK.strong, width: CHART_MARK.lineWidth, type: "solid" },
    itemStyle: { color: CHART_INK.strong },
    symbol: "circle",
    symbolSize: CHART_MARK.symbolSize,
    smooth: false,
    // Over the bars, never under: a line hidden behind the stack it measures is a line that is not
    // there.
    z: 3,
  };

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
    grid: { left: 8, right: 12, top: 12, bottom: 34, outerBoundsMode: "same" },
    xAxis: categoryAxis(labels),
    yAxis: valueAxis(money),
    legend: legendFor(true),
    tooltip: axisTooltip(moneyExact),
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
 */
function skylineOption(
  rows: readonly EvolutionRow[],
  labels: readonly string[],
  depthLabel: string,
): Chart3DOption {
  // **The LARGEST goes at the back**, which is the only thing that makes a matrix of bars in
  // perspective legible: a bar hides whatever is behind it, so with the largest in front it covers
  // the rest whole. Inverted, a short bar never reaches the one behind it. The COLOUR does not move —
  // it stays the entity's, so a group is the same hue here and in the other cards.
  const ordered = [...rows].sort((a, b) => total(b) - total(a));
  const depthOf = (index: number) => ordered.length - 1 - index;
  const names = ordered.map((row) => row.name);

  const boxWidth = clamp(labels.length * 17, 90, 210);
  const boxDepth = clamp(names.length * 20, 34, 95);
  // A bar takes TWO THIRDS of its cell, and the third it leaves is what separates one row from the
  // next: cell-to-cell the rows touch and read as a single continuous surface, which is exactly what
  // this drawing exists not to be.
  const barSize: [number, number] = [
    (boxWidth / Math.max(labels.length, 1)) * 0.66,
    (boxDepth / Math.max(names.length, 1)) * 0.66,
  ];

  const series: Chart3DSeries[] = ordered.map((row, index) => ({
    type: "bar3D",
    id: `skyline-${row.id}`,
    name: row.name,
    shading: "color",
    itemStyle: { color: row.color },
    bevelSize: 0.12,
    bevelSmoothness: 2,
    // A real zero still gets a tile: it is a figure the file asserted, and it has to be tellable apart
    // from the empty floor of a month that never arrived.
    minHeight: 1.2,
    barSize,
    emphasis: { itemStyle: { borderColor: CHART_INK.strong, borderWidth: 1 } },
    data: row.values.flatMap((value, month) =>
      value === null ? [] : [{ value: [month, depthOf(index), value] as [number, number, number] }],
    ),
  }));

  return {
    animationDuration: 320,
    textStyle: { fontFamily: CHART_FONT },
    legend: legendFor(true),
    grid3D: {
      boxWidth,
      boxDepth,
      boxHeight: 82,
      // The card's own surface: the default paints a gradient, which shows as a seam against a white
      // card and puts a colour behind the bars that no token accounts for.
      environment: CHART_SURFACE,
      // Ambient only. With a main light the renderer multiplies each face by its angle to it and one
      // bar comes out in three tones, which is precisely what `colorForEntity`'s identity cannot
      // survive.
      light: { main: { intensity: 0, shadow: false }, ambient: { intensity: 1 } },
      axisLine: { lineStyle: { color: CHART_LINES.axis, width: 1, type: "solid" } },
      splitLine: { lineStyle: { color: CHART_LINES.grid, width: 1, type: "solid" } },
      axisPointer: { show: false },
      viewControl: {
        // It opens STILL, from above and slightly off to one side. Below the mid thirties the front
        // face of a bar covers the gap that separates its row from the next; well above it the drawing
        // turns into a plan and the heights stop being heights. `beta` stays small so the months run
        // left to right, which is the direction a year is read in.
        alpha: 38,
        beta: 12,
        distance: 195,
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
      axisLine: { lineStyle: { color: CHART_LINES.axis, width: 1, type: "solid" } },
      splitLine: { show: true, lineStyle: { color: CHART_LINES.grid, width: 1, type: "solid" } },
      axisLabel: {
        color: CHART_INK.faint,
        fontSize: 10.5,
        formatter: (value) => money(Number(value)),
      },
    },
    tooltip: {
      trigger: "item",
      backgroundColor: CHART_SURFACE,
      borderColor: CHART_LINES.axis,
      borderWidth: 1,
      padding: [8, 10],
      textStyle: { color: CHART_INK.strong, fontSize: 12 },
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

function total(row: EvolutionRow): number {
  return row.values.reduce<number>((sum, value) => sum + (value ?? 0), 0);
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
  for (const year of input.reading.years) {
    for (const group of year.groups) {
      if (marked.size > 0 && !marked.has(group.group.id)) {
        continue;
      }
      for (const row of group.rows) {
        const current = totals.get(row.concept.id);
        totals.set(row.concept.id, {
          id: row.concept.id,
          label: row.concept.label,
          total: (current?.total ?? 0) + row.total,
        });
      }
    }
  }
  return [...totals.values()]
    .filter((entry) => entry.total !== 0)
    .sort((a, b) => b.total - a.total);
}

function buildConceptsCard(input: PersonnelCardsInput): ChartCardSpec {
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

  return {
    id: "personnel-concepts",
    title: "Composición por concepto",
    subtitle: period,
    option,
    table: { columns: ["Monto", "% del costo"], rows },
    note:
      tail.length > 0
        ? `${tail.length} conceptos más suman ${moneyExact(tailTotal)} y se dibujan en una sola barra; la tabla los lista todos.`
        : undefined,
    guide: GUIDE_CONCEPTS,
    height: CONCEPTS_HEIGHT,
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
