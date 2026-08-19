/**
 * Del `SalariesGrid` a la tarjeta que se dibuja: barras agrupadas por mes, más su gemela en tabla.
 * Puro, así que las reglas que hacen honesta la lectura se prueban sin montar un DOM.
 *
 * Es un builder PROPIO y no el de PyG, siguiendo el precedente de Ocupaciones: `barOption` de
 * `lib/profit-loss/charts/option.ts` está escrito sobre los tipos de su motor de analytics
 * (`Series`, `SeriesKey`, `PeriodRef`), y traerlos aquí ataría Rol de Pagos a PyG por la
 * presentación. Lo que sí se comparte es lo que debe compartirse: los tipos `ChartOption`, la
 * paleta y los formateadores.
 *
 * Las tres reglas de la casa que este archivo respeta:
 *
 *   - **Un `null` sigue siendo `null`.** ECharts no dibuja marca, y la tabla lo deja en blanco. Un
 *     hueco convertido en 0 dibujaría una caída que nadie declaró.
 *   - **Un solo `yAxis`.** Aquí sobra con uno porque todo está en dólares: es una sola cifra.
 *   - **Ningún hex escrito.** El color sale de `colorForEntity`, y la tinta y las líneas de
 *     `lib/charts/palette`.
 *
 * Y una propia: **el tope de series recorta la GRÁFICA, no la tabla**. `ChartCard` recibe `option` y
 * `table` por separado, así que la tabla lista todas las filas y la tarjeta declara al pie cuántas
 * no cupieron. La paleta son ocho ranuras y no cicla; la tabla no tiene ese límite y es la lectura
 * exacta.
 */
import {
  CHART_FONT,
  CHART_INK,
  CHART_LINES,
  CHART_MARK,
  CHART_MAX_SERIES,
  CHART_SURFACE,
  colorForEntity,
} from "@/lib/charts/palette";
import type {
  ChartAxis,
  ChartCardSpec,
  ChartLegend,
  ChartOption,
  ChartParam,
  ChartTable,
  ChartTooltip,
} from "@/lib/charts/types";
import { formatCurrency, pluralize } from "@/lib/format";
import type { SalariesGrid, SalariesRow } from "./grid";

/** Con una sola serie la leyenda sobra: el título de la tarjeta ya la nombra. */
const MIN_LEGEND_SERIES = 2;

/** Pasadas estas marcas —series × columnas— una cifra por barra deja de leerse y es textura. */
const MAX_DIRECT_LABEL_MARKS = 14;

/** El alto de la tarjeta; el mismo que las de PyG y Ocupaciones. */
const CARD_HEIGHT = 300;

/**
 * Las filas que la GRÁFICA dibuja: el cierre siempre —es la barra que el contador busca— más las de
 * mayor costo acumulado hasta llenar la paleta.
 *
 * Se ordena por lo ACUMULADO y no por el último mes para que mover una marca de mes no cambie qué
 * series se dibujan: una gráfica cuyo elenco baila al filtrar no se puede comparar consigo misma.
 */
function drawnRows(grid: SalariesGrid): { rows: SalariesRow[]; dropped: number } {
  const withTotal = grid.total ? [...grid.rows, grid.total] : [...grid.rows];
  if (withTotal.length <= CHART_MAX_SERIES) {
    return { rows: withTotal, dropped: 0 };
  }
  // El cierre no compite por ranura: entra siempre y se reserva la suya.
  const slots = grid.total ? CHART_MAX_SERIES - 1 : CHART_MAX_SERIES;
  const ranked = [...grid.rows].sort((a, b) => accumulated(b) - accumulated(a)).slice(0, slots);
  // Se dibujan en el orden de la TABLA, no en el del ranking, para que las dos se lean en paralelo.
  const kept = new Set(ranked.map((row) => row.id));
  const rows = grid.rows.filter((row) => kept.has(row.id));
  return {
    rows: grid.total ? [...rows, grid.total] : rows,
    dropped: grid.rows.length - rows.length,
  };
}

function accumulated(row: SalariesRow): number {
  return row.values.reduce<number>((sum, value) => sum + (value ?? 0), 0);
}

/**
 * El color de una fila sale de su posición estable en la lista COMPLETA, no en la dibujada: así una
 * fila conserva su color aunque el tope deje fuera a otra, y la marca de la tabla y la barra de la
 * gráfica siguen siendo del mismo tono.
 */
