import type { ChartGuide, ChartGuideAction } from "@/lib/charts/types";

/** The bar's marks, which the five cards share. They are declared once so no two guides describe
 *  the same control differently. */
const YEAR: ChartGuideAction = {
  control: "Año",
  effect: "marca varios y cada uno se dibuja aparte.",
};
const MONTH: ChartGuideAction = { control: "Mes", effect: "qué meses entran." };
const INSURER: ChartGuideAction = { control: "Seguro", effect: "acota a esas aseguradoras." };
const TYPE: ChartGuideAction = {
  control: "Tipo de servicio",
  effect: "acota todo a lo marcado, aquí y en las otras tarjetas.",
};
const ARTICLE: ChartGuideAction = {
  control: "Artículo",
  effect: "acota a unos artículos; la lista sale de los tipos marcados.",
};
const VENDOR: ChartGuideAction = { control: "Vendedor", effect: "acota a esos vendedores." };
const AS_TABLE: ChartGuideAction = { control: "Ver como tabla", effect: "los números exactos." };

/** Composition by service type. */
export const GUIDE_SALES_TYPES: ChartGuide = {
  purpose: "En qué se factura: cuánto aporta cada tipo de servicio, de mayor a menor.",
  actions: [YEAR, MONTH, INSURER, TYPE, AS_TABLE],
  reading:
    "Cada barra lleva su importe y su parte de la venta del periodo. Pulsa una barra para bajar un nivel y ver los artículos de ese tipo. Un tipo que no vendió nada no se dibuja. Todo se mide sobre el precio NETO.",
};

/** Level two of the composition: one type's articles. */
export const GUIDE_SALES_TYPE_DETAIL: ChartGuide = {
  purpose: "El detalle de UN tipo de servicio: sus artículos, de mayor a menor, con su cifra.",
  actions: [
    { control: "← Todos los tipos", effect: "vuelve al nivel de los tipos." },
    YEAR,
    MONTH,
    INSURER,
    AS_TABLE,
  ],
  reading:
    "Cada barra lleva su importe y qué parte de ESTE tipo representa. Se dibujan los quince mayores y la tabla los lista todos. Se llega aquí de dos formas: pulsando la barra de un tipo —que no acota el resto de la pantalla— o marcando UN solo tipo en el filtro, que sí acota todo.",
};

/** Concentration by insurer. */
export const GUIDE_SALES_INSURERS: ChartGuide = {
  purpose: "Quién paga: si la venta se concentra en pocos seguros o está repartida.",
  actions: [
    YEAR,
    MONTH,
    { control: "Tipo de servicio", effect: "quién paga ESE tipo." },
    { control: "Ver como tabla", effect: "la lista entera de seguros." },
  ],
  reading:
    "Se dibujan los diez mayores del periodo y la nota dice qué parte de la venta son. Cada seguro sale con el nombre que trae el reporte, «PARTICULAR» incluido, que es el más grande de todos.",
};

/** The article ranking. */
export const GUIDE_SALES_ARTICLES: ChartGuide = {
  purpose: "Qué se vende: los artículos que más facturan dentro de lo marcado.",
  actions: [
    YEAR,
    MONTH,
    INSURER,
    { control: "Tipo de servicio", effect: "marca uno y lee sus artículos." },
    ARTICLE,
    AS_TABLE,
  ],
  reading:
    "Cada barra lleva el nombre del artículo. Cuando dos se llaman igual —el sistema recorta los nombres, y varias consultas de especialidades distintas llegan escritas idénticas— esas, y solo esas, llevan su código detrás para poder distinguirlas. Se dibujan los quince mayores; la tabla los lista todos.",
};

/** The salesperson ranking. */
export const GUIDE_SALES_VENDORS: ChartGuide = {
  purpose: "Quién vende: los vendedores que más facturan dentro de lo marcado.",
  actions: [YEAR, MONTH, INSURER, TYPE, VENDOR, AS_TABLE],
  reading:
    "Ojo con la cobertura: en el reporte la mayor parte de la facturación NO trae vendedor, y la nota dice cuánto es. Esas líneas no se dibujan como una barra —taparían el ranking entero— pero siguen contando en el total del periodo, así que las barras no suman la venta completa.",
};

/** Month-by-month evolution. */
export const GUIDE_SALES_EVOLUTION: ChartGuide = {
  purpose: "Cómo se mueve la facturación mes a mes, de qué está hecho cada mes, y contra otro año.",
  actions: [
    { control: "Año", effect: "marca varios para comparar ejercicios." },
    { control: "Mes", effect: "acota el eje a los meses marcados." },
    { control: "Tipo de servicio", effect: "deja en la columna solo lo marcado." },
    { control: "Ver como", effect: "el mismo desglose en 3D o apilado." },
    AS_TABLE,
  ],
  reading:
    "Con un año el mes se parte por tipo de servicio, y eso se puede ver de dos formas: en «3D» cada tipo es una fila que arranca en cero, para seguir hacia dónde va; en «2D» la columna se lee entera contra la línea de su total. Comparando años vuelve a una barra por año. Un mes que nunca cargaste no dibuja nada y lleva una raya en la tabla — no es un mes en cero.",
};
