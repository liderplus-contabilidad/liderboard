/**
 * El informe imprimible de «Ventas por servicio»: qué secciones lleva, en qué orden y qué escribe
 * su cabecera. Puro —no calcula ninguna cifra propia— y por eso testeable sin montar un gráfico.
 *
 * **Son las MISMAS tarjetas de la pantalla**, `buildSalesCards` con las mismas marcas del usuario,
 * y eso es lo único que garantiza que el papel no pueda decir una cifra que la pantalla no diga:
 * una segunda derivación del reparto por servicio podría separarse de la primera sin que nada lo
 * delatara, y quien recibe el PDF ya no tiene la pantalla al lado para cotejar.
 *
 * Lo que la cabecera escribe es lo que en pantalla dice la BARRA, que en papel ya no está: el
 * cliente, el periodo que cubre el informe y la fecha en que se generó.
 */
import type { ChartCardSpec } from "@/lib/charts/types";
import { formatTimestampEs } from "@/lib/date";
import type { EntityLogo } from "@/lib/workspaces";
import { buildSalesCards, PAYER_TABLE_PRINT_LIMIT, type SalesCardsInput } from "./cards";

export interface SalesReportHeader {
  /** La etiqueta que el usuario le dio al cliente — nunca la razón social de ningún archivo. */
  clientName: string;
  /** La razón social que DECLARAN los archivos, cuando la hay: es lo que identifica de qué empresa
   *  es esta facturación, y en papel no está el selector que lo diría. */
  companyName?: string;
  /** El de la IZQUIERDA, del cliente — el mismo reparto de `letterheadLogos`. */
  logo?: EntityLogo;
  /** El de la DERECHA, del centro de costo que el cliente haya declarado. */
  rightLogo?: EntityLogo;
  /** «Abril 2026», «Ene–Abr 2026», «Ene, Mar, Abr 2026». */
  periodLabel: string;
  generatedAt: string;
}

export interface SalesReportSection {
  /** Estable e independiente del texto: es la clave de React y lo que nombra un test. */
  id: string;
  card: ChartCardSpec;
}

export interface SalesReport {
  header: SalesReportHeader;
  sections: SalesReportSection[];
}

export interface BuildSalesReportInput extends SalesCardsInput {
  clientName: string;
  companyName?: string;
  logo?: EntityLogo;
  rightLogo?: EntityLogo;
  generatedAt: Date;
}

/**
 * Las TRES lecturas, en el orden en que se leen en pantalla. Ninguna se omite por estar vacía: un
 * informe que perdiera la evolución no diría que el año está a medias, diría que no hay evolución
 * — y la tarjeta ya sabe explicarse sola cuando no tiene nada que dibujar.
 */
export function buildSalesReport(input: BuildSalesReportInput): SalesReport {
  // El ÚNICO sitio en el que el papel se separa de la pantalla, y lo decide el informe y no la
  // tarjeta: la cola de pagadores se pliega en una fila con su suma. Ver `PAYER_TABLE_PRINT_LIMIT`.
  const cards = buildSalesCards({ ...input, payerTableLimit: PAYER_TABLE_PRINT_LIMIT });
  return {
    header: {
      clientName: input.clientName,
      ...(input.companyName ? { companyName: input.companyName } : {}),
      ...(input.logo ? { logo: input.logo } : {}),
      ...(input.rightLogo ? { rightLogo: input.rightLogo } : {}),
      periodLabel: input.period,
      generatedAt: formatTimestampEs(input.generatedAt),
    },
    sections: [
      { id: "services", card: cards.services },
      { id: "payers", card: cards.payers },
      { id: "evolution", card: cards.evolution },
    ],
  };
}
