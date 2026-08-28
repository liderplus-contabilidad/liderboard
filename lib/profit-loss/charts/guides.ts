import type { ChartGuide, ChartGuideAction } from "@/lib/charts/types";

/**
 * The ⓘ copy of each card of PyG › Gráficos and › Análisis: what it is for, which controls move it
 * and how it is read.
 *
 * It lives apart from `cards.ts` because there it is text and not computation, but it is HOOKED IN in
 * `cards.ts` and not in a map indexed by `id` in the view: the first card of Gráficos is
 * «Comparación», «Ventas por línea de negocio» or the expense annex depending on what is marked, and
 * a map by `id` would end up describing a card other than the one being looked at.
 *
 * Three rules for writing here:
 *
 * 1. **In plain language.** Whoever reads this is the accountant, not whoever programmed the app:
 *    «what comes in and what goes out», not «roots of the statement»; «the months you did not load»,
 *    not «periods with no coverage».
 * 2. **Short.** One sentence for the what-for, half a line per control. A help text that has to be
 *    read whole does not get read.
 * 3. **Only what exists.** The control's label, exactly as it is on screen, and no gesture that card
 *    does not have: promising a click that does nothing teaches you not to try the one next to it.
 */

/** The bar controls almost every card repeats. */
const ACCOUNTS: ChartGuideAction = {
  control: "Cuenta contable",
  effect: "elige qué cuentas ver.",
};
const LEVEL: ChartGuideAction = { control: "Nivel", effect: "cuánto detalle abres." };
const CENTERS: ChartGuideAction = {
  control: "Centro de costo",
  effect: "compara establecimientos.",
};
const SPAN: ChartGuideAction = { control: "Año y Periodo", effect: "qué meses entran." };
const AS_TABLE: ChartGuideAction = { control: "Ver como tabla", effect: "los números exactos." };

/** First card, default case: «Ingresos contra Costos y Gastos» / «Comparación». */
export const GUIDE_EVOLUTION: ChartGuide = {
  purpose: "Compara mes a mes lo que entra con lo que sale. Si marcas cuentas, compara esas.",
  actions: [
    { control: "Cuenta contable", effect: "marca varias para compararlas entre sí." },
    LEVEL,
    CENTERS,
    { control: "Ver por", effect: "pasa de meses a trimestres, semestres o año." },
    SPAN,
    AS_TABLE,
  ],
  reading: "Los meses que nunca cargaste salen vacíos, no en cero.",
};

/** First card with the «Ventas» preset in place. */
export const GUIDE_BUSINESS_LINES: ChartGuide = {
  purpose:
    "Cuánto vende cada parte del negocio: hospedaje, restaurante, bar, lavandería y tours. Es algo que las cuentas por sí solas no dicen.",
  actions: [
    { control: "Leyenda de abajo", effect: "prende y apaga líneas." },
    { control: "Centro de costo", effect: "una columna por establecimiento." },
    { control: "Periodo", effect: "qué meses compara cada columna." },
    AS_TABLE,
  ],
  reading: "La nota de abajo suma las líneas y te dice si cuadran con el total del estado.",
};

/** Expense annex bars (the «Costos y gastos» preset). */
export const GUIDE_EXPENSE_ANNEX_BARS: ChartGuide = {
  purpose: "En qué gastaste, de mayor a menor. Es tu anexo de gastos.",
  actions: [
    { control: "Pulsa una barra", effect: "ves cuánto pesa ese gasto." },
    { control: "Cuenta contable", effect: "desmarca para sacar un gasto." },
    SPAN,
    AS_TABLE,
  ],
  reading: "Se dibujan los 15 más grandes y el resto se junta en «Otros»; la tabla los trae todos.",
};

/** Expense annex doughnut. */
export const GUIDE_EXPENSE_ANNEX_PIE: ChartGuide = {
  purpose: "Qué parte del gasto total se lleva cada rubro.",
  actions: [
    { control: "Ver como tabla", effect: "el % del gasto y el % de la venta, rubro por rubro." },
    { control: "Cuenta contable", effect: "desmarca para sacar rubros." },
    SPAN,
  ],
  reading: "Si sacas rubros ya no suma 100 %: estás mirando solo una parte del gasto.",
};

/** An account's children stacked by period. */
export const GUIDE_DISTRIBUTION: ChartGuide = {
  purpose: "Si una cuenta va ganando o perdiendo peso dentro de su grupo, mes a mes.",
  actions: [
    {
      control: "Cuenta contable",
      effect: "marca UNA para repartir esa; sin marcas reparte lo que vendes.",
    },
    { control: "Periodo", effect: "qué meses ves." },
    AS_TABLE,
  ],
  reading:
    "La línea es el total de verdad, no el borde de las barras: un descuento resta hacia abajo.",
};

/** Horizontal bars of the revenue composition. */
export const GUIDE_COMPOSITION: ChartGuide = {
  purpose: "De dónde viene la venta: cuánto aporta cada cuenta, de mayor a menor.",
  actions: [ACCOUNTS, LEVEL, SPAN, AS_TABLE],
  reading: "Los descuentos y rebajas restan, así que quedan fuera del reparto y se avisan abajo.",
};

/** Expense ranking. */
export const GUIDE_RANKING: ChartGuide = {
  purpose: "Las cuentas en las que más gastas, de mayor a menor.",
  actions: [ACCOUNTS, LEVEL, CENTERS, SPAN, AS_TABLE],
  reading: "Se dibujan las 15 más grandes; abajo dice cuántas quedaron fuera.",
};

/** Cascade from revenue to result. */
export const GUIDE_WATERFALL: ChartGuide = {
  purpose: "Cómo pasas de lo que vendiste a lo que te quedó, y qué te va restando en el camino.",
  actions: [SPAN, CENTERS, AS_TABLE],
  reading: "Cada escalón resta sobre el anterior; el último es la ganancia o la pérdida.",
};

/** Análisis: % of the main expenses over revenue. */
export const GUIDE_EXPENSE_SHARE: ChartGuide = {
  purpose: "Cuánto de cada dólar vendido se te va en cada gasto grande.",
  actions: [ACCOUNTS, LEVEL, SPAN, AS_TABLE],
  reading:
    "Divide el total del gasto entre el total vendido en esos meses, no el promedio de cada mes.",
};

/** Análisis: variation against the previous period. */
export const GUIDE_VARIATION: ChartGuide = {
  purpose: "Qué cuentas subieron o bajaron más contra el mes anterior.",
  actions: [
    { control: "Periodo y Ver por", effect: "deciden qué dos meses se comparan." },
    ACCOUNTS,
    AS_TABLE,
  ],
  reading:
    "Compara solo dos meses, y el subtítulo dice cuáles. Cada barra lleva su flecha y su signo.",
};

/** Análisis: Pareto of the expense concentration. */
export const GUIDE_PARETO: ChartGuide = {
  purpose: "Si el gasto se concentra en pocas cuentas o está repartido en muchas.",
  actions: [ACCOUNTS, LEVEL, SPAN, AS_TABLE],
  reading: "La línea va sumando: donde llega al 80 % están las cuentas que explican casi todo.",
};

/** Análisis: the vertical analysis table, which does not go through `ChartCard`. */
export const GUIDE_VERTICAL: ChartGuide = {
  purpose: "Qué porcentaje representa cada cuenta sobre otra que tú eliges, casi siempre la venta.",
  actions: [
    { control: "Base", effect: "elige contra qué se compara todo." },
    ACCOUNTS,
    LEVEL,
    SPAN,
  ],
  reading: "«Total año» compara los totales del año, no el promedio de los meses.",
};
