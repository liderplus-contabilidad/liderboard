/**
 * Las TRES lecturas de la pantalla, descritas como DATOS (`option` + `table`) y no como markup:
 * composición por servicio, concentración por pagador y evolución.
 *
 * Que sean datos es lo que permite que el informe imprimible lea EXACTAMENTE la misma construcción
 * que la pantalla en vez de reconstruir sus cifras — la regla por la que el informe de PyG no puede
 * discrepar de Gráficos. Dos cálculos de la misma pregunta se separan, y nada aguas abajo puede
 * decir cuál de los dos números es el bueno.
 *
 * **Cada tarjeta tiene DOS formas, y la elige el número de años marcados**, no un control: con uno
 * dibuja el reparto del periodo, y con varios pone un año por SERIE sobre el mismo eje. No es una
 * cuarta tarjeta ni un interruptor —dos sitios donde elegir lo mismo—, es la misma pregunta
 * respondida sobre lo que el usuario marcó, que es lo que hace que la comparación interanual no
 * cueste ningún control nuevo.
 *
 * Es un builder PROPIO y no el `option.ts` de PyG, siguiendo el precedente de Ocupaciones y de
 * Sueldos por Áreas: aquel está escrito sobre los tipos de su motor de analytics (`Series`,
 * `SeriesKey`, `PeriodRef`) y traerlos aquí ataría este subitem a ese motor por la presentación. Lo
 * que sí se comparte es lo que debe compartirse: los tipos `ChartOption`, la paleta y los
 * formateadores.
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

/**
 * Cuántos pagadores DIBUJA la tarjeta de concentración. Diez es lo que la firma lee en su propio
 * informe y lo que cabe sin que las barras se conviertan en una trama; los restantes no se pliegan
 * en una barra «Otros» —sería la más larga del gráfico y taparía justo la lectura de
 * concentración— sino que se cuentan en la nota y se listan enteros en la tabla gemela.
 */
export const PAYER_SLICES = 10;

/**
 * Cuántos pagadores LISTA la tabla en el INFORME IMPRESO, antes de plegar la cola en una fila.
 *
 * En pantalla la tabla no corta, y ese es su trabajo: es el sitio donde un pagador que no se dibujó
 * conserva su cifra, y buscarlo cuesta un scroll. En papel esa justificación se cae — el archivo
 * real trae 956 pagadores, que son más de veinte páginas de nombres detrás de un informe de dos, y
 * la mayoría son filas «Particular · 731 · $12,40», anónimas por diseño: un anexo de veinte páginas
 * que nadie puede usar para nada. Es el mismo tipo de regla que el informe de PyG ya aplica al
 * podar por TABLA mientras su Excel poda por LIBRO: cada soporte poda como se lee.
 *
 * Lo que NO se hace es truncar a secas. La cola se pliega en UNA fila con su suma, así que la
 * columna sigue cerrando contra el TOTAL: una tabla recortada cuyas filas no suman su propio total
 * es justo lo que hace desconfiar de un documento.
 */
export const PAYER_TABLE_PRINT_LIMIT = 30;

/**
 * El color de una barra de PAGADOR dice su CLASE, no su identidad — la cuarta vez que el color deja
 * de seguir a la entidad en esta app, y aquí por dos motivos que se suman: diez entidades no caben
 * en las ocho ranuras de la paleta (la novena saldría neutra y parecería una categoría aparte), y
 * lo que un lector pregunta ante esta tarjeta es cuánto de su facturación depende de ASEGURADORAS
 * frente a lo que entra por ventanilla. Cada barra lleva su rótulo y su cifra, así que el color no
 * está distinguiendo nada que la fila no diga ya.
 *
 * **Solo en la forma de UN año.** Comparando varios, la serie es el AÑO y el color vuelve a ser
 * identidad: teñir por clase pintaría del mismo tono los tres años de un mismo pagador, que es
 * justo lo que la comparación necesita distinguir.
 */
const PAYER_FILL = { empresa: CHART_PALETTE[0], particular: CHART_NEUTRAL } as const;

/** El relleno de un mes que NUNCA llegó — ver `absenceMarks`. */
const ABSENT_FILL = CHART_LINES.grid;

const SERVICES_HEIGHT = 300;
const PAYERS_HEIGHT = 420;
const EVOLUTION_HEIGHT = 300;

/** Una lectura y el año del que es. */
export interface YearReading {
  year: number;
  reading: SalesReading;
}

