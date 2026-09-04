import type { ChartGuide, ChartGuideAction } from "@/lib/charts/types";

/** The bar's two controls, which the three cards share. */
const YEAR: ChartGuideAction = {
  control: "Año",
  effect: "marca varios y cada uno se dibuja aparte.",
};
const MONTH: ChartGuideAction = { control: "Mes", effect: "qué meses entran." };
/** The mark that narrows the WHOLE screen, which is why it is named in the three guides. */
const SERVICE: ChartGuideAction = {
  control: "Servicio",
  effect: "acota todo a lo marcado, aquí y en las otras tarjetas.",
};
const AS_TABLE: ChartGuideAction = { control: "Ver como tabla", effect: "los números exactos." };

/** Composition by service. */
export const GUIDE_SALES_SERVICES: ChartGuide = {
  purpose: "En qué se factura: cuánto aporta cada servicio, de mayor a menor.",
  actions: [YEAR, MONTH, SERVICE, AS_TABLE],
  reading:
    "Los porcentajes son sobre la venta del periodo, y la nota de abajo la escribe con su cifra. Un servicio que no vendió nada no se dibuja.",
};

/** Concentration by payer. */
export const GUIDE_SALES_PAYERS: ChartGuide = {
  purpose: "Quién paga: si la venta se concentra en pocas aseguradoras o está repartida.",
  actions: [
    YEAR,
    MONTH,
    { control: "Servicio", effect: "quién paga ESE servicio." },
    { control: "Ver como tabla", effect: "la lista entera de pagadores." },
  ],
  reading:
    "Se dibujan los diez mayores del periodo y la nota dice qué parte de la venta son. Cada pagador sale con el nombre que trae el reporte; las líneas que no declaran ninguno se agrupan en «Sin identificación».",
};

/** Month-by-month evolution. */
export const GUIDE_SALES_EVOLUTION: ChartGuide = {
  purpose: "Cómo se mueve la facturación mes a mes, de qué está hecho cada mes, y contra otro año.",
  actions: [
    { control: "Año", effect: "marca varios para comparar ejercicios." },
    { control: "Mes", effect: "acota el eje a los meses marcados." },
    { control: "Servicio", effect: "deja en la columna solo lo marcado." },
    { control: "Ver como", effect: "el mismo desglose en 3D o apilado." },
    AS_TABLE,
  ],
  reading:
    "Con un año el mes se parte por servicio, y eso se puede ver de dos formas: en «Skyline 3D» cada servicio es una fila que arranca en cero, para seguir hacia dónde va; en «Apilado» la columna se lee entera contra la línea de su total. Comparando años vuelve a una barra por año. Un mes que nunca cargaste no dibuja nada y lleva una raya en la tabla — no es un mes en cero.",
};
