/**
 * `Series[]` (or the engine's composition results) in, an ECharts option out. Every builder is
 * pure, so the rules that make a chart honest are testable without mounting a DOM:
 *
 * - A `null` point stays `null`. ECharts draws no mark for it and, with `connectNulls` off by
 *   default, no line crosses it either. Turning it into 0 would draw a collapse the file never
 *   recorded — the trap the whole coverage model exists to avoid.
 * - No builder returns two `yAxis`. The type forbids it (`ChartOption.yAxis` is one object),
 *   and the combo shares its single scale because bars and line are in the same unit.
 * - No builder writes a hex. Colors come from `colorOf`, strokes and ink from `lib/charts`.
 * - Amounts go through `formatCurrency` and periods through the engine's `periodLabel`; neither
 *   is re-implemented here.
 */
import {
  CHART_BAND,
  CHART_FONT,
  CHART_INK,
  CHART_LINES,
  CHART_MARK,
  CHART_PALETTE,
  CHART_SECTION,
  CHART_SIGN,
  CHART_SURFACE,
} from "@/lib/charts/palette";
export type { ChartTable, ChartTableRow } from "@/lib/charts/types";
import { sectionOf } from "../datos-sections";
import type {
  ChartAxis,
  ChartMarkArea,
  ChartMarkPoint,
  ChartTable,
  ChartLabel,
  ChartLegend,
  ChartOption,
  ChartParam,
  ChartSeries,
  ChartTooltip,
} from "@/lib/charts/types";
import { formatCurrency, formatNumber, formatPercent } from "@/lib/format";
import { periodLabel } from "../analytics/period";
import {
  OTHERS_CODE,
  toPctOfContainer,
  type AmountEntry,
  type ParetoResult,
  type PieResult,
} from "../analytics/structure";
import { seriesKeyId, type PeriodRef, type Series, type SeriesKey } from "../analytics/types";
import type { ChartType } from "./selection";
import type { MarkedShare } from "./share";
import { RESULT_CODE, type WaterfallStep } from "./waterfall";

/** What the Y values mean, which is all that changes between amounts, shares and indexes. */
export type ChartUnit = "moneda" | "porcentaje" | "indice";

/** Beyond four series a number per point stops being read and starts being texture. */
const MAX_DIRECT_LABELS = 4;

/**
 * And beyond this many MARKS — series × periods — the same thing happens for a different reason:
 * the count is fine but the room is not. Two series over twelve months is twenty-four amounts on
 * one axis, which at «$144,844» wide leaves them abutting rather than overlapping, so
 * `labelLayout.hideOverlap` never fires and the row prints as one run of digits. The shape is
 * what a chart is for; the figure to the cent is two pages away in the statement.
 */
const MAX_DIRECT_LABEL_MARKS = 14;

/** Whether a per-mark amount can still be read on this many series over this many points. */
function fitsDirectLabels(seriesCount: number, points: number): boolean {
  return seriesCount <= MAX_DIRECT_LABELS && seriesCount * points <= MAX_DIRECT_LABEL_MARKS;
}

/** Whether a per-mark amount can still be read on this many series over this many periods. */
function labelsFit(seriesCount: number, points: number, context: SeriesOptionContext): boolean {
  return (context.labels ?? true) && fitsDirectLabels(seriesCount, points);
}

/**
 * El porcentaje sobre la cuenta que la contiene tiene PRESUPUESTO PROPIO, y se mide contra las
 * barras que lo llevan y no contra todas. Un padre y una hija sobre doce meses son 24 marcas —
 * ninguna etiqueta cabe—, pero solo la hija lleva porcentaje, así que son 12 y sí caben: en el
 * año completo se lee el % de cada barra hija y ningún monto, y al acotar «Periodo» reaparece el
 * monto encima. Nada de lo que se veía antes deja de verse; esto solo añade.
 */
function sharesFit(sharedCount: number, points: number, context: SeriesOptionContext): boolean {
  return (
    (context.labels ?? true) &&
    sharedCount > 0 &&
    sharedCount <= MAX_DIRECT_LABELS &&
    sharedCount * points <= MAX_DIRECT_LABEL_MARKS
  );
}

/**
 * Dentro de una PILA el porcentaje no se mide contra el presupuesto de `sharesFit`, y por eso no
 * pasa por él: un apilado dibuja UNA columna por periodo, así que sus etiquetas se reparten en
 * vertical —cada una dentro de su propio trozo— y no hay elenco que las apriete de lado. Lo que
 * limita aquí es la ALTURA del segmento, que es su propio porcentaje: por debajo de este umbral el
 * número es más alto que el trozo que lo contiene, así que se apaga en vez de desbordarlo. El
 * tooltip lo sigue diciendo, que es donde no falta nunca.
 */
const MIN_STACK_LABEL_SHARE = 5;

/** Los porcentajes que un segmento imprime dentro de sí, ya podados los que no caben. */
function stackShares(
  series: Series,
  context: SeriesOptionContext,
): readonly (number | null)[] | undefined {
  const share = shareOf(series, context);
  if (!share || context.labels === false) {
    return undefined;
  }
  const legible = share.values.map((value) =>
    value !== null && Math.abs(value) >= MIN_STACK_LABEL_SHARE ? value : null,
  );
  return legible.some((value) => value !== null) ? legible : undefined;
}

/** Cuántas de las series dibujadas caen dentro de otra marcada — el elenco del presupuesto. */
function sharedCountOf(series: readonly Series[], context: SeriesOptionContext): number {
  return context.shares ? series.filter((entry) => shareOf(entry, context)).length : 0;
}

function shareOf(series: Series, context: SeriesOptionContext): MarkedShare | undefined {
  return context.shares?.get(seriesKeyId(series.key));
}

/** El fragmento de `rich` que pinta el porcentaje: una anotación bajo la cifra, no la cifra. */
const SHARE_RICH_KEY = "share";

/** Below two series there is nothing to tell apart, so the title carries the name. */
const MIN_LEGEND_SERIES = 2;

/** Charts whose X axis is the period. */
export interface SeriesOptionContext {
  /** The only way a series gets a color; comes from `colorResolver`. */
  colorOf: (key: SeriesKey) => string;
  periods: PeriodRef[];
  /** Adds the year to the period labels; only when the query spans several. */
  multiYear?: boolean;
  unit?: ChartUnit;
  /**
   * Draw the value on top of each mark. Default true. Set false for a dense single-series
   * evolution — twelve monthly labels overlap into texture, and the tooltip already reads a
   * bar on hover.
   */
  labels?: boolean;
  /**
   * Por `seriesKeyId`, el porcentaje que esa serie ocupa dentro de la cuenta marcada que la
   * contiene (`markedShares`). Ausente — que es el caso de casi toda la app — la etiqueta y el
   * tooltip salen exactamente como salían.
   */
  shares?: ReadonlyMap<string, MarkedShare>;
}

/** Charts whose axis is a set of accounts within one period. */
export interface EntryOptionContext {
  colorOf: (code: string) => string;
  unit?: ChartUnit;
}

/**
 * The single value formatter every label, tooltip and table twin goes through.
 *
 * Los importes llevan DOS DECIMALES, exactamente como la tabla de Datos —el mismo
 * `formatCurrency({ cents: true })`—, porque una cifra de un gráfico se coteja contra la hoja del
 * contador: `$204,045` frente a `204.045,51` obliga a preguntarse si lo que falta son centavos o
 * una carga incompleta, y esa duda cuesta más que el ancho que ocupa el `.51`.
 */
export function formatChartValue(value: number, unit: ChartUnit = "moneda"): string {
  switch (unit) {
    case "porcentaje":
      return formatPercent(value);
    case "indice":
      return formatNumber(Math.round(value * 10) / 10);
    default:
      return formatCurrency(value, { cents: true });
  }
}

/**
 * Lo mismo para las marcas del EJE, que es el único sitio donde el importe va SIN centavos.
 *
 * Un eje no es una cifra que nadie coteje: es la escala contra la que se estima el alto de una
 * barra, y seis rótulos de «$204,045.51» se comen el ancho que le queda al dibujo para decir algo
 * que el tooltip y la tabla ya dicen exacto. Es la regla que Ocupaciones ya tenía escrita en
 * `formatMetric` («right for an axis, wrong for a figure someone compares against their own
 * spreadsheet»), y la razón de que Datos no necesite este caso: una tabla no tiene eje.
 */