/** Los doce meses de un año, con `null` en los que nunca llegaron. */
export interface YearMonths {
  year: number;
  points: MonthPoint[];
}

/** Todo lo que las tres tarjetas necesitan, ya agregado: ninguna recorre líneas sueltas. */
export interface SalesCardsInput {
  /** El agregado de TODO lo marcado — lo que dicen los tiles y los denominadores. */
  reading: SalesReading;
  /** Una lectura por AÑO marcado, ascendente. Con una sola, las tarjetas usan su forma simple. */
  byYear: readonly YearReading[];
  /** Cómo se llama el periodo — «Abril 2026», «Abr · 2025, 2026». Lo escriben los subtítulos. */
  period: string;
  /** Los doce meses de cada año marcado. */
  monthlyByYear: readonly YearMonths[];
  /**
   * Cuántos pagadores lista la tabla antes de plegar la cola. `undefined` —la pantalla— los lista
   * TODOS; el informe pasa `PAYER_TABLE_PRINT_LIMIT`. Es lo ÚNICO en lo que el papel y la pantalla
   * se separan, y se separan a propósito: ver `PAYER_TABLE_PRINT_LIMIT`.
   */
  payerTableLimit?: number;
}

export interface SalesCards {
  services: ChartCardSpec;
  payers: ChartCardSpec;
  evolution: ChartCardSpec;
}

export function buildSalesCards(input: SalesCardsInput): SalesCards {
  return {
    services: buildServicesCard(input),
    payers: buildPayersCard(input),
    evolution: buildEvolutionCard(input),
  };
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
      // Sin centavos: un eje es la escala contra la que se estima el largo de una barra, y seis
      // rótulos de «$107,231.22» se comen el ancho del dibujo. La cifra exacta va en la barra, en
      // el tooltip y en la tabla.
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
      // `interval: 0` obliga a dibujarlos TODOS: sin él ECharts adelgaza el eje y se salta uno de
      // cada dos, y una barra sin nombre no se identifica por nada.
      interval: 0,
      width: 190,
      overflow: "truncate",
    },
  };
}

/** La leyenda de los AÑOS. Con uno solo sobra: el subtítulo de la tarjeta ya lo nombra. */
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

/** El tooltip de la casa: dentro de la TARJETA (`confine`), que es un `overflow-hidden`. */
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

/** El tooltip de una comparación: la columna entera, con una línea por año. */
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
      // Un año sin cifra se OMITE en vez de decir `$0.00`, la misma regla de la tabla.
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

/** El color de un año: su puesto ESTABLE en la lista marcada, para que quitar uno no repinte los
 *  demás — la regla de `colorForEntity`. */
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
// 1 · Composición por servicio
// ---------------------------------------------------------------------------

function buildServicesCard(input: SalesCardsInput): ChartCardSpec {
  const { reading, byYear, period } = input;
  const total = reading.totals.amount;
  // Un servicio parado se va y se cuenta: el reporte declara los cinco del catálogo tenga o no
  // movimiento, y una barra invisible entierra a la que importa. Se juzga sobre el AGREGADO, así
  // que un servicio que se movió en cualquiera de los años marcados se queda.
  const moving = reading.services.filter((service) => service.amount !== 0);
  const idle = reading.services.length - moving.length;
  const years = byYear.map((entry) => entry.year);
  const comparing = years.length > 1;
  const order = moving.map((service) => service.code);

  /** Lo que cada año facturó en un servicio; `null` si ese año no lo tocó. */
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
          // Barras HORIZONTALES: los rótulos son nombres de servicio enteros («EXÁMENES DE
          // LABORATORIO»), que bajo una columna no caben, y el reparto ya viene ordenado de mayor a
          // menor, así que el largo de cada fila alineada dice su peso de un vistazo.
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
    height: SERVICES_HEIGHT,
  };
}

function servicesNote(total: number, idle: number, comparing: boolean): string {
  // El denominador SE NOMBRA, con su cifra: un porcentaje que no dice contra qué se mide obliga a
  // deducirlo del título, y esa es la cuenta que nadie hace y todos dan por hecha.
  const base = comparing
    ? `Una barra por año y servicio. Los porcentajes de la tabla son la parte del periodo entero (${formatCurrency(total, { cents: true })}), sumados los años.`
    : `Los porcentajes son la parte de la venta del periodo (${formatCurrency(total, { cents: true })}) que representa cada servicio.`;
  return idle === 0
    ? base
    : `${base} ${pluralize(idle, "servicio")} del catálogo no se movió en el periodo y no se dibuja.`;
}

