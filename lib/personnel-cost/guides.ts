/**
 * What the ⓘ of each card opens. It travels inside the `ChartCardSpec` and not in a catalogue indexed
 * by id for the reason `lib/charts/types.ts` writes down: a card changes shape with what is marked,
 * and a second list would end up describing a card other than the one being looked at.
 *
 * The `control` fields carry the EXACT on-screen label, because a help text that does not say where
 * the control is forces the reader to hunt for it.
 */
import type { ChartGuide } from "@/lib/charts/types";

export const GUIDE_SECTIONS: ChartGuide = {
  purpose:
    "Cuánto del costo de personal es gente en nómina y cuánto son honorarios de fuera — la conclusión que el libro deja en dos celdas al pie.",
  actions: [
    { control: "Año", effect: "Con uno el eje son los meses; con varios, los ejercicios." },
    { control: "Mes", effect: "Acota el tramo que se suma y el de las ventas que lo dividen." },
    { control: "Grupo", effect: "Deja fuera un grupo entero: la partición se recalcula sin él." },
  ],
  reading:
    "Las dos barras suman el total del mes, así que lo que se lee es la proporción. El porcentaje del encabezado es sobre ventas, no sobre el costo.",
};

export const GUIDE_REVENUE_RATIO: ChartGuide = {
  purpose:
    "Qué proporción de lo facturado se va en personal, mes a mes — la métrica que la firma arrastra desde 2021.",
  actions: [
    { control: "Año", effect: "Con varios, cada ejercicio es una serie sobre los mismos meses." },
    { control: "Grupo", effect: "Mide sólo lo que quede marcado contra las mismas ventas." },
  ],
  reading:
    "Un mes sin estado de resultados cargado no dibuja punto: no es un cero, es que no hay con qué dividir.",
};

export const GUIDE_GROUPS: ChartGuide = {
  purpose: "Cómo se mueven los tres grupos del comparativo a lo largo del ejercicio.",
  actions: [
    { control: "Mes", effect: "Acota el eje a los meses marcados." },
    { control: "Grupo", effect: "Quita una banda de la pila." },
    { control: "Ver como tabla", effect: "Las mismas cifras, con sus totales." },
  ],
  reading:
    "Las bandas se apilan hasta el total del mes. Una banda plana no es un error: la nómina propia varía poco y lo que mueve el total son los honorarios.",
};

export const GUIDE_CONCEPTS: ChartGuide = {
  purpose: "Qué conceptos pesan dentro del costo de personal del tramo.",
  actions: [
    { control: "Grupo", effect: "Acota el ranking a los grupos marcados." },
    { control: "Ver como tabla", effect: "La lista completa, incluida la cola que no se dibuja." },
  ],
  reading:
    "El porcentaje de cada barra es sobre el COSTO DE PERSONAL y no sobre las ventas — es la única cifra de la pantalla medida contra otro denominador, y por eso lo dice la columna.",
};
