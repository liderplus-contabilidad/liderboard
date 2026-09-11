/**
 * 1 · **Comparativo de ventas por año** — the months on the axis, the years as the series.
 *
 * It computes no figure of its own: `derive.ts` reads the years and this file decides only how they
 * are drawn and written.
 */
import {
  CHART_GROUND,
  CHART_MARK,
  CHART_MAX_SERIES,
  CHART_TRAJECTORY_GROUND,
  stageColor,
} from "@/lib/charts/palette";
import { seriesRunTooltip, tooltipMarker } from "@/lib/charts/tooltip";
import { is3DOption } from "@/lib/charts/types";
import type {
  Chart3DOption,
  ChartCardSpec,
  ChartOption,
  ChartSeries,
  ChartTable,
  ChartTableRow,
} from "@/lib/charts/types";
import { MONTHS_FULL_ES, MONTHS_SHORT_ES } from "@/lib/date";
import { readRevenueYears, type RevenueYearReading } from "../derive";
import { GUIDE_REVENUE_COMPARISON } from "../guides";
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
  itemTooltip,
  moneyOrDash,
  yearColor,
  type Ground,
} from "./chrome";
import { skylineOption, SKYLINE_HEIGHT } from "./skyline";

/**
 * «Ver como» on the comparison — flat, or the year given its own axis in three dimensions.
 *
 * `skyline` exists for ONE reason, the same one it exists for in «Ventas por servicio»: with several
 * years drawn as lines on a single plane, the year that reads best is the one on top and the rest are
 * read against it. Given a depth axis, EVERY year rests on zero, so a month of 2024 is comparable
 * against the same month of 2026 and not merely against the line above it.
 */
export type ComparisonShape = "plano" | "skyline";

/** The pure layer's default stays FLAT so the printed report cannot inherit a canvas by omission —
 *  `SCREEN_EVOLUTION_VIEW`'s same precaution. The screen opts into the skyline explicitly. */
export const DEFAULT_COMPARISON_SHAPE: ComparisonShape = "plano";

export const COMPARISON_CARD_ID = "comparativo";

/**
 * **A year is a TRAJECTORY and is drawn as a line — one year or several, and no control.**
 *
 * One year used to be twelve bars in the decorative scale, and the card changed shape under the
 * reader when the marks went from two years to one. It is one reading with one mark: what the count
 * of years decides is only what is WRITTEN — with ONE year every point carries its figure, with
 * several none does (see `series`).
 *
 * The chart cuts at `CHART_MAX_SERIES` and says so in `warnings`; the table twin lists every marked
 * year, which is what makes the cut safe: nothing marked ever loses its figure.
 */