export function formatAxisValue(value: number, unit: ChartUnit = "moneda"): string {
  return unit === "moneda" ? formatCurrency(value) : formatChartValue(value, unit);
}

/** Vertical bars — one series is an evolution, several are a grouped comparison. */
export function barOption(series: Series[], context: SeriesOptionContext): ChartOption {
  const sharedCount = sharedCountOf(series, context);
  return {
    ...chrome(series.length),
    xAxis: periodAxis(context),
    yAxis: valueAxis(context.unit),
    tooltip: axisTooltip("shadow", context.unit, context, tooltipCodes(seriesCodes(series))),
    series: series.map((entry) => barSeries(entry, series.length, context, { sharedCount })),
  };
}

/** El nombre de la pila. Uno solo: todas las series se acumulan en la misma columna. */
const STACK_ID = "total";

/** El id de la línea del total, que la opción y su tabla gemela tienen que nombrar igual. */
function totalLineId(total: Series): string {
  return `${seriesKeyId(total.key)}|total`;
}

/** Stacked bars — what a total is made of, period by period. */
export function stackedOption(series: Series[], context: SeriesOptionContext): ChartOption {
  return {
    ...chrome(series.length),
    xAxis: periodAxis(context),
    yAxis: valueAxis(context.unit),
    tooltip: axisTooltip("shadow", context.unit, undefined, tooltipCodes(seriesCodes(series))),
    series: series.map((entry) => ({
      ...barSeries(entry, series.length, context, { stacked: true }),
      stack: STACK_ID,
    })),
  };
}

/**
 * El apilado de una cuenta con la LÍNEA de su total encima — de qué está hecha, periodo a
 * periodo. Un solo eje y una sola unidad, como el combo: la línea es una lectura de la misma
 * entidad, así que toma un tono de tinta y no una ranura de la paleta, que es identidad.
 *
 * La línea no es decorativa ni redundante con el techo de la pila. Una hija de saldo negativo
 * —`4.1.4 Rebajas y/o Descuentos` lo es— se apila hacia ABAJO, así que el neto no está en ningún
 * borde; y con la cola plegada en «Otros» sigue siendo el total de verdad. Es además lo único que
 * imprime un MONTO por columna: dentro de un segmento no cabe más que una cifra corta.
 *
 * Y por eso mismo apila SIN las costuras de 2 px que separan todo relleno contiguo en esta app:
 * una columna que ya declara su total es una sola cifra repartida, no varias puestas en fila.
 *
 * Esa cifra repartida es también la razón de que cada segmento imprima su PORCENTAJE dentro del
 * total (`distributionShares`, colgado del contexto como cualquier otro `shares`): el monto lo
 * dice la línea, una vez por columna, y lo que la pila añade es qué parte de él es cada hija —
 * leerlo restando montos a ojo es justo el trabajo que la tarjeta existe para ahorrar—. El
 * tooltip lo repite segmento a segmento y nombrando la base, que es donde sí cabe la frase entera.
 */
export function stackedTotalOption(
  series: Series[],
  total: Series,
  context: SeriesOptionContext,
): ChartOption {
  const totalId = totalLineId(total);
  return {
    ...chrome(series.length + 1),
    xAxis: periodAxis(context),
    yAxis: valueAxis(context.unit),
    tooltip: axisTooltip(
      "shadow",
      context.unit,
      context,
      tooltipCodes([...seriesCodes(series), [totalId, total.key.code]]),
    ),
    series: [
      ...series.map((entry) => ({
        ...barSeries(entry, series.length, context, {
          stacked: true,
          seamless: true,
          shares: stackShares(entry, context),
        }),
        stack: STACK_ID,
      })),
      {
        id: totalId,
        type: "line",
        name: total.label,
        data: total.points.map((point) => point.value),
        lineStyle: { color: CHART_INK.strong, width: CHART_MARK.lineWidth, type: "solid" },
        itemStyle: { color: CHART_INK.strong },
        symbol: "circle",
        symbolSize: CHART_MARK.symbolSize,
        smooth: false,
        // Se mide como UNA serie y no como la novena: es la única que lleva cifra, así que lo que
        // decide si cabe es su propio recuento de marcas, no el de la pila que hay debajo.
        label: directLabel(labelsFit(1, total.points.length, context), context.unit, "top"),
        labelLayout: { hideOverlap: true },
        z: 3,
      },
    ],
  };
}

/**
 * La tabla gemela del apilado: las hijas y, cerrando, el total en tinta y con peso. `emphasis` es
 * lo que separa un total de lo que totaliza cuando ambos son filas de la misma tabla.
 */
export function stackedTotalTable(
  series: Series[],
  total: Series,
  context: SeriesOptionContext,
): ChartTable {
  const table = seriesTable(series, context);
  return {
    columns: table.columns,
    rows: [
      ...table.rows,
      {
        id: totalLineId(total),
        label: total.label,
        color: CHART_INK.strong,
        emphasis: true,
        ...sublabelFor(total.key.code),
        values: total.points.map((point) =>
          point.value === null ? null : formatChartValue(point.value, context.unit),
        ),
      },
    ],
  };
}

/**
 * 100% stacked bars. The percentages come from `toPctOfContainer` — each account against the
 * parent the engine rolled up — and NOT from re-adding the visible series. Picking 3 of a
 * parent's 8 children therefore draws three shares that correctly fall short of 100.
 */
export function hundredPercentOption(series: Series[], context: SeriesOptionContext): ChartOption {
  // Ningún `sharedCount` ni contexto en el tooltip a propósito: aquí los valores YA son el
  // porcentaje sobre el contenedor, y anotar encima un segundo porcentaje del mismo contenedor
  // sería escribir «28.4 % · 100 % de Ingresos» sobre cada barra.
  const shares = hundredPercentSeries(series);
  return {
    ...chrome(shares.length),
    xAxis: periodAxis(context),
    yAxis: { ...valueAxis("porcentaje"), max: 100 },
    tooltip: axisTooltip("shadow", "porcentaje", undefined, tooltipCodes(seriesCodes(shares))),
    series: shares.map((entry) => ({
      ...barSeries(entry, shares.length, { ...context, unit: "porcentaje" }, { stacked: true }),
      stack: STACK_ID,
    })),
  };
}

/**
 * Una serie de un gráfico cuyo eje X son las CATEGORÍAS y no los periodos: un valor por categoría,
 * en el orden del eje. Es la forma que necesita una lectura donde lo comparado dentro de cada barra
 * son los meses o los centros, y no al revés.
 */
export interface CategorySeries {
  id: string;
  label: string;
  values: (number | null)[];
}

export interface CategoryOptionContext {
  colorOf: (id: string) => string;
  unit?: ChartUnit;
}

/**
 * Barras agrupadas con las CATEGORÍAS en el eje X — el eje girado.
 *
 * Existe porque una lectura de seis líneas de negocio sobre doce meses aplasta contra el eje a las
 * cinco que no son hospedaje: comparten grupo con una barra cien veces mayor y no tienen ni rótulo
 * propio ni sitio para su cifra. Girando el eje, cada categoría tiene su hueco y su nombre aunque su
 * barra mida dos píxeles, y lo que se compara dentro de ella —los meses, los centros— es lo que el
 * usuario haya marcado. Ninguna escala arregla la diferencia de tamaño; lo que la arregla es que la
 * pequeña deje de competir por el espacio de la grande.
 *
 * Con una o dos series por categoría el monto va ENCIMA de cada barra (el mismo presupuesto de
 * marcas que el resto de la app), que es lo que hace legible una barra corta: se lee el número. Con
 * más, lo dicen el tooltip y la tabla gemela.
 */
