import type { ChartGuide, ChartGuideAction } from "@/lib/charts/types";

/**
 * La copy del ⓘ de cada tarjeta de PyG › Gráficos y › Análisis: para qué sirve, qué controles la
 * mueven y cómo se lee.
 *
 * Vive aparte de `cards.ts` porque allí es texto y no cálculo, pero se ENGANCHA en `cards.ts` y no
 * en un mapa indexado por `id` en la vista: la primera tarjeta de Gráficos es «Comparación»,
 * «Ventas por línea de negocio» o el anexo de gastos según lo marcado, y un mapa por `id` acabaría
 * describiendo una tarjeta distinta de la que se está viendo.
 *
 * Tres reglas para escribir aquí:
 *
 * 1. **En llano.** Quien lee esto es el contador, no quien programó la app: «lo que entra y lo que
 *    sale», no «raíces del estado»; «los meses que no cargaste», no «periodos sin cobertura».
 * 2. **Corto.** Una frase para el para qué, media línea por control. Una ayuda que hay que leer
 *    entera no se lee.
 * 3. **Solo lo que existe.** El rótulo del control, tal cual está en pantalla, y ningún gesto que
 *    esa tarjeta no tenga: prometer un clic que no hace nada enseña a no probar el de al lado.
 */

/** Los controles de la barra que casi todas las tarjetas repiten. */
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

/** Primera tarjeta, caso por defecto: «Ingresos contra Costos y Gastos» / «Comparación». */
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

/** Primera tarjeta con el predeterminado «Ventas» puesto. */
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

/** Barras del anexo de gastos (predeterminado «Costos y gastos»). */
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

/** Dona del anexo de gastos. */
export const GUIDE_EXPENSE_ANNEX_PIE: ChartGuide = {
  purpose: "Qué parte del gasto total se lleva cada rubro.",
  actions: [
    { control: "Ver como tabla", effect: "el % del gasto y el % de la venta, rubro por rubro." },
    { control: "Cuenta contable", effect: "desmarca para sacar rubros." },
    SPAN,
  ],
  reading: "Si sacas rubros ya no suma 100 %: estás mirando solo una parte del gasto.",
};

/** Apilado por periodo de las hijas de una cuenta. */
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

/** Barras horizontales de la composición del ingreso. */
export const GUIDE_COMPOSITION: ChartGuide = {
  purpose: "De dónde viene la venta: cuánto aporta cada cuenta, de mayor a menor.",
  actions: [ACCOUNTS, LEVEL, SPAN, AS_TABLE],
  reading: "Los descuentos y rebajas restan, así que quedan fuera del reparto y se avisan abajo.",
};

/** Ranking de gastos. */
export const GUIDE_RANKING: ChartGuide = {
  purpose: "Las cuentas en las que más gastas, de mayor a menor.",
  actions: [ACCOUNTS, LEVEL, CENTERS, SPAN, AS_TABLE],
  reading: "Se dibujan las 15 más grandes; abajo dice cuántas quedaron fuera.",
};

/** Cascada del ingreso al resultado. */
export const GUIDE_WATERFALL: ChartGuide = {
  purpose: "Cómo pasas de lo que vendiste a lo que te quedó, y qué te va restando en el camino.",
  actions: [SPAN, CENTERS, AS_TABLE],
  reading: "Cada escalón resta sobre el anterior; el último es la ganancia o la pérdida.",
};

/** Análisis: % de los gastos principales sobre los ingresos. */
export const GUIDE_EXPENSE_SHARE: ChartGuide = {
  purpose: "Cuánto de cada dólar vendido se te va en cada gasto grande.",
  actions: [ACCOUNTS, LEVEL, SPAN, AS_TABLE],
  reading:
    "Divide el total del gasto entre el total vendido en esos meses, no el promedio de cada mes.",
};

/** Análisis: variación contra el periodo anterior. */
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

/** Análisis: Pareto de la concentración del gasto. */
export const GUIDE_PARETO: ChartGuide = {
  purpose: "Si el gasto se concentra en pocas cuentas o está repartido en muchas.",
  actions: [ACCOUNTS, LEVEL, SPAN, AS_TABLE],
  reading: "La línea va sumando: donde llega al 80 % están las cuentas que explican casi todo.",
};

/** Análisis: la tabla del análisis vertical, que no pasa por `ChartCard`. */
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
