/**
 * 1 · **Comparativo de ventas por año** — the months on the axis, the years as the series.
 *
 * It computes no figure of its own: `derive.ts` reads the years and this file decides only how they
 * are drawn and written.
 */
import { CHART_MARK, CHART_MAX_SERIES, colorForPeriod } from "@/lib/charts/palette";
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
  legendFor,
  money,
  moneyOrDash,
  ROUND_TOP,
  yearColor,
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
 * **Two shapes, and the number of MARKED YEARS chooses it — there is no control.**
 *
 * With ONE year the axis already carries the month under every bar, so identity is not the colour's
 * job: `colorForPeriod` does its only job, keeping twelve bars from being a wall of one tone. With
 * SEVERAL, a year is a TRAJECTORY and is drawn as a line — with five years, grouped bars would be
 * sixty bars.
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

  const series: ChartSeries[] = comparing
    ? drawn.map((entry) => ({
        id: `year-${entry.year}`,
        name: String(entry.year),
        type: "line" as const,
        data: axis.map((month) => entry.monthly[month]),
        itemStyle: { color: yearColor(entry.year, drawnYears) },
        lineStyle: { color: yearColor(entry.year, drawnYears), width: CHART_MARK.lineWidth },
        symbol: "circle",
        symbolSize: CHART_MARK.symbolSize,
        // Straight, never `smooth`: a curve invents values between two months nobody measured. And a
        // gap BREAKS the line, which is right — joining July with December would draw the months in
        // between.
        smooth: false,
      }))
    : drawn.map((entry) => ({
        id: `year-${entry.year}`,
        name: String(entry.year),
        type: "bar" as const,
        data: axis.map((month) => {
          const value = entry.monthly[month];
          return value === null
            ? { value: null }
            : // The DECORATIVE slot is taken from the month itself and not from its place on the
              // axis, so April keeps its tone whichever span is being looked at.
              { value, itemStyle: { color: colorForPeriod(month), borderRadius: ROUND_TOP } };
        }),
        barMaxWidth: CHART_MARK.barMaxWidth,
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
          ...baseOption(categoryAxis(labels), currencyAxis(), legendFor(comparing)),
          tooltip: axisTooltip(money),
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