export function categoryBarOption(
  categories: string[],
  series: CategorySeries[],
  context: CategoryOptionContext,
  groups: readonly { label: string; span: number }[] = [],
): ChartOption {
  const labels = fitsDirectLabels(series.length, categories.length);
  const chromeOf = chrome(series.length);
  return {
    ...chromeOf,
    ...(groups.length > 0
      ? {
          grid: {
            ...chromeOf.grid,
            bottom: Number(chromeOf.grid?.bottom ?? 8) + GROUP_BAND_HEIGHT,
          },
        }
      : {}),
    xAxis:
      groups.length > 0
        ? [categoryAxis(categories), groupBandAxis(categories.length, groups)]
        : categoryAxis(categories),
    yAxis: valueAxis(context.unit),
    tooltip: axisTooltip("shadow", context.unit),
    series: series.map((entry, index) => ({
      id: entry.id,
      type: "bar" as const,
      name: entry.label,
      data: [...entry.values],
      // La franja va en la PRIMERA serie y una sola vez: es fondo del gráfico, no de una serie, y
      // repetirla en cada una la oscurecería tantas veces como series haya.
      ...(index === 0 && groups.length > 1 ? { markArea: groupBands(groups) } : {}),
      itemStyle: {
        color: context.colorOf(entry.id),
        borderRadius: [CHART_MARK.radius, CHART_MARK.radius, 0, 0] as [
          number,
          number,
          number,
          number,
        ],
        ...(series.length > 1 ? { borderColor: CHART_SURFACE, borderWidth: CHART_MARK.gap } : {}),
      },
      label: directLabel(labels, context.unit),
      labelLayout: { hideOverlap: true },
    })),
  };
}

/**
 * Cuánto baja el eje real para dejar sitio al renglón de grupos, y cuánto se separa este de él.
 */
const GROUP_BAND_HEIGHT = 18;

/**
 * El renglón que nombra el GRUPO bajo sus columnas: un segundo eje de categorías, sin línea, sin
 * marcas y sin ninguna serie atada — no es una escala, es un rótulo que abarca varias columnas.
 *
 * El nombre se escribe en el CENTRO de su tramo y el resto de sus posiciones van en blanco, que es
 * lo que lo hace parecer un encabezado y no un rótulo por columna. Con un tramo par no hay centro
 * exacto y cae en la columna de la izquierda del medio: desplazarlo medio ancho de columna exigiría
 * medir el gráfico, y esto se decide sin renderizar nada.
 */
function groupBandAxis(
  columns: number,
  groups: readonly { label: string; span: number }[],
): ChartAxis {
  const data = Array.from({ length: columns }, () => "");
  let start = 0;
  for (const group of groups) {
    data[start + Math.floor((group.span - 1) / 2)] = group.label;
    start += group.span;
  }
  return {
    type: "category",
    data,
    position: "bottom",
    offset: GROUP_BAND_HEIGHT,
    axisLine: { show: false },
    axisTick: { show: false },
    splitLine: { show: false },
    axisLabel: {
      show: true,
      interval: 0,
      color: CHART_INK.strong,
      fontSize: 11.5,
      fontWeight: 600,
      hideOverlap: false,
    },
  };
}

/**
 * De dónde a dónde llega cada grupo, dicho con una franja de fondo en los IMPARES — la lectura de
 * una tabla con filas alternas, que es la que ya sabe leer cualquiera.
 *
 * Se alternan en vez de pintarse todas porque lo que hace ver el corte es el CAMBIO, y una línea
 * divisoria por grupo añadiría verticales a una retícula que ya tiene horizontales. Los extremos
 * son índices de columna y no rótulos: el mismo establecimiento aparece en varios grupos, así que
 * un rango por nombre engancharía la primera aparición y no la de este tramo.
 */
function groupBands(groups: readonly { label: string; span: number }[]): ChartMarkArea {
  const data: [ChartMarkPoint, ChartMarkPoint][] = [];
  let start = 0;
  groups.forEach((group, index) => {
    if (index % 2 === 1) {
      data.push([{ xAxis: start }, { xAxis: start + group.span - 1 }]);
    }
    start += group.span;
  });
  return { silent: true, itemStyle: { color: CHART_BAND }, data };
}

/** El grupo al que pertenece cada columna, expandido de los tramos. */
function groupLabels(
  columns: number,
  groups: readonly { label: string; span: number }[],
): (string | undefined)[] {
  const out: (string | undefined)[] = Array.from({ length: columns }, () => undefined);
  let start = 0;
  for (const group of groups) {
    for (let i = 0; i < group.span; i += 1) {
      out[start + i] = group.label;
    }
    start += group.span;
  }
  return out;
}

/**
 * La gemela en tabla del eje girado: una fila por categoría y una columna por lo comparado, que es
 * la forma exacta de la hoja del contador —categoría × establecimiento— y la única lectura donde
 * una cifra pequeña se lee igual de bien que una grande.
 */
export function categoryTable(
  categories: string[],
  series: CategorySeries[],
  context: CategoryOptionContext,
  groups: readonly { label: string; span: number }[] = [],
): ChartTable {
  const groupOf = groupLabels(categories.length, groups);
  return {
    columns: series.map((entry) => entry.label),
    rows: categories.map((label, index) => ({
      id: `${groupOf[index] ?? ""}|${label}`,
      label,
      // El grupo va de SUBRÓTULO y no pegado al nombre: en la tabla hay sitio para los dos, y así
      // la fila se lee igual que su columna en el gráfico.
      ...(groupOf[index] === undefined ? {} : { sublabel: groupOf[index] }),
      values: series.map((entry) => {
        const value = entry.values[index];
        return value === null || value === undefined ? null : formatChartValue(value, context.unit);
      }),
    })),
  };
}

/**
 * The shares a 100% stack draws. Exported so the card's table twin reads the SAME numbers as
 * the chart — the table has to show the transformed values, not the amounts behind them.
 */
export function hundredPercentSeries(series: Series[]): Series[] {
  return series.map(toPctOfContainer);
}

/** Lines — trends and, above all, índice base 100, where the shapes are what compare. */
export function lineOption(series: Series[], context: SeriesOptionContext): ChartOption {
  const sharedCount = sharedCountOf(series, context);
  return {
    ...chrome(series.length),
    xAxis: periodAxis(context),
    yAxis: valueAxis(context.unit),
    tooltip: axisTooltip("cross", context.unit, context, tooltipCodes(seriesCodes(series))),
    series: series.map((entry) => lineSeries(entry, series.length, context, sharedCount)),
  };
}

/**
 * Bars with a line on top, sharing ONE axis and one unit: the amount with its moving average,
 * or with the same period a year earlier. The overlay takes an ink tone rather than a palette
 * slot, because it is a reading of the same entity and not a second one.
 */
export function comboOption(
  bars: Series,
  overlay: Series,
  overlayLabel: string,
  context: SeriesOptionContext,
): ChartOption {
  return {
    ...chrome(MIN_LEGEND_SERIES),
    xAxis: periodAxis(context),
    yAxis: valueAxis(context.unit),
    tooltip: axisTooltip("cross", context.unit, undefined, tooltipCodes(seriesCodes([bars]))),
    series: [
      barSeries(bars, 1, context),
      {
        id: `${seriesKeyId(overlay.key)}|overlay`,
        type: "line",
        name: overlayLabel,
        data: overlay.points.map((point) => point.value),
        lineStyle: { color: CHART_INK.strong, width: CHART_MARK.lineWidth, type: "solid" },
        itemStyle: { color: CHART_INK.strong },
        symbol: "circle",
        symbolSize: CHART_MARK.symbolSize,
        smooth: false,
        label: { show: false },
        z: 3,
      },
    ],
  };
}

/**
 * Horizontal bars ordered largest first — the ranking of a period, and the shape
 * `toPctOfRevenue` gets so the account names have room to be read.
 */
export function horizontalBarOption(
  entries: AmountEntry[],
  context: EntryOptionContext,
): ChartOption {
  const ranked = [...entries].sort((a, b) => b.value - a.value);
  const unit = context.unit;

  return {
    ...chrome(1),
    grid: CATEGORY_ROW_GRID,
    xAxis: valueAxis(unit),
    yAxis: {
      ...categoryAxis(ranked.map((entry) => entry.label)),
      // Category axes run bottom-up; inverting puts the largest bar on the first row.
      inverse: true,
      axisLabel: ROW_AXIS_LABEL,
    },
    tooltip: axisTooltip("shadow", unit, undefined, categoryCodes(ranked)),
    series: [
      {
        id: "ranking",
        type: "bar",
        name: "Monto",
        data: ranked.map((entry) => ({
          value: entry.value,
          itemStyle: {
            color: context.colorOf(entry.code),
            borderRadius: [0, CHART_MARK.radius, CHART_MARK.radius, 0],
          },
        })),
        barMaxWidth: CHART_MARK.barMaxWidth,
        emphasis: { focus: "series" },
        label: directLabel(true, unit, "right"),
        labelLayout: { hideOverlap: true },
      },
    ],
  };
}