function colorResolver(grid: SalariesGrid): (rowId: string) => string {
  const order = [...grid.rows.map((row) => row.id), ...(grid.total ? [grid.total.id] : [])];
  return (rowId: string) => colorForEntity(rowId, order);
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

function valueAxis(): ChartAxis {
  return {
    type: "value",
    axisLine: { show: false },
    axisTick: { show: false },
    splitLine: { show: true, lineStyle: { color: CHART_LINES.grid, width: 1, type: "solid" } },
    axisLabel: {
      color: CHART_INK.faint,
      fontSize: 11,
      // La ÚNICA cifra sin centavos del módulo: un eje es la escala contra la que se estima el
      // alto de una barra, y seis rótulos de «$12,345.67» se comen el ancho del dibujo.
      formatter: (value) => formatCurrency(Number(value)),
    },
  };
}

/** Un mes sin valor se OMITE del tooltip en vez de decir `$0.00`, que es la misma regla de la tabla. */
function axisTooltip(): ChartTooltip {
  return {
    backgroundColor: CHART_SURFACE,
    borderColor: CHART_LINES.axis,
    borderWidth: 1,
    padding: [8, 10],
    textStyle: { color: CHART_INK.strong, fontSize: 12 },
    // Dentro de la TARJETA y no de la ventana — ver `ChartTooltip.confine`. Aquí pesa igual que en
    // PyG: los renglones son nombres de empleado con su cargo, así que la caja es ancha.
    confine: true,
    trigger: "axis",
    axisPointer: { type: "shadow", lineStyle: { color: CHART_LINES.axis, width: 1 } },
    formatter: (params) => {
      const rows = Array.isArray(params) ? params : [params];
      const head = rows[0]?.name ?? "";
      const body = rows
        .filter((row) => row.value !== null && row.value !== undefined)
        .map(
          (row) =>
            `<div>${row.marker ?? ""} ${row.seriesName ?? ""}: <b>${formatCurrency(
              Number(row.value),
              { cents: true },
            )}</b></div>`,
        )
        .join("");
      return `<div style="font-weight:600;margin-bottom:4px">${head}</div>${body || "<div>Sin datos</div>"}`;
    },
  };
}

function buildOption(grid: SalariesGrid, rows: readonly SalariesRow[]): ChartOption | null {
  if (rows.length === 0 || grid.columns.length === 0) {
    return null;
  }
  const colorOf = colorResolver(grid);
  const legend = legendFor(rows.length);
  const labelsFit = rows.length * grid.columns.length <= MAX_DIRECT_LABEL_MARKS;

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
    xAxis: categoryAxis(grid.columns.map((column) => column.label)),
    yAxis: valueAxis(),
    tooltip: axisTooltip(),
    series: rows.map((row) => ({
      id: row.id,
      name: row.label,
      type: "bar" as const,
      data: row.values,
      itemStyle: {
        color: colorOf(row.id),
        borderRadius: [CHART_MARK.radius, CHART_MARK.radius, 0, 0] as [
          number,
          number,
          number,
          number,
        ],
      },
      barMaxWidth: CHART_MARK.barMaxWidth,
      label: {
        show: labelsFit,
        position: "top" as const,
        color: CHART_INK.muted,
        fontSize: 11,
        // Con centavos, como el tooltip y la tabla: la cifra sobre la barra se coteja contra la
        // hoja del contador. Solo el eje los suelta, porque ahí la cifra se estima, no se compara.
        formatter: (param: ChartParam) =>
          param.value === null || param.value === undefined
            ? ""
            : formatCurrency(Number(param.value), { cents: true }),
      },
      labelLayout: { hideOverlap: true },
    })),
  };
}

/**
 * La gemela en tabla, construida de TODAS las filas del grid — nunca de las que la gráfica dibuja.
 *
 * Los importes van con centavos porque esta tabla existe para cotejarse contra el Excel del
 * contador, no para dar una idea de la magnitud; el eje de la gráfica sí los redondea.
 */
function buildTable(grid: SalariesGrid): ChartTable {
  const colorOf = colorResolver(grid);
  const toRow = (row: SalariesRow, emphasis: boolean) => ({
    id: row.id,
    label: row.label,
    sublabel: row.sublabel,
    emphasis,
    color: colorOf(row.id),
    // La raya, y no una celda en blanco: es lo que la hoja del contador escribe donde alguien no
    // estuvo en la nómina, y dice «aquí no hay nada» en vez de dejar dudando si falta el dato o
    // falta la carga. `$0.00` sigue reservado para un cero afirmado por una ficha que sí estuvo.
    values: row.values.map((value) =>
      value === null ? "–" : formatCurrency(value, { cents: true }),
    ),
  });

  return {
    columns: grid.columns.map((column) => column.label),
    rows: [
      ...grid.rows.map((row) => toRow(row, false)),
      ...(grid.total ? [toRow(grid.total, true)] : []),
    ],
  };
}

/** El título: el consolidado no nombra área, el detalle nombra la suya. */
function titleFor(grid: SalariesGrid): string {
  return grid.mode === "detalle" && grid.area ? `Área ${grid.area}` : "Sueldos por área";
}

export function buildSalariesCard(grid: SalariesGrid, subtitle?: string): ChartCardSpec {
  const { rows, dropped } = drawnRows(grid);
  return {
    id: "salaries",
    title: titleFor(grid),
    subtitle,
    option: buildOption(grid, rows),
    table: buildTable(grid),
    note:
      dropped > 0
        ? `La gráfica dibuja ${pluralize(rows.length, "serie")}: la paleta tiene ${CHART_MAX_SERIES} colores y no los repite. La tabla lista ${pluralize(grid.rows.length, "fila")}, incluidas las ${dropped} que no se dibujaron.`
        : undefined,
    height: CARD_HEIGHT,
  };
}