// ---------------------------------------------------------------------------
// 2 · Concentración por pagador
// ---------------------------------------------------------------------------

function buildPayersCard(input: SalesCardsInput): ChartCardSpec {
  const { reading, byYear, period, payerTableLimit } = input;
  const total = reading.totals.amount;
  const years = byYear.map((entry) => entry.year);
  const comparing = years.length > 1;
  // Los mayores se eligen sobre el AGREGADO, no sobre un año: si el elenco cambiara con las marcas,
  // la tarjeta no se podría comparar consigo misma. Y el ORDINAL de un particular sale del mismo
  // sitio, así que «Particular · 1» significa la misma persona en las tres series.
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

  // En pantalla la tabla NO corta: es el sitio donde un pagador que no se dibujó conserva su cifra.
  // En papel se pliega la cola, con su suma, para que la columna siga cerrando contra el TOTAL.
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
            // El id es el PUESTO y nunca el nombre: es la clave de React y viaja al informe, y el
            // nombre de un paciente no puede colarse en una estructura solo porque ahí no se rinda.
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
    height: PAYERS_HEIGHT,
  };
}

function subtitleForPayers(drawn: number, all: number, period: string): string {
  return drawn >= all
    ? `${pluralize(all, "pagador", "pagadores")} · ${period}`
    : `Los ${drawn} mayores de ${formatNumber(all)} · ${period}`;
}