export function buildComparisonCard(
  input: RevenueCardsInput,
  shape: ComparisonShape = DEFAULT_COMPARISON_SHAPE,
): ChartCardSpec<ChartOption | Chart3DOption> {
  const readings = readRevenueYears(input.years, input.months);
  const axis = [...input.months].sort((a, b) => a - b);
  const labels = axis.map((month) => MONTHS_SHORT_ES[month]);
  const warnings: string[] = [];

  // The most recent ones are kept: a ninth colour would land on top of one already used, and the
  // years a firm reads are the last ones.
  const drawn = readings.slice(-CHART_MAX_SERIES);
  if (readings.length > drawn.length) {
    const omitted = readings.slice(0, readings.length - drawn.length).map((entry) => entry.year);
    warnings.push(
      `El gráfico dibuja ${CHART_MAX_SERIES} años; ${omitted.join(", ")} ${
        omitted.length === 1 ? "queda" : "quedan"
      } fuera. La tabla los trae todos.`,
    );
  }

  const drawnYears = drawn.map((entry) => entry.year);
  const comparing = drawn.length > 1;

  /**
   * **The card stands on the STAGE**, with one year or several (`CHART_TRAJECTORY_GROUND`).
   *
   * With several years the reading is a bundle of two-pixel strokes over one plot, and on the white
   * card what tells one year from the next is its hue alone — a pale grid, a pale axis and four thin
   * lines were read as one tangle. On `CHART_STAGE`'s navy every line has an edge and every year is
   * found at a glance, which is the same reason the skyline stands on a sky: it is the SAME reading
   * in its two shapes, so «Ver como» does not flip the ground under the reader — and neither does
   * unmarking years down to one, which was the first rule here and read as a different card.
   *
   * The years wear `stageColor`'s translation, never the light scale: measured against the navy, two
   * of the eight identity slots fall under 3:1. It is the skyline's same slot-for-slot rule, so the
   * line of 2024 and its row in the 3D box are ONE colour — and the growth card, which draws on the
   * white, keeps the slot in the light scale. That is the trade `CHART_STAGE_PALETTE` declares.
   */
  const ground: Ground = CHART_TRAJECTORY_GROUND;
  const lineColor = (year: number) => stageColor(yearColor(year, drawnYears));

  /**
   * **With several years this card writes NO figure over its marks; with ONE it writes all twelve.**
   *
   * Comparing, what it answers is the SHAPE of a year — which months rise, which fall, how one year
   * runs above another — over an axis of twelve columns. Twelve amounts per year do not add a
   * reading to that: they cover the very trajectory being followed, and the trajectory is the whole
   * point of drawing months instead of tabulating them. The month's figure is a hover away in the
   * tooltip and always present in the table twin, which lists every marked year, not only the drawn
   * ones.
   *
   * Alone, a year has nothing to be read against but its own months, and the figure over each point
   * is what turns «abril subió» into «abril fue $337,092.91»: one row of twelve, in the ground's ink,
   * shaped by `fitDirectLabel` like every other figure of the module.
   *
   * **And it is read ONE LINE AT A TIME.** With several years the pointer follows a stroke, so the
   * tooltip answers for the YEAR under it — its run of months, the hovered one in bold — instead
   * of the column of six years under one month; and the line under the pointer comes forward while
   * the others blur (`emphasis.focus`), which is what lets a single year be picked out of the
   * bundle without unmarking the rest. `triggerEvent` is what makes the stroke itself answer,
   * not only its twelve dots. With ONE year the column tooltip stays: there is one figure per month
   * either way, and it is already written over the point.
   */
  const labelFit = fitDirectLabel(axis.length);
  const series: ChartSeries[] = drawn.map((entry) => ({
    id: `year-${entry.year}`,
    name: String(entry.year),
    type: "line" as const,
    data: axis.map((month) => entry.monthly[month]),
    itemStyle: { color: lineColor(entry.year) },
    lineStyle: { color: lineColor(entry.year), width: CHART_MARK.lineWidth },
    symbol: "circle",
    symbolSize: CHART_MARK.symbolSize,
    emphasis: { focus: "series" as const },
    triggerEvent: "line" as const,
    // Straight, never `smooth`: a curve invents values between two months nobody measured. And a
    // gap BREAKS the line, which is right — joining July with December would draw the months in
    // between.
    smooth: false,
    ...(comparing ? {} : directLabel(labelFit, { ground })),
  }));

  const covered = drawn.some((entry) => entry.covered);
  // The skyline needs a DEPTH axis, so it needs at least two years; with one there is nothing to put
  // behind anything and the control is not offered at all.
  const skyline = shape === "skyline" && comparing;

  const option: ChartOption | Chart3DOption | null = !covered
    ? null
    : skyline
      ? skylineOption(drawn, drawnYears, axis, labels)
      : {
          ...baseOption(
            categoryAxis(labels, undefined, ground),
            currencyAxis(ground),
            legendFor(comparing, CHART_GROUND[ground].inkMuted),
            // The row of figures a lone year writes is what the grid has to open room for at the top.
            comparing ? undefined : { rows: 1, fit: labelFit },
            ground,
          ),
          tooltip: comparing
            ? yearTooltip(drawn, axis, lineColor, ground)
            : axisTooltip(money, undefined, ground),
          series,
        };

  const note = comparisonNote(readings);

  return {
    id: COMPARISON_CARD_ID,
    title: "Comparativo de ventas por año",
    // `input.period` already carries the RESOLVED span and not the marks, which is why this reads
    // «Ene–Dic · 2024, 2025, 2026» with no month marked instead of naming only the years — see
    // `periodLabel`.
    subtitle: `${input.period} · ingresos del estado de resultados`,
    option,
    table: comparisonTable(readings, axis),
    ...(warnings.length > 0 ? { warnings } : {}),
    ...(note ? { note } : {}),
    guide: GUIDE_REVENUE_COMPARISON,
    height: skyline ? SKYLINE_HEIGHT : 280,
  };
}

