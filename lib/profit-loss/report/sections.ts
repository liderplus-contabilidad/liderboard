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
 * - the vertical analysis only exists while the workspace has something to divide. It used to
 *   answer to a second condition —«¿lo dice ya el estado?»— back when the statement accumulated
 *   and carried its own «% Ing.» column. The statement now prints the Datos breakdown, which has
 *   no such column, so this is the report's ONE vertical reading and it is never a repeat.
 *
 * **`breakBefore` is the same criterion applied one notch further.** The page break used to live
 * in `globals.css` on `.print-section`, so EVERY section opened a page — and the cover, which
 * fills two thirds of a sheet, and the summary, which is three tiles, each left most of a page
 * blank. The three that declare it are the full-page tables; the four that read continuously do
 * not. `.print-section > header` carries `break-after: avoid`, so a section that flows still
 * never leaves its heading stranded at the foot of the previous page.
 */
import type { ReportSection } from "./types";

const VERTICAL: ReportSection = {
  id: "vertical",
  title: "Análisis vertical",
  subtitle: "Cuánto pesa cada cuenta sobre la base",
  breakBefore: true,
};

const CENTERS_ANNEX: ReportSection = {
  id: "centros",
  title: "Anexo: centros de costo",
  subtitle: "Cuánto aporta cada centro",
  breakBefore: true,
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
    { id: "portada", title: "Estado de Resultados", subtitle: "Informe", breakBefore: false },
    {
      id: "resumen",
      title: "Resumen del periodo",
      subtitle: "Las cifras de cierre",
      breakBefore: false,
    },
    { id: "graficos", title: "Gráficos", subtitle: "Cuánto y de qué", breakBefore: false },
    { id: "analisis", title: "Análisis", subtitle: "Cómo cambia", breakBefore: false },
    ...(input.vertical ? [VERTICAL] : []),
    {
      id: "estado",
      title: "Estado de resultados",
      subtitle:
        input.mode === "multi"
          ? "El detalle completo: el Consolidado y cada centro, periodo a periodo"
          : "El detalle completo, periodo a periodo",
      breakBefore: true,
    },
    ...(input.mode === "multi" ? [CENTERS_ANNEX] : []),
  ];
}
