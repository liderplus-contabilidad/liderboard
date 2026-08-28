/**
 * Sueldos por Áreas' printable report: which sections it carries, in what order, which are omitted
 * and what its header writes. Pure — it computes no figure of its own — and therefore testable
 * without mounting a chart.
 *
 * It is the same card asked for N+1 times: each section comes out of `buildSalariesGrid` +
 * `buildSalariesCard`, the SAME ones the screen already builds, varying only `areas` — `[]` for the
 * consolidado and `[area]` for each area. That is what makes it impossible for the paper to say a
 * figure the screen does not say: a second definition of an employee's cost could drift from the
 * first with no screen giving it away.
 *
 * The report IGNORES the bar's Área mark —by definition it puts out the consolidado and every area—
 * and HONOURS those of Año and Mes, which are the ones that decide which columns exist.
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

/** One section of the report: the consolidado, or one area's detail. */
export interface SalariesReportSection {
  /** Stable: `"consolidado"`, or `area:${area}`. */
  id: string;
  card: ChartCardSpec;
}

export interface SalariesReportHeader {
  /** The label the user gave the client, with its cost center if it declared one («Delicmar · Planta
   *  Ambato») — never the razón social of any file. */
  clientName: string;
  /** The LEFT-hand one: the client's. Who occupies each side is decided by `letterheadLogos`, the
   *  same rule that places the payslip's and the Excel's. */
  logo?: EntityLogo;
  /** The RIGHT-hand one: the cost center's, when it was declared and given a logo. */
  rightLogo?: EntityLogo;
  /** «Ene 2026 – Dic 2026», or a list if the range has gaps. */
  rangeLabel: string;
  /** How many ÁREA sections the report carries — the consolidado does not count as one. */
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
  rightLogo?: EntityLogo;
  source: SalariesSource;
  filters: SalariesFilters;
  parameters: PayrollParameters;
  /** The header's stamp — it is taken once, on opening the preview, so it does not keep advancing
   *  while the reader looks at the report. The pure layer does not read the clock on its own. */
  generatedAt: Date;
}

export function buildSalariesReport(input: BuildSalariesReportInput): SalariesReport {
  const { clientName, logo, rightLogo, source, filters, parameters, generatedAt } = input;
  // The Área mark is ignored here, in the only place that assembles the report: neither the
  // consolidado nor any area section receives it.
  const baseFilters: SalariesFilters = { ...filters, areas: [] };

  const consolidated = buildSalariesGrid(source, baseFilters, parameters);

  const areaSections: SalariesReportSection[] = [];
  for (const area of salariesUniverse(source).areas) {
    const grid = buildSalariesGrid(source, { ...baseFilters, areas: [area] }, parameters);
    // Absent, not empty: a blank page costs the reader a page turn just as a full one does.
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
      ...(rightLogo ? { rightLogo } : {}),
      rangeLabel: rangeLabel(consolidated.columns),
      areaCount: areaSections.length,
      generatedAt: formatTimestampEs(generatedAt),
    },
    sections,
  };
}

/**
 * «Ene 2026 – Dic 2026» when the columns are a continuous span; «Ene 2025, Ene 2026» when they are
 * not — the same distinction PyG's `periodRangeLabel` makes for its own axis, rewritten here over
 * `SalariesColumn` so as not to tie Rol de Pagos to PyG through presentation.
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