/**
 * The line's box: the year as the head, its months as the body — the axis tooltip's same box with
 * the other reading in it (`seriesRunTooltip` says how it is laid out). A month not loaded is
 * OMITTED, never written as `$0.00` — the table's rule.
 */
function yearTooltip(
  drawn: readonly RevenueYearReading[],
  axis: readonly number[],
  lineColor: (year: number) => string,
  ground: Ground,
) {
  const tones = CHART_GROUND[ground];
  return itemTooltip((param) => {
    const entry = drawn.find((candidate) => `year-${candidate.year}` === param.seriesId);
    if (!entry) return "";
    const rows = axis
      .filter((month) => entry.monthly[month] !== null)
      .map((month) => ({
        label: MONTHS_SHORT_ES[month],
        figure: money(entry.monthly[month] as number),
      }));
    return seriesRunTooltip(
      `${tooltipMarker(lineColor(entry.year))}${entry.year}`,
      rows,
      param.name,
      tones.inkMuted,
    );
  }, ground);
}

/**
 * The comparison as PAPER and Excel can carry it: flat, always.
 *
 * Writing the check down rather than casting is the whole point — a 3D box is a WebGL canvas no
 * printed sheet renders and a camera nobody can press, so if the default is ever flipped this has to
 * fail HERE and loudly instead of printing an empty rectangle where the comparison was. It is
 * «Ventas por servicio»' same guard, and it never throws today.
 */
export function flatComparisonCard(input: RevenueCardsInput): ChartCardSpec {
  const card = buildComparisonCard(input, "plano");
  const option = card.option;
  if (option !== null && is3DOption(option)) {
    throw new Error("El comparativo se pidió plano y llegó en tres dimensiones.");
  }
  return { ...card, option };
}

/** Whether the comparison can be drawn in three dimensions: it needs a second year to be the depth. */
export function skylineAvailableFor(input: RevenueCardsInput): boolean {
  return readRevenueYears(input.years, input.months).filter((entry) => entry.covered).length > 1;
}

/** The matrix the workbook keeps as three sheets: months down, years across, with the two summary
 *  rows the firm reads at the bottom. */
function comparisonTable(
  readings: readonly RevenueYearReading[],
  axis: readonly number[],
): ChartTable {
  const rows: ChartTableRow[] = axis.map((month) => ({
    id: `mes-${month}`,
    label: MONTHS_FULL_ES[month],
    // No colour dot: here the rows are the CATEGORIES and the colour is carried by the columns, so a
    // dot would pair with something that does not exist.
    values: readings.map((entry) => moneyOrDash(entry.monthly[month])),
  }));

  return {
    columns: readings.map((entry) => String(entry.year)),
    rows: [
      ...rows,
      {
        id: "total",
        label: "Total ventas",
        emphasis: true,
        values: readings.map((entry) => (entry.covered ? money(entry.total) : null)),
      },
      {
        id: "promedio",
        label: "Promedio mensual",
        emphasis: true,
        // Rule (b) reaching the screen: the divisor is the loaded months, never twelve.
        values: readings.map((entry) => moneyOrDash(entry.average)),
      },
    ],
  };
}

/**
 * What the shape does not say on its own: which years are half-loaded, and that their average is
 * therefore over what arrived.
 *
 * It names the app's OWN figures. It deliberately does not quote the workbook's average, because the
 * app has no way of knowing it — a note that invented the number it claims to be correcting would be
 * the same defect it is warning about.
 */
function comparisonNote(readings: readonly RevenueYearReading[]): string | null {
  const partial = readings.filter((entry) => entry.covered && entry.loadedMonths.length < 12);
  const empty = readings.filter((entry) => !entry.covered);
  const parts: string[] = [];
  if (partial.length > 0) {
    parts.push(
      `${partial
        .map(
          (entry) =>
            `${entry.year} llega hasta ${MONTHS_FULL_ES[entry.loadedMonths[entry.loadedMonths.length - 1]].toLowerCase()}`,
        )
        .join("; ")}. El promedio divide entre los meses cargados, no entre doce.`,
    );
  }
  if (empty.length > 0) {
    parts.push(
      `${empty.map((entry) => entry.year).join(", ")} no tiene ningún mes cargado en el PyG: no dibuja y en la tabla lleva raya — no es un año en cero.`,
    );
  }
  return parts.length > 0 ? parts.join(" ") : null;
}