/**
 * La concentración se dice EN UNA CIFRA —qué parte del periodo son los dibujados—, porque es la
 * lectura entera de esta tarjeta y estimarla sumando diez barras a ojo no se hace.
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
  // Qué hace la TABLA con esos restantes se dice aquí y no se da por supuesto: es la diferencia
  // entre la pantalla y el papel, y una nota que prometiera la lista completa en un informe que la
  // pliega sería lo único de la tarjeta que no se puede comprobar mirándola.
  const where =
    foldedCount === 0
      ? "La tabla los lista uno a uno."
      : `La tabla lista los mayores y agrupa a los ${formatNumber(foldedCount)} últimos en una fila, que sigue sumando en el total.`;
  // Cuáles se dibujan se decide sobre el AGREGADO, y con varios años eso no es obvio: sin esta
  // línea, un pagador que fue el mayor de un año y no aparece se lee como un dato que falta.
  const ranking = comparing
    ? " Los mayores se eligen por el total del periodo, no por un año, para que el elenco no cambie al mover las marcas."
    : "";
  // La regla del anonimato se DECLARA donde se aplica: una fila que dice «Particular · 4» sin esta
  // línea se lee como un pagador llamado así.
  return `${head} ${rest}${where}${ranking} Los pacientes particulares van sin nombre; las aseguradoras, con el suyo.`;
}

/**
 * La cola plegada en UNA fila, o ninguna. Lleva su propia suma para que la columna siga cerrando
 * contra el TOTAL, y dice CUÁNTO era el mayor de los que agrupa: es la pregunta que una fila
 * plegada levanta —«¿qué me estoy perdiendo?»— y responderla es lo que la hace aceptable.
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
// 3 · Evolución
// ---------------------------------------------------------------------------

function buildEvolutionCard({ monthlyByYear, period }: SalesCardsInput): ChartCardSpec {
  const years = monthlyByYear.map((entry) => entry.year);
  const comparing = years.length > 1;
  // El eje sale de los PUNTOS y no de los doce meses: cuando «Mes» acota, la tarjeta dibuja lo
  // marcado, y el subtítulo y las columnas dicen lo mismo.
  const axis = monthlyByYear[0]?.points ?? [];
  const labels = axis.map((point) => MONTHS_SHORT_ES[point.monthIndex]);
  const covered = monthlyByYear.flatMap((entry) =>
    entry.points.filter((point) => point.amount !== null),
  );

  // **Barras CON línea encima**: la barra dice cuánto —que es lo que se compara contra la del año
  // de al lado— y la línea dice hacia dónde, que es lo que una fila de barras agrupadas obliga a
  // reconstruir saltando de la primera de cada grupo a la siguiente. Son las dos mitades de
  // «evolución» y ninguna de las dos sobra.
  //
  // Se cae a barras SOLAS con una única columna, donde una línea es un punto suelto. El precedente
  // de combo en esta app es la línea de total sobre la pila de «Distribución» en PyG.
  const withLine = labels.length > 1;

  const legend = yearLegend(years.length);
  // Las DOS series de un año comparten `name`, que es por lo que la leyenda dedupe: sale un ítem
  // por año y al apagarlo se van su barra y su línea a la vez.
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
        // Una cifra por marca deja de leerse pasadas unas pocas: con varios años son 24 o 36.
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
      // Recta y no `smooth`: una curva inventa valores entre dos meses que nadie midió. Y un hueco
      // PARTE la línea —ECharts no une `null` por defecto—, que es lo correcto: unir enero con marzo
      // dibujaría un febrero que no llegó.
      smooth: false,
      // Por encima de las barras, que es donde tiene que leerse.
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
          // La banda se RESERVA siempre —explícito, no por el defecto de ECharts— porque siempre
          // hay barras: la línea va por el centro de cada banda, que es donde el grupo de barras
          // está centrado.
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
      // La RAYA, no una celda en blanco ni un `$0.00`: es lo que dice «este mes nunca llegó»,
      // frente al cero que un mes cargado sí afirma.
      values: entry.points.map((point) => currencyOrDash(point.amount)),
    })),
  };

  return {
    id: "sales-evolution",
    title: "Evolución",
    subtitle: `Venta total · ${period}`,
    option,
    table,
    note: evolutionNote(monthlyByYear, comparing),
    height: EVOLUTION_HEIGHT,
  };
}

/**
 * La MARCA DE AUSENCIA: un tope recesivo bajo los meses que nunca llegaron.
 *
 * Sin ella un mes ausente y un mes cargado en cero se dibujan igual —los dos, nada—, y la
 * distinción sobre la que descansa todo el módulo desaparecería justo en la tarjeta que existe para
 * enseñarla. Va `silent` (fuera del hover y de la emphasis) porque su alto NO es un dato: es una
 * fracción fija de la escala, y un tooltip que lo dijera estaría inventando una cifra.
 *
 * **Solo con UN año**, que es también el único caso que se dibuja con barras. Comparando varios la
 * lectura es una LÍNEA, y ahí un hueco ya se ve porque la línea se parte y porque los otros años sí
 * tienen punto en esa columna; una fila de topes grises añadiría marcas falsas a un gráfico que ya
 * lleva tres reales.
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
      // Apilada sobre la serie real para que las dos compartan columna: un mes con marca de
      // ausencia no tiene valor, así que no hay nada que se le monte encima.
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

function evolutionNote(monthlyByYear: readonly YearMonths[], comparing: boolean): string {
  const axisLength = monthlyByYear[0]?.points.length ?? 0;
  const gaps = monthlyByYear
    .map((entry) => ({
      year: entry.year,
      missing: entry.points.filter((point) => point.amount === null).map((p) => p.monthIndex),
    }))
    .filter((entry) => entry.missing.length > 0);

  if (gaps.length === 0) {
    // Habla del EJE que está en pantalla y no de «los doce meses»: con «Mes» acotado, afirmar que
    // el año está completo sería decir algo que la tarjeta no está enseñando.
    const what = axisLength === 12 ? "los doce meses" : pluralize(axisLength, "mes", "meses");
    return comparing
      ? `Todos los años comparados tienen ${what} del eje cargados.`
      : `Sin huecos: ${what} del eje tienen su archivo cargado.`;
  }
  // Los huecos se dicen POR AÑO, nunca uno por mes: con tres años a medias, una línea por mes serían
  // treinta avisos para una sola idea.
  const detail = gaps
    .map((entry) =>
      comparing
        ? `${entry.year}: ${pluralize(entry.missing.length, "mes", "meses")}`
        : `${pluralize(entry.missing.length, "mes", "meses")} sin cargar (${entry.missing.map((month) => MONTHS_SHORT_ES[month]).join(", ")})`,
    )
    .join(" · ");
  const head = comparing ? `Meses sin cargar — ${detail}.` : `${detail}.`;
  return `${head} Un mes que nunca llegó no es un mes en cero — la misma regla de cobertura de PyG.`;
}

/** Un importe de tabla, con la RAYA de «este periodo nunca llegó». */
function currencyOrDash(value: number | null): string {
  return value === null ? "–" : formatCurrency(value, { cents: true });
}

/** Un porcentaje de tabla, con la raya de «esta pregunta no tiene respuesta». */
function formatShare(share: number | null): string {
  return share === null ? "–" : formatPercent(share);
}