/**
 * Barras VERTICALES, una por entrada, con la cifra encima — el espejo de `horizontalBarOption`.
 *
 * Existe porque es la forma en la que la firma dibuja su anexo de gastos a mano, y esa forma no es
 * un capricho suyo: con las categorías abajo el ojo recorre la fila de cifras de un barrido, que es
 * lo que se hace al cotejar contra la hoja. El precio es el rótulo — «EMPLEADOS M.O.I. /
 * ADMISIONES / CAJA / INFORMACION» no cabe bajo una columna—, y se paga PARTIÉNDOLO en varias
 * líneas (`overflow: "break"`) en vez de girándolo: un eje de rótulos en diagonal obliga a inclinar
 * la cabeza para leer diecisiete nombres, y su propio Excel los parte igual.
 *
 * `interval: 0` es lo que obliga a dibujarlos TODOS. Sin él, ECharts adelgaza el eje cuando no
 * caben y se salta uno de cada dos: quedarían diecisiete barras con nueve nombres, y las ocho sin
 * rotular no se podrían identificar por nada — que es peor que un rótulo apretado.
 */
export function verticalBarOption(
  entries: AmountEntry[],
  context: EntryOptionContext & { labelWidth?: number },
): ChartOption {
  const ranked = [...entries].sort((a, b) => b.value - a.value);
  const unit = context.unit;

  return {
    ...chrome(1),
    grid: COLUMN_GRID,
    xAxis: {
      ...categoryAxis(ranked.map((entry) => entry.label)),
      axisLabel: {
        color: CHART_INK.muted,
        fontSize: 10,
        width: context.labelWidth ?? COLUMN_LABEL_WIDTH,
        overflow: "break",
        // Todos, sin adelgazar: una barra sin nombre no se puede identificar por nada más.
        interval: 0,
        hideOverlap: false,
      },
    },
    yAxis: valueAxis(unit),
    // Con el CÓDIGO de cuenta en la cabecera: el eje solo cabe el rótulo, y truncado, así que el
    // tooltip es donde el contador identifica la fila de su plan. Se lee de `ranked` y no de
    // `entries` porque el orden dibujado es el ordenado, y `byCategory` va por índice.
    tooltip: axisTooltip("shadow", unit, undefined, categoryCodes(ranked)),
    series: [
      {
        id: "distribucion",
        type: "bar",
        name: "Monto",
        data: ranked.map((entry) => ({
          value: entry.value,
          itemStyle: {
            color: context.colorOf(entry.code),
            borderRadius: [CHART_MARK.radius, CHART_MARK.radius, 0, 0],
          },
        })),
        barMaxWidth: CHART_MARK.barMaxWidth,
        emphasis: { focus: "series" },
        // La cifra encima de su barra, como en la hoja del contador: es lo que se coteja, y la
        // columna más pequeña de un anexo real mide dos píxeles y sin su número no dice nada.
        label: directLabel(true, unit, "top"),
        labelLayout: { hideOverlap: true },
      },
    ],
  };
}

/**
 * Una cuenta contra los TOTALES que la contienen, como PARTE DE UN TODO: una fila por total, la
 * barra llena hasta lo que esa cuenta pesa y el resto en un relleno recesivo hasta el 100 %.
 *
 * Es la forma que responde «qué parte ocupa», y la elección está en el RESTO: sin él una barra al
 * 27,4 % sobre un eje que se auto-escala se lee como una cifra cualquiera, y hay que ir a mirar el
 * eje para saber contra qué. Con el resto dibujado, el todo está a la vista y la lectura es
 * inmediata — el eje deja de hacer falta y por eso va fijo a 100.
 *
 * Cada barra lleva su MONTO y debajo su porcentaje, con el mismo `rich` de dos renglones que usan
 * las cuentas anidadas: el monto es la cifra que se coteja contra la hoja y el porcentaje la
 * lectura que la fila añade. Van JUSTO A LA DERECHA del relleno y no dentro, y eso se probó al
 * revés primero: dentro, `$307,005.37` no cabe en una barra del 27 % y sale recortado, y el umbral
 * que decidiera cuándo entra y cuándo no dependería del ancho del texto, que no se puede medir sin
 * un canvas. A la derecha caen sobre el relleno recesivo, que es claro, así que se leen en tinta
 * normal y no hay caso que resolver.
 *
 * El resto NO se rotula: su porcentaje es el complemento del que ya está escrito, y decir «72,6 %»
 * al lado de «27,4 %» es la misma cifra dos veces compitiendo con la que importa.
 */
export interface ShareOfTotalRow {
  id: string;
  /** Contra qué se mide: «Del total de costos y gastos». */
  label: string;
  value: number;
  /** El todo. `null` deja la fila fuera: no hay contra qué medir, que no es lo mismo que 0 %. */
  total: number | null;
}

export function shareOfTotalOption(
  rows: readonly ShareOfTotalRow[],
  context: { colorOf: (id: string) => string },
): ChartOption {
  const drawn = rows.filter((row): row is ShareOfTotalRow & { total: number } => {
    return row.total !== null && row.total !== 0;
  });
  const shares = drawn.map((row) => (row.value / row.total) * 100);

  return {
    animationDuration: 320,
    textStyle: { fontFamily: CHART_FONT },
    grid: SHARE_ROW_GRID,
    xAxis: {
      ...valueAxis("porcentaje"),
      // Fijo a 100: el eje de una parte-de-un-todo no se auto-escala, o el mismo relleno diría
      // cosas distintas en dos filas y la comparación entre ellas dejaría de ser posible.
      min: 0,
      max: 100,
      axisLabel: { show: false },
      splitLine: { show: false },
    },
    yAxis: {
      ...categoryAxis(drawn.map((row) => row.label)),
      inverse: true,
      axisLine: { show: false },
      axisLabel: { color: CHART_INK.muted, fontSize: 11.5, width: SHARE_LABEL_WIDTH },
    },
    tooltip: axisTooltip("shadow", "porcentaje"),
    series: [
      {
        id: "parte",
        type: "bar",
        name: "Esta cuenta",
        stack: "todo",
        data: drawn.map((row, index) => ({
          value: shares[index],
          itemStyle: {
            color: context.colorOf(row.id),
            borderRadius: [CHART_MARK.radius, 0, 0, CHART_MARK.radius],
          },
        })),
        barMaxWidth: 30,
        label: {
          show: true,
          position: "right",
          color: CHART_INK.strong,
          fontSize: 11,
          formatter: (param) => {
            const row = drawn[param.dataIndex];
            const share = shares[param.dataIndex];
            return `{monto|${formatChartValue(row.value)}}\n{${SHARE_RICH_KEY}|${formatPercent(share)}}`;
          },
          rich: {
            monto: { color: CHART_INK.strong, fontSize: 11, lineHeight: 14 },
            // Más tenue que el monto, la misma jerarquía que en las cuentas anidadas: el porcentaje
            // es la anotación sobre la barra, no la cifra de la barra.
            [SHARE_RICH_KEY]: { color: CHART_INK.muted, fontSize: 10, lineHeight: 12 },
          },
        },
        labelLayout: { hideOverlap: true },
      },
      {
        id: "resto",
        type: "bar",
        name: "Resto",
        stack: "todo",
        // Recesivo y SILENCIOSO: existe para que se vea el todo, no para ser leído — resaltarlo al
        // pasar por encima invitaría a compararlo con la parte, y no es una entidad.
        silent: true,
        data: drawn.map((_, index) => ({
          value: 100 - shares[index],
          itemStyle: {
            color: CHART_BAND,
            borderRadius: [0, CHART_MARK.radius, CHART_MARK.radius, 0],
          },
        })),
        barMaxWidth: 30,
        label: { show: false },
      },
    ],
  };
}

/** La gemela en tabla: el monto, su parte y el todo contra el que se mide. */
export function shareOfTotalTable(
  rows: readonly ShareOfTotalRow[],
  context: { colorOf: (id: string) => string },
): ChartTable {
  return {
    columns: ["Monto", "% del total", "Total"],
    rows: rows
      .filter((row): row is ShareOfTotalRow & { total: number } => row.total !== null)
      .map((row) => ({
        id: row.id,
        label: row.label,
        color: context.colorOf(row.id),
        values: [
          formatChartValue(row.value),
          row.total === 0 ? null : formatPercent((row.value / row.total) * 100),
          formatChartValue(row.total),
        ],
      })),
  };
}

/** Up and down as glyphs, so the sign of a variation is never carried by color alone. */
const SIGN_MARK = { up: "▲", down: "▼" } as const;

