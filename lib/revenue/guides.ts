/**
 * What each card's ⓘ opens. They live apart from the builders for the reason every guide catalogue in
 * this app does: a card's help names its controls by their REAL on-screen label, and keeping the text
 * beside the option builder buries it under the chart's chrome.
 *
 * The ratio cards' guides are not written one by one — they are composed from the series descriptor
 * (`series.ts`), so a fourth external series gets its help for free instead of having a copy of this
 * text pasted with two words changed.
 */
import type { ChartGuide } from "@/lib/charts/types";

export const GUIDE_REVENUE_COMPARISON: ChartGuide = {
  purpose:
    "Cuánto se vendió cada mes y cómo se compara un año con otro, sobre los ingresos del estado de resultados.",
  actions: [
    { control: "Año", effect: "un año dibuja una barra por mes; varios, una línea por año" },
    { control: "Mes", effect: "acota los mismos meses en todos los años marcados a la vez" },
    { control: "Ver como tabla", effect: "la matriz meses × años con el total y el promedio" },
  ],
  reading:
    "Un mes sin cargar no dibuja barra y lleva raya en la tabla: no es un mes en cero. El promedio divide entre los meses cargados, no entre doce.",
};

export const GUIDE_REVENUE_GROWTH: ChartGuide = {
  purpose:
    "Cuánto creció el año más reciente contra cada año anterior marcado, mes a mes y sobre el mismo tramo.",
  actions: [
    { control: "Año", effect: "el más reciente es la referencia; los demás son las bases" },
    { control: "Mes", effect: "acota el tramo que se compara en todos los años" },
    { control: "Ver en", effect: "cambia la unidad entre dólares y porcentaje, no los datos" },
  ],
  reading:
    "Solo se comparan los meses que los dos años tienen cargados, así que un año a medias nunca se mide contra los doce meses de otro. La caída se dibuja bajo la línea de cero; el color sigue al año base, no al signo.",
};

/** A ratio card's help, composed from its own labels — see `series.ts`. */
export function ratioGuide(numerator: string, denominator: string): ChartGuide {
  return {
    purpose: `Qué parte de ${denominator} representa ${numerator}, mes a mes y en el periodo.`,
    actions: [
      { control: "Mes", effect: "acota el tramo que se lee" },
      { control: "Registrar datos", effect: "abre el cajón donde se escriben las cifras del mes" },
    ],
    reading: `Las dos barras son dólares sobre el mismo eje, y bajo la cifra de ${numerator} va qué parte de ${denominator} representa. Un mes solo entra en ese porcentaje si tiene ${numerator} y ${denominator}: un mes con venta y sin registrar queda fuera del cálculo, no cuenta como cero.`,
  };
}

export const GUIDE_REVENUE_ANNUAL: ChartGuide = {
  purpose:
    "El año entero como una sola cifra: cuánto vendió cada año marcado, y cuánto vendió al mes en promedio.",
  actions: [
    { control: "Año", effect: "una barra por año marcado que tenga meses cargados" },
    { control: "Mes", effect: "acota el tramo, así que el total pasa a ser el del tramo" },
    {
      control: "Ver como",
      effect: "el total del tramo, o el promedio mensual sobre los meses cargados",
    },
  ],
  reading:
    "Un año a medias dibuja una barra corta en «Total» porque le faltan meses, no porque haya vendido menos: «Promedio mensual» divide entre los meses cargados y es la forma bajo la que se comparan. Un año sin ningún mes cargado no dibuja y lleva raya en la tabla.",
};
