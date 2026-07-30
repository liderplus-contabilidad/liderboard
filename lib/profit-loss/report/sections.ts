/**
 * Which sections the report carries, and in what order.
 *
 * This exists as a function rather than as a list inlined in the component because the report's
 * structural conditionals live here, in one place. Absent, not empty and not disabled — the same
 * rule `MODULE_VIEWS` follows, where a module missing from the registry renders `ComingSoon`
 * instead of an inert panel. **A section that exists but has nothing to say still costs the reader
 * a page turn**, and that sentence is the whole criterion:
 *
 * - the by-centers annex only exists in multi mode;
 * - the vertical analysis only exists when it says something the statement does not. Since the
 *   report accumulates, the statement already carries a «% Ing.» column; a vertical analysis over
 *   Ingresos with no second year to compare against is that same column, printed again on its own
 *   page. Give it another base, or a year to compare, and it is a different table.
 */
import type { ReportSection } from "./types";

const VERTICAL: ReportSection = {
  id: "vertical",
  title: "Análisis vertical",
  subtitle: "Cuánto pesa cada cuenta sobre la base",
};

const CENTERS_ANNEX: ReportSection = {
  id: "centros",
  title: "Anexo: centros de costo",
  subtitle: "Cuánto aporta cada centro",
};

export interface ReportSectionsInput {
  mode: "single" | "multi";
  /**
   * Whether the vertical analysis has anything the statement's own «% Ing.» column does not: a
   * base other than Ingresos, or a second year to read the structure against.
   */
  vertical: boolean;
}

/**
 * The report's sections. The order is the reading order of an executive report: first what the
 * figures say, and last the detail that holds them up.
 */
export function reportSections(input: ReportSectionsInput): ReportSection[] {
  return [
    { id: "portada", title: "Estado de Resultados", subtitle: "Informe" },
    { id: "resumen", title: "Resumen del periodo", subtitle: "Las cifras de cierre" },
    { id: "graficos", title: "Gráficos", subtitle: "Cuánto y de qué" },
    { id: "analisis", title: "Análisis", subtitle: "Cómo cambia" },
    ...(input.vertical ? [VERTICAL] : []),
    {
      id: "estado",
      title: "Estado de resultados",
      subtitle: "El detalle que sostiene lo anterior",
    },
    ...(input.mode === "multi" ? [CENTERS_ANNEX] : []),
  ];
}