/** The sign tokens as an entry color resolver, so a table twin matches its signed bars. */
export function signColorOf(entries: readonly AmountEntry[]): (code: string) => string {
  const byCode = new Map(entries.map((entry) => [entry.code, entry.value]));
  return (code) => ((byCode.get(code) ?? 0) < 0 ? CHART_SIGN.negative : CHART_SIGN.positive);
}

/**
 * Signed horizontal bars. `--color-positive` and `--color-negative` are the ONE place those
 * tokens appear as a fill, and they never travel alone: each bar carries an arrow and its
 * signed amount, because a reader who cannot separate the two hues still has to be able to
 * tell a rise from a fall.
 */
export function variationBarOption(
  entries: AmountEntry[],
  context: { unit?: ChartUnit } = {},
): ChartOption {
  const ranked = [...entries].sort((a, b) => b.value - a.value);

  return {
    ...chrome(1),
    grid: CATEGORY_ROW_GRID,
    xAxis: valueAxis(context.unit),
    yAxis: {
      ...categoryAxis(ranked.map((entry) => entry.label)),
      inverse: true,
      axisLabel: ROW_AXIS_LABEL,
    },
    tooltip: axisTooltip("shadow", context.unit, undefined, categoryCodes(ranked)),
    series: [
      {
        id: "variacion",
        type: "bar",
        name: "Variación",
        data: ranked.map((entry) => ({
          value: entry.value,
          itemStyle: {
            color: entry.value < 0 ? CHART_SIGN.negative : CHART_SIGN.positive,
            borderRadius: CHART_MARK.radius,
          },
        })),
        barMaxWidth: CHART_MARK.barMaxWidth,
        emphasis: { focus: "series" },
        label: {
          show: true,
          position: "right",
          color: CHART_INK.strong,
          fontSize: 10.5,
          distance: 6,
          formatter: (param) =>
            param.value === null
              ? ""
              : `${param.value < 0 ? SIGN_MARK.down : SIGN_MARK.up} ${formatChartValue(param.value, context.unit)}`,
        },
        labelLayout: { hideOverlap: true },
      },
    ],
  };
}

export interface PieOptionContext extends EntryOptionContext {
  /** A donut leaves the middle free for the total, which a pie cannot show. */
  donut?: boolean;
}

/**
 * Pie or donut, fed by `toPieSlices` — which is what groups the tail into «Otros» and drops
 * the non-positive entries. `4.1.4 Rebaja y/o Descuentos sobre Ventas` is negative and would
 * otherwise draw a negative angle; it comes back in `excluded` for the card to footnote.
 */
export function pieOption(result: PieResult, context: PieOptionContext): ChartOption {
  return {
    animationDuration: 320,
    textStyle: { fontFamily: CHART_FONT },
    tooltip: {
      trigger: "item",
      ...TOOLTIP_CHROME,
      formatter: (params) => {
        const param = (Array.isArray(params) ? params[0] : params) as ChartParam | undefined;
        if (!param || param.value === null) {
          return "";
        }
        const share = param.percent === undefined ? "" : ` · ${formatPercent(param.percent)}`;
        // La porción es la cuenta, así que el código va en su nombre — y «Otros», que es el
        // pliegue de la cola y no una cuenta, se queda sin él por `accountCodeOf`.
        const name = withCode(
          param.name,
          accountCodeOf(result.slices[param.dataIndex]?.code ?? ""),
        );
        return `${name}<br/>${param.marker ?? ""} ${formatChartValue(param.value, context.unit)}${share}`;
      },
    },
    legend: legendFor(result.slices.length),
    series: [
      {
        id: "composicion",
        type: "pie",
        radius: context.donut ? ["52%", "78%"] : ["0%", "74%"],
        center: ["50%", "44%"],
        data: result.slices.map((slice) => ({
          id: slice.code,
          name: slice.label,
          value: slice.value,
          itemStyle: {
            color: context.colorOf(slice.code),
            borderColor: CHART_SURFACE,
            borderWidth: CHART_MARK.gap,
          },
        })),
        label: {
          show: true,
          position: "outside",
          color: CHART_INK.muted,
          fontSize: 11,
          formatter: (param) =>
            param.percent === undefined
              ? param.name
              : `${param.name} · ${formatPercent(param.percent)}`,
        },
        labelLayout: { hideOverlap: true },
        emphasis: { focus: "series" },
      },
    ],
  };
}

/**
 * Concentration of spend. The textbook Pareto is a double axis — bars of amount plus a line of
 * cumulative percentage — which is exactly what this change rules out. Here the cumulative
 * rides each bar as a direct label and the 80% cut is a reference line between two categories,
 * so it reads the same and invents no second scale.
 */
export function paretoOption(result: ParetoResult, context: EntryOptionContext): ChartOption {
  const cut = result.entries.findIndex((entry) => entry.cumulativePct >= 80);

  return {
    ...chrome(1),
    grid: CATEGORY_ROW_GRID,
    xAxis: valueAxis(context.unit),
    yAxis: {
      ...categoryAxis(result.entries.map((entry) => entry.label)),
      inverse: true,
      axisLabel: ROW_AXIS_LABEL,
    },
    tooltip: axisTooltip("shadow", context.unit, undefined, categoryCodes(result.entries)),
    series: [
      {
        id: "pareto",
        type: "bar",
        name: "Gasto",
        data: result.entries.map((entry) => ({
          value: entry.value,
          itemStyle: {
            color: context.colorOf(entry.code),
            borderRadius: [0, CHART_MARK.radius, CHART_MARK.radius, 0],
          },
        })),
        barMaxWidth: CHART_MARK.barMaxWidth,
        emphasis: { focus: "series" },
        label: {
          show: true,
          position: "right",
          color: CHART_INK.muted,
          fontSize: 11,
          distance: 6,
          formatter: (param) => {
            const entry = result.entries[param.dataIndex];
            return entry
              ? `${formatCurrency(entry.value)} · ${formatPercent(entry.cumulativePct)}`
              : "";
          },
        },
        labelLayout: { hideOverlap: true },
        ...(cut >= 0 && cut < result.entries.length - 1
          ? {
              markLine: {
                silent: true,
                symbol: "none",
                // Half a slot below the last bar inside the 80%: the line sits between rows.
                data: [{ yAxis: cut + 0.5, name: "80 %" }],
                label: {
                  show: true,
                  position: "insideEndTop",
                  formatter: "80 % del gasto",
                  color: CHART_INK.faint,
                  fontSize: 10.5,
                },
                lineStyle: { color: CHART_INK.faint, width: 1, type: "dashed" },
              },
            }
          : {}),
      },
    ],
  };
}

/* -------------------------------------------------------------------- cascada */

/** The four stacked series: two transparent bases and the two visible halves of a step. */
const WATERFALL_SERIES = {
  basePositive: "cascada-base-positivo",
  positive: "cascada-positivo",
  baseNegative: "cascada-base-negativo",
  negative: "cascada-negativo",
} as const;

const WATERFALL_STACK = "cascada";

/** El plot que asume el reparto de abajo: la tarjeta más estrecha que dibuja una cascada (A4). */
const WATERFALL_PLOT = 780;

/** Lo que cabe por categoría, nunca más de lo que un nombre de cuenta necesita. */
function waterfallLabelWidth(steps: number): number {
  return Math.max(48, Math.min(84, Math.floor(WATERFALL_PLOT / Math.max(steps, 1))));
}

/** Headroom before the axis is rounded, so the tallest bar does not touch the plot edge. */
const AXIS_PADDING = 1.02;

type WaterfallSide = "positivo" | "negativo";

/**
 * The cascade: bars and nothing but bars, all in one stack, with the stretch below each step
 * painted transparent. That is the whole recipe — `BarChart` is already registered and no new
 * chart type enters the bundle.
 *
 * **Why four series and not two.** A stack accumulates each sign on its own side, so a segment
 * that crosses zero — the expense that turns a profit into a loss — cannot be a single bar. It
 * is drawn as the part above the axis plus the part below, each one stacked on its own base.
 * For every other step one of the two halves is `null` and nothing is drawn.
 *
 * Colors mark a ROLE here (opening total, what left, how it closed), never an entity, which is
 * why slot 1 and the sign tokens are read directly instead of through `colorForEntity`: a
 * cascade consumes no categorical slot and cannot collide with the color of a series.
 */
