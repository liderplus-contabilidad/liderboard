/**
 * El informe imprimible de Sueldos por Áreas: qué secciones lleva, en qué orden, cuáles se omiten
 * y qué escribe su cabecera. Puro — no calcula ninguna cifra propia — y por eso testeable sin
 * montar un gráfico.
 *
 * Es la misma tarjeta pedida N+1 veces: cada sección sale de `buildSalariesGrid` +
 * `buildSalariesCard`, las MISMAS que la pantalla ya construye, variando solo `areas` — `[]` para
 * el consolidado y `[area]` para cada área. Eso es lo que hace que el papel no pueda decir una
 * cifra que la pantalla no diga: una segunda definición del costo de un empleado podría separarse
 * de la primera sin que ninguna pantalla lo delate.
 *
 * El informe IGNORA la marca de Área de la barra —por definición saca el consolidado y todas las
 * áreas— y HONRA las de Año y Mes, que son las que deciden qué columnas existen.
 */
import { formatTimestampEs, MONTHS_SHORT_ES } from "@/lib/date";
import type { ChartCardSpec } from "@/lib/charts/types";
import type { EntityLogo } from "@/lib/workspaces";
import type { PayrollParameters } from "../engine/parameters";
import { buildSalariesCard } from "./chart";
import type { SalariesFilters } from "./filters";
import {
  buildSalariesGrid,
  salariesUniverse,
  type SalariesColumn,
  type SalariesSource,
} from "./grid";

/** Una sección del informe: el consolidado, o el detalle de un área. */
export interface SalariesReportSection {
  /** Estable: `"consolidado"`, o `area:${area}`. */
  id: string;
  card: ChartCardSpec;
}

export interface SalariesReportHeader {
  /** La etiqueta que el usuario le dio al cliente — nunca la razón social de ningún archivo. */
  clientName: string;
  logo?: EntityLogo;
  /** «Ene 2026 – Dic 2026», o una lista si el rango tiene huecos. */
  rangeLabel: string;
  /** Cuántas secciones de ÁREA trae el informe — el consolidado no cuenta como una. */
  areaCount: number;
  generatedAt: string;
}

export interface SalariesReport {
  header: SalariesReportHeader;
  sections: SalariesReportSection[];
}

export interface BuildSalariesReportInput {
  clientName: string;
  logo?: EntityLogo;
  source: SalariesSource;
  filters: SalariesFilters;
  parameters: PayrollParameters;
  /** El sello de la cabecera — se toma una vez, al abrir la vista previa, para que no vaya
   *  avanzando mientras el lector mira el informe. La capa pura no lee el reloj por su cuenta. */
  generatedAt: Date;
}

export function buildSalariesReport(input: BuildSalariesReportInput): SalariesReport {
  const { clientName, logo, source, filters, parameters, generatedAt } = input;
  // La marca de Área se ignora aquí, en el único sitio que arma el informe: ni el consolidado ni
  // ninguna sección de área la reciben.
  const baseFilters: SalariesFilters = { ...filters, areas: [] };

  const consolidated = buildSalariesGrid(source, baseFilters, parameters);

  const areaSections: SalariesReportSection[] = [];
  for (const area of salariesUniverse(source).areas) {
    const grid = buildSalariesGrid(source, { ...baseFilters, areas: [area] }, parameters);
    // Ausente, no vacía: una página en blanco le cuesta al lector la vuelta de hoja igual que
    // una llena.
    if (grid.rows.length === 0) {
      continue;
    }
    areaSections.push({ id: `area:${area}`, card: buildSalariesCard(grid) });
  }

  const sections: SalariesReportSection[] =
    consolidated.rows.length > 0
      ? [{ id: "consolidado", card: buildSalariesCard(consolidated) }, ...areaSections]
      : [];

  return {
    header: {
      clientName,
      ...(logo ? { logo } : {}),
      rangeLabel: rangeLabel(consolidated.columns),
      areaCount: areaSections.length,
      generatedAt: formatTimestampEs(generatedAt),
    },
    sections,
  };
}

/**
 * «Ene 2026 – Dic 2026» cuando las columnas son un tramo continuo; «Ene 2025, Ene 2026» cuando no
 * lo son — la misma distinción que `periodRangeLabel` de PyG hace para su propio eje, reescrita
 * aquí sobre `SalariesColumn` para no atar Rol de Pagos a PyG por la presentación.
 */
function rangeLabel(columns: readonly SalariesColumn[]): string {
  if (columns.length === 0) {
    return "Sin períodos con nómina";
  }
  const labels = columns.map((column) => `${MONTHS_SHORT_ES[column.monthIndex]} ${column.year}`);
  if (labels.length === 1) {
    return labels[0];
  }
  const contiguous = columns.every((column, index) => {
    if (index === 0) {
      return true;
    }
    const prev = columns[index - 1];
    const nextMonth = (prev.monthIndex + 1) % 12;
    const nextYear = prev.monthIndex === 11 ? prev.year + 1 : prev.year;
    return column.year === nextYear && column.monthIndex === nextMonth;
  });
  return contiguous ? `${labels[0]} – ${labels[labels.length - 1]}` : labels.join(", ");
}
