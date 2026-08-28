import type { ChartGuide, ChartGuideAction } from "@/lib/charts/types";

/** The bar's two controls, which the three cards share. */
const YEAR: ChartGuideAction = {
  control: "Año",
  effect: "marca varios y cada uno se dibuja aparte.",
};
const MONTH: ChartGuideAction = { control: "Mes", effect: "qué meses entran." };
const AS_TABLE: ChartGuideAction = { control: "Ver como tabla", effect: "los números exactos." };

/** Composition by service. */
export const GUIDE_SALES_SERVICES: ChartGuide = {
  purpose: "En qué se factura: cuánto aporta cada servicio, de mayor a menor.",
  actions: [YEAR, MONTH, AS_TABLE],
  reading:
    "Los porcentajes son sobre la venta del periodo, y la nota de abajo la escribe con su cifra. Un servicio que no vendió nada no se dibuja.",
};

/** Concentration by payer. */
export const GUIDE_SALES_PAYERS: ChartGuide = {
  purpose: "Quién paga: si la venta se concentra en pocas aseguradoras o está repartida.",
  actions: [YEAR, MONTH, { control: "Ver como tabla", effect: "la lista entera de pagadores." }],
  reading:
    "Se dibujan los diez mayores del periodo y la nota dice qué parte de la venta son. Cada pagador sale con el nombre que trae el reporte; las líneas que no declaran ninguno se agrupan en «Sin identificación».",
};

/** Month-by-month evolution. */
export const GUIDE_SALES_EVOLUTION: ChartGuide = {
  purpose: "Cómo se mueve la facturación mes a mes, y contra el mismo mes de otro año.",
  actions: [
    { control: "Año", effect: "marca varios para comparar ejercicios." },
    { control: "Mes", effect: "acota el eje a los meses marcados." },
    AS_TABLE,
  ],
  reading:
    "Un mes que nunca cargaste lleva una marca gris y una raya en la tabla — no es un mes en cero.",
};