export function waterfallOption(steps: WaterfallStep[]): ChartOption {
  const pieces = steps.map(piecesOf);
  const { min, max } = waterfallExtent(steps);

  const base = (side: WaterfallSide): ChartSeries => ({
    id: side === "positivo" ? WATERFALL_SERIES.basePositive : WATERFALL_SERIES.baseNegative,
    type: "bar",
    stack: WATERFALL_STACK,
    data: pieces.map((piece) => (side === "positivo" ? piece.basePositive : piece.baseNegative)),
    itemStyle: { color: "transparent" },
    barMaxWidth: CHART_MARK.barMaxWidth,
    // Not in the legend, not in the tooltip, not labelled: it is the hole a step floats over.
    label: { show: false },
    silent: true,
  });

  const fill = (side: WaterfallSide): ChartSeries => ({
    id: side === "positivo" ? WATERFALL_SERIES.positive : WATERFALL_SERIES.negative,
    type: "bar",
    stack: WATERFALL_STACK,
    data: pieces.map((piece, index) => ({
      value: side === "positivo" ? piece.positive : piece.negative,
      itemStyle: { color: waterfallColor(steps[index]) },
    })),
    barMaxWidth: CHART_MARK.barMaxWidth,
    label: {
      show: true,
      // ENCIMA de la barra, no dentro. El diseño la pedía dentro, y dentro se cortaba: el ancho
      // de una barra lo topa `barMaxWidth`, así que «$206,570» no cabe por más pasos que se
      // quiten, y salía impreso como «$206,57». Una cifra a medias es peor que una fuera de
      // sitio, y arriba `hideOverlap` puede además descartar la que no quepa.
      position: "top",
      color: CHART_INK.strong,
      fontSize: 10.5,
      // The bar's height is the SIZE of the step; what the label says is the step's own signed
      // amount, so an expense of 56.000 reads as −$56.000 however tall its bar is.
      formatter: (param) => {
        const step = steps[param.dataIndex];
        const piece = pieces[param.dataIndex];
        return step && piece?.carrier === side ? formatCurrency(step.value) : "";
      },
    },
    labelLayout: { hideOverlap: true },
  });

  return {
    ...chrome(1),
    xAxis: {
      ...categoryAxis(steps.map((step) => step.label)),
      // Account names are long and every step must be named: they wrap instead of being
      // dropped by `hideOverlap`, and `outerBoundsContain` shrinks the plot to fit them.
      //
      // El ancho SALE DEL NÚMERO DE PASOS. Estaba fijo en 84 px, que es lo que da una cascada de
      // diez pasos en una tarjeta ancha; con doce en una hoja A4 cada categoría dispone de menos
      // que eso y los nombres se montan unos sobre otros («IngresosOtros GastosComisiones…»).
      axisLabel: {
        color: CHART_INK.muted,
        fontSize: 10.5,
        interval: 0,
        width: waterfallLabelWidth(steps.length),
        overflow: "break",
        hideOverlap: false,
      },
    },
    yAxis: { ...valueAxis("moneda"), min, max },
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "shadow", lineStyle: { color: CHART_LINES.axis, width: 1 } },
      ...TOOLTIP_CHROME,
      // Read off the STEP and not off the params, which is how the transparent base — a series
      // like any other to the renderer — never gets a row of its own.
      formatter: (params) => {
        const first = Array.isArray(params) ? params[0] : params;
        const step = first ? steps[first.dataIndex] : undefined;
        if (!step) {
          return "";
        }
        return step.kind === "total"
          ? `${step.label}<br/>${formatCurrency(step.value)}`
          : `${step.label}<br/>${formatCurrency(step.value)} · acumulado ${formatCurrency(step.end)}`;
      },
    },
    series: [
      base("positivo"),
      base("negativo"),
      { ...fill("positivo"), markLine: connectors(steps) },
      fill("negativo"),
    ],
  };
}

/** The table twin: what each step took away, and where the statement stood after it. */
export function waterfallTable(steps: WaterfallStep[]): ChartTable {
  return {
    columns: ["Monto", "Acumulado"],
    rows: steps.map((step) => ({
      id: step.code,
      label: step.label,
      color: waterfallColor(step),
      values: [formatCurrency(step.value), formatCurrency(step.end)],
    })),
  };
}

/** The two halves of a step and the base each one floats on. */
interface WaterfallPieces {
  basePositive: number | null;
  positive: number | null;
  baseNegative: number | null;
  negative: number | null;
  /** Which half carries the direct label: the visible one, or the closing one when both are. */
  carrier: WaterfallSide;
}

function piecesOf(step: WaterfallStep): WaterfallPieces {
  const low = Math.min(step.start, step.end);
  const high = Math.max(step.start, step.end);
  const basePositive = Math.max(low, 0);
  const positive = Math.max(high, 0) - basePositive;
  const baseNegative = Math.min(high, 0);
  const negative = Math.min(low, 0) - baseNegative;

  return {
    basePositive: drawn(basePositive),
    positive: drawn(positive),
    baseNegative: drawn(baseNegative),
    negative: drawn(negative),
    carrier: negative !== 0 && (positive === 0 || step.value < 0) ? "negativo" : "positivo",
  };
}

/** A zero-height piece is `null`, so the renderer draws nothing rather than a hairline. */
function drawn(value: number): number | null {
  return value === 0 ? null : value;
}

/**
 * A total takes slot 1 of the palette — it is the brand's own bar and says "this is how much
 * there is" — except the closing one, which takes the sign of the result, because whether the
 * period ended up or down is the reading it exists for. A step takes the sign of its own
 * amount: expenses fall and are red, and a credited group that rises is not painted as a loss.
 */
function waterfallColor(step: WaterfallStep): string {
  if (step.kind === "total" && step.code !== RESULT_CODE) {
    const section = sectionOf(step.code);
    return section ? CHART_SECTION[section] : CHART_PALETTE[0];
  }
  return step.value < 0 ? CHART_SIGN.negative : CHART_SIGN.positive;
}

/** The thin line from the close of one step to the start of the next — what makes it a cascade. */
function connectors(steps: WaterfallStep[]): ChartSeries["markLine"] {
  return {
    silent: true,
    symbol: "none",
    label: { show: false },
    lineStyle: { color: CHART_INK.faint, width: 1, type: "solid" },
    data: steps
      .slice(0, -1)
      .map((step, index) => [{ coord: [index, step.end] }, { coord: [index + 1, step.end] }]),
  };
}

/**
 * The scale comes from every `start` and `end` there is, zero included — a period that closes
 * in a loss has to fit under the axis, and a scale derived from the visible bar heights alone
 * would cut it off.
 */
function waterfallExtent(steps: WaterfallStep[]): { min: number; max: number } {
  const bounds = steps.flatMap((step) => [step.start, step.end]);
  return {
    min: niceBound(Math.min(0, ...bounds) * AXIS_PADDING, "floor"),
    max: niceBound(Math.max(0, ...bounds) * AXIS_PADDING, "ceil"),
  };
}

/** Rounds out to a step of one order of magnitude below the value, so the ticks stay round. */
function niceBound(value: number, direction: "floor" | "ceil"): number {
  if (value === 0) {
    return 0;
  }
  const step = 10 ** (Math.floor(Math.log10(Math.abs(value))) - 1);
  return (direction === "ceil" ? Math.ceil(value / step) : Math.floor(value / step)) * step;
}

/* ------------------------------------------------------------- shape dispatchers */

/**
 * The chart type the user picked, resolved to its builder. Both tabs go through this so a new
 * shape is wired once; `sanitizeSelection` has already clamped the type to one the
 * transformation admits, so the fall-through is a default and not a silent substitution.
 */
export function seriesOptionFor(
  chartType: ChartType,
  series: Series[],
  context: SeriesOptionContext,
): ChartOption {
  switch (chartType) {
    case "barras-apiladas":
      return stackedOption(series, context);
    case "barras-100":
      return hundredPercentOption(series, context);
    case "linea":
      return lineOption(series, context);
    default:
      return barOption(series, context);
  }
}

/** The table twin of the same shape — 100% stacks must show shares, not the amounts. */
export function seriesTableFor(
  chartType: ChartType,
  series: Series[],
  context: SeriesOptionContext,
): ChartTable {
  return chartType === "barras-100"
    ? seriesTable(hundredPercentSeries(series), { ...context, unit: "porcentaje" })
    : seriesTable(series, context);
}

/* -------------------------------------------------------------------- table twin */

/**
 * The same series as rows and the same periods as columns. Three of the eight palette slots
 * fall below 3:1 against white — unavoidable in a categorical eight — so a readable numeric
 * twin is not a nicety. It is also the only place a transformed chart's numbers exist at all:
 * índice 100, variación and YTD are nowhere in the Datos tab.
 */
export function seriesTable(series: Series[], context: SeriesOptionContext): ChartTable {
  return {
    columns: context.periods.map((period) => periodLabel(period, { multiYear: context.multiYear })),
    rows: series.map((entry) => ({
      id: seriesKeyId(entry.key),
      label: entry.label,
      ...sublabelFor(entry.key.code),
      color: context.colorOf(entry.key),
      values: entry.points.map((point) =>
        point.value === null ? null : formatChartValue(point.value, context.unit),
      ),
    })),
  };
}

/** The twin of an entry-based card: one row per account, one column with its amount. */
export function entryTable(
  entries: AmountEntry[],
  context: EntryOptionContext,
  valueHeader = "Monto",
): ChartTable {
  return {
    columns: [valueHeader],
    rows: [...entries]
      .sort((a, b) => b.value - a.value)
      .map((entry) => ({
        id: entry.code,
        label: entry.label,
        ...sublabelFor(entry.code),
        color: context.colorOf(entry.code),
        values: [formatChartValue(entry.value, context.unit)],
      })),
  };
}

/* ------------------------------------------------------------------ shared pieces */

/**
 * Row charts reserve their left gutter EXPLICITLY instead of letting the layout shrink to fit.
 * `outerBoundsContain: "axisLabel"` does not account for a width-capped label, so an account
 * name long enough to be truncated ended up drawn past the left edge and clipped at the START
 * — "Mantenimiento Equipos" reading as "lantenimiento Equipos". A fixed gutter wider than the
 * label cap cannot do that.
 */
const ROW_LABEL_WIDTH = 150;
const CATEGORY_ROW_GRID = {
  left: ROW_LABEL_WIDTH + 14,
  right: 84,
  top: 8,
  bottom: 8,
  outerBoundsMode: "none",
} as const;

/**
 * El canal de la fila de «parte de un todo». Mucho más estrecho que el del ranking porque su rótulo
 * no es un nombre de cuenta sino contra qué se mide —dos filas, texto corto y conocido—, y aquí
 * cada píxel cuenta: esto vive en el panel lateral, que son 440 px, y entre el canal y el hueco de
 * la cifra se le puede comer a la barra todo el ancho que tiene para decir algo.
 */
const SHARE_LABEL_WIDTH = 106;
const SHARE_ROW_GRID = {
  left: SHARE_LABEL_WIDTH + 14,
  // El monto y su porcentaje se escriben a la derecha del relleno, así que la barra no puede
  // llegar al borde: sin este hueco, la fila más llena imprimiría su cifra fuera de la tarjeta.
  right: 104,
  top: 10,
  bottom: 10,
  outerBoundsMode: "none",
} as const;

const ROW_AXIS_LABEL = {
  color: CHART_INK.muted,
  fontSize: 11.5,
  width: ROW_LABEL_WIDTH,
  overflow: "truncate",
} as const;

/**
 * El ancho que se le da a cada rótulo bajo su columna antes de partirlo en líneas, y el hueco que
 * la retícula le reserva abajo. Son fijos por lo mismo que el canal de `CATEGORY_ROW_GRID`: medir
 * el texto real exigiría un canvas, así que se reserva una cota y se parte contra ella.
 */
const COLUMN_LABEL_WIDTH = 74;
const COLUMN_GRID = {
  left: 8,
  right: 16,
  top: 28,
  // Cuatro líneas de rótulo a 10 px, que es lo que pide el nombre más largo de un anexo real.
  bottom: 62,
  outerBoundsMode: "same",
  outerBoundsContain: "axisLabel",
} as const;

const TOOLTIP_CHROME: Omit<ChartTooltip, "trigger" | "formatter"> = {
  backgroundColor: CHART_SURFACE,
  borderColor: CHART_LINES.axis,
  borderWidth: 1,
  padding: [8, 10],
  textStyle: { color: CHART_INK.strong, fontSize: 12 },
};

/** Everything a cartesian chart shares: font, animation, plot box and legend. */
function chrome(
  seriesCount: number,
): Pick<ChartOption, "animationDuration" | "textStyle" | "grid" | "legend"> {
  const legend = legendFor(seriesCount);
  return {
    animationDuration: 320,
    textStyle: { fontFamily: CHART_FONT },
    grid: {
      left: 8,
      right: 16,
      top: 16,
      bottom: legend.show ? 28 : 8,
      outerBoundsMode: "same",
      outerBoundsContain: "axisLabel",
    },
    legend,
  };
}

function legendFor(seriesCount: number): ChartLegend {
  return {
    show: seriesCount >= MIN_LEGEND_SERIES,
    type: "scroll",
    bottom: 0,
    icon: "roundRect",
    itemWidth: 10,
    itemHeight: 10,
    itemGap: 14,
    textStyle: { color: CHART_INK.muted, fontSize: 11.5 },
  };
}

function periodAxis(context: SeriesOptionContext): ChartAxis {
  return categoryAxis(
    context.periods.map((period) => periodLabel(period, { multiYear: context.multiYear })),
  );
}

function categoryAxis(labels: string[]): ChartAxis {
  return {
    type: "category",
    data: labels,
    axisLine: { show: true, lineStyle: { color: CHART_LINES.axis, width: 1, type: "solid" } },
    axisTick: { show: false },
    splitLine: { show: false },
    axisLabel: { color: CHART_INK.muted, fontSize: 11, hideOverlap: true },
  };
}

/** One recessive tone, continuous stroke: the grid must sit behind the marks, not compete. */
function valueAxis(unit: ChartUnit = "moneda"): ChartAxis {
  return {
    type: "value",
    axisLine: { show: false },
    axisTick: { show: false },
    splitLine: { show: true, lineStyle: { color: CHART_LINES.grid, width: 1, type: "solid" } },
    axisLabel: {
      color: CHART_INK.faint,
      fontSize: 11,
      formatter: (value) => formatAxisValue(Number(value), unit),
    },
  };
}

/**
 * El código de cuenta con el que se nombra algo del plan, o `undefined` cuando lo dibujado no es
 * una cuenta.
 *
 * Es una línea porque una sola cosa puede estar mal: `OTHERS_CODE` es el pliegue de la cola —el
 * de la tarta y el de la pila—, y escribirlo afirmaría que el contador tiene una cuenta llamada
 * «otros». Lo demás que llega aquí ya sale del árbol (`SeriesKey.code`, `AmountEntry.code`), así
 * que no hay nada que validar contra la fuente.
 */
function accountCodeOf(code: string): string | undefined {
  return code === OTHERS_CODE || code.length === 0 ? undefined : code;
}

/**
 * El nombre precedido de su código, que es el orden del plan de cuentas y el de la tabla de
 * Datos, donde la columna del código va a la izquierda del nombre.
 */
function withCode(label: string, code: string | undefined): string {
  return code === undefined ? label : `${code} · ${label}`;
}

/**
 * Dónde cae el código dentro de un tooltip, que no es lo mismo en las dos formas de tarjeta.
 *
 * Cuando la cuenta ES la serie —la evolución, la comparación, la pila— hay una fila por serie y
 * el código va en la suya. Cuando la cuenta es la CATEGORÍA del eje —el ranking, la variación, el
 * pareto—, la serie se llama «Monto» y el nombre de la cuenta es la primera línea del tooltip,
 * así que es ahí donde tiene que ir. Un mismo formateador y dos sitios; ningún builder pasa los
 * dos, porque ningún gráfico es de las dos formas a la vez.
 */
interface TooltipCodes {
  /** Por `seriesId`. */
  bySeries?: ReadonlyMap<string, string>;
  /** Por índice de categoría, en el orden en que se dibujan. */
  byCategory?: readonly (string | undefined)[];
}

/**
 * El código como `sublabel` de una fila de la tabla gemela — ausente cuando no hay cuenta que
 * nombrar. Va debajo del nombre y no pegado a él porque en la tabla sí hay sitio para los dos,
 * la misma regla con la que Sueldos por Áreas cuelga el cargo bajo el empleado.
 */
function sublabelFor(code: string): { sublabel?: string } {
  const account = accountCodeOf(code);
  return account === undefined ? {} : { sublabel: account };
}

/** Los pares `(id de serie, código)` de una tanda, con el id que cada serie lleva al dibujarse. */
function seriesCodes(series: readonly Series[]): [string, string][] {
  return series.map((entry) => [seriesKeyId(entry.key), entry.key.code]);
}

/** El mapa del tooltip, sin las series que no nombran una cuenta. */
function tooltipCodes(pairs: readonly (readonly [string, string])[]): TooltipCodes {
  const bySeries = new Map<string, string>();
  for (const [id, code] of pairs) {
    const code_ = accountCodeOf(code);
    if (code_ !== undefined) {
      bySeries.set(id, code_);
    }
  }
  return { bySeries };
}

/** Lo mismo para un eje de categorías, donde el índice del dato ES el puesto en el eje. */
function categoryCodes(entries: readonly { code: string }[]): TooltipCodes {
  return { byCategory: entries.map((entry) => accountCodeOf(entry.code)) };
}

/**
 * A tooltip that omits the series with no coverage instead of reporting `$0` for them, and
 * renders nothing at all when a period has no covered series. `axis` trigger also makes the
 * whole column sensitive, which is how the hit area ends up larger than the mark.
 *
 * Es el único sitio donde el porcentaje sale NOMBRANDO su base («28.4 % de Ingresos»): en la
 * barra esa frase no cabe en doce columnas, y aquí sobra el ancho. Sale siempre que exista,
 * también cuando el eje estaba demasiado apretado para imprimirlo encima de la barra.
 *
 * Y es donde sale el CÓDIGO de la cuenta, que en el gráfico no está en ningún otro sitio: en el
 * eje se comería el canal de rótulos —150 px en las de barras horizontales— y truncaría los
 * nombres, así que se paga al pasar el ratón, que es cuando se pregunta por una cuenta concreta
 * para cotejarla contra el plan.
 */
function axisTooltip(
  pointer: "shadow" | "cross",
  unit: ChartUnit = "moneda",
  context?: SeriesOptionContext,
  codes: TooltipCodes = {},
): ChartTooltip {
  return {
    trigger: "axis",
    axisPointer: { type: pointer, lineStyle: { color: CHART_LINES.axis, width: 1 } },
    ...TOOLTIP_CHROME,
    formatter: (params) => {
      const list = Array.isArray(params) ? params : [params];
      const covered = list.filter((param) => param.value !== null && param.value !== undefined);
      if (covered.length === 0) {
        return "";
      }
      const rows = covered.map((param) => {
        const share = param.seriesId ? context?.shares?.get(param.seriesId) : undefined;
        const value = share?.values[param.dataIndex];
        const suffix =
          share && value !== null && value !== undefined
            ? ` · ${formatPercent(value)} de ${share.baseLabel}`
            : "";
        const name = withCode(
          param.seriesName ?? "",
          param.seriesId === undefined ? undefined : codes.bySeries?.get(param.seriesId),
        );
        return `${param.marker ?? ""} ${name}: ${formatChartValue(param.value as number, unit)}${suffix}`;
      });
      // La primera línea es el PERIODO en las de series y la CUENTA en las de categorías: solo la
      // segunda lleva código, y por eso `byCategory` se lee aquí y no en las filas.
      const head = withCode(covered[0].name, codes.byCategory?.[covered[0].dataIndex]);
      return [head, ...rows].join("<br/>");
    },
  };
}

function barSeries(
  series: Series,
  seriesCount: number,
  context: SeriesOptionContext,
  options: {
    stacked?: boolean;
    seamless?: boolean;
    sharedCount?: number;
    /**
     * Los porcentajes ya decididos por quien llama, saltándose `shareLabelFor`. Solo los pasa la
     * pila con total, cuyo presupuesto es la altura de cada segmento y no el elenco del eje.
     */
    shares?: readonly (number | null)[];
  } = {},
): ChartSeries {
  const stacked = options.stacked ?? false;
  // Contiguous fills — stacked segments, grouped bars — are separated by 2px of the surface.
  //
  // `seamless` es la excepción, y solo la pide una pila que ya lleva un TOTAL encima: allí la
  // columna es una sola cifra repartida, no varias puestas en fila, y esas costuras la parten en
  // trozos sueltos. Lo que separa un segmento del siguiente pasa a ser el salto de color, que su
  // escala ordenada ya garantiza.
  const separation =
    (stacked && !options.seamless) || (!stacked && seriesCount > 1)
      ? { borderColor: CHART_SURFACE, borderWidth: CHART_MARK.gap }
      : {};

  return {
    id: seriesKeyId(series.key),
    type: "bar",
    name: series.label,
    data: series.points.map((point) => point.value),
    itemStyle: {
      color: context.colorOf(series.key),
      borderRadius: stacked ? 0 : [CHART_MARK.radius, CHART_MARK.radius, 0, 0],
      ...separation,
    },
    barMaxWidth: CHART_MARK.barMaxWidth,
    emphasis: { focus: "series" },
    label: directLabel(
      labelsFit(seriesCount, series.points.length, context),
      context.unit,
      stacked ? "inside" : "top",
      options.shares ?? shareLabelFor(series, context, options.sharedCount ?? 0),
    ),
    labelLayout: { hideOverlap: true },
  };
}

function lineSeries(
  series: Series,
  seriesCount: number,
  context: SeriesOptionContext,
  sharedCount = 0,
): ChartSeries {
  const color = context.colorOf(series.key);
  return {
    id: seriesKeyId(series.key),
    type: "line",
    name: series.label,
    data: series.points.map((point) => point.value),
    lineStyle: { color, width: CHART_MARK.lineWidth, type: "solid" },
    itemStyle: { color },
    symbol: "circle",
    symbolSize: CHART_MARK.symbolSize,
    smooth: false,
    emphasis: { focus: "series" },
    label: directLabel(
      labelsFit(seriesCount, series.points.length, context),
      context.unit,
      "top",
      shareLabelFor(series, context, sharedCount),
    ),
    labelLayout: { hideOverlap: true },
  };
}

/**
 * Los porcentajes que esta serie imprimirá bajo su monto, o `undefined` si no lleva ninguno —
 * porque no cae dentro de ninguna cuenta marcada, o porque su elenco no cabe en el eje.
 */
function shareLabelFor(
  series: Series,
  context: SeriesOptionContext,
  sharedCount: number,
): readonly (number | null)[] | undefined {
  const share = shareOf(series, context);
  return share && sharesFit(sharedCount, series.points.length, context) ? share.values : undefined;
}

/**
 * The direct label of a mark. `hideOverlap` in `labelLayout` is what drops one that does not
 * fit rather than drawing it clipped, and the empty string for a `null` keeps an uncovered
 * period from printing a value it does not have.
 *
 * `shares` añade una SEGUNDA línea con lo que la cuenta ocupa dentro de la marcada que la
 * contiene. Las dos líneas son independientes: con el eje apretado el monto se apaga y el
 * porcentaje sigue —es más corto y es la lectura que se pidió—, y una barra cuyo porcentaje no
 * se puede calcular (base en cero, periodo sin cobertura) imprime su monto y nada debajo.
 */
function directLabel(
  show: boolean,
  unit: ChartUnit = "moneda",
  position: ChartLabel["position"] = "top",
  shares?: readonly (number | null)[],
): ChartLabel {
  const inside = position === "inside";
  return {
    show: show || shares !== undefined,
    position,
    // Ink, never the series color — an inside label sits on a saturated fill, hence `onFill`.
    color: inside ? CHART_INK.onFill : CHART_INK.strong,
    fontSize: 10.5,
    ...(shares
      ? {
          rich: {
            // Más tenue que el monto: el porcentaje es una anotación sobre la barra, no la cifra
            // de la barra. Sobre un relleno saturado gana `onFill`, que es el único que se lee.
            [SHARE_RICH_KEY]: {
              color: inside ? CHART_INK.onFill : CHART_INK.muted,
              fontSize: 10,
              lineHeight: 13,
            },
          },
        }
      : {}),
    formatter: (param) => {
      const amount =
        show && param.value !== null && param.value !== undefined
          ? formatChartValue(param.value, unit)
          : "";
      const share = shares?.[param.dataIndex];
      if (share === null || share === undefined) {
        return amount;
      }
      const pct = `{${SHARE_RICH_KEY}|${formatPercent(share)}}`;
      return amount === "" ? pct : `${amount}\n${pct}`;
    },
  };
}
