/**
 * The shapes of the printable PyG report. They describe WHAT the report says, never how it
 * looks: the components under `components/profit-loss/report/` mount these and nothing else.
 *
 * The report is one template for both modes. What the mode changes is declared — which sections
 * exist (`sections.ts`) and what the cover writes — and nowhere else.
 */
import type { EntityLogo } from "@/lib/logos";

/** One labelled line of the cover: «Centro» → «Consolidado (suma de 6 centros)». */
export interface ReportField {
  label: string;
  value: string;
}

/**
 * The «apartado humano» that opens the report, already written in Spanish.
 *
 * On screen the filter bar is right there, so a filtered view explains itself. On paper the bar
 * is gone, and a filtered report is indistinguishable from a complete one — which is why
 * `filters` writes every filter, INCLUDING the ones nobody marked.
 */
export interface ReportCover {
  /** The label the user gave this client — never the razón social of the file. */
  clientName: string;
  /** El logo del cliente, si subió uno. Como el nombre, tampoco sale de ningún archivo. El
   *  consolidado entre clientes no tiene: no es un cliente. */
  logo?: EntityLogo;
  /** The razón social the file declares. Different thing, deliberately never compared. */
  companyName: string;
  /** How the accounting system is NAMED; its id is not UI text. */
  systemLabel: string;
  modeLabel: string;
  /** «Qué está mirando»: center, years, granularity, coverage. */
  scope: ReportField[];
  /** «Filtros aplicados», the unmarked ones included. */
  filters: ReportField[];
  /** Why an empty cell is empty — the one rule a reader cannot infer from the page. */
  coverageNote: string;
  generatedAt: string;
}

export type ReportSectionId =
  | "portada"
  | "resumen"
  | "graficos"
  | "analisis"
  | "vertical"
  | "estado"
  | "centros";

export interface ReportSection {
  id: ReportSectionId;
  title: string;
  subtitle: string;
  /**
   * Whether this section starts a fresh page. It is DECLARED per section and not applied to all
   * of them by CSS: a section that opens a page and then fills a third of it costs the reader the
   * page turn anyway, and it is the same criterion `reportSections` already applies to decide
   * which sections exist at all.
   */
  breakBefore: boolean;
}

/** One column of the by-centers annex: a center, or the Consolidado that closes it. */
export interface CentersAnnexColumn {
  id: string;
  name: string;
}

/**
 * A row of the annex. `kind` is the UNIT, which is what tells a formatter whether it is looking
 * at money or at a share — the annex mixes both and the number alone does not say which.
 */
export interface CentersAnnexRow {
  id: string;
  label: string;
  kind: "amount" | "result" | "percent";
  /** Index-aligned with `columns`; `null` where that center has nothing to report. */
  values: (number | null)[];
}

export interface CentersAnnex {
  columns: CentersAnnexColumn[];
  rows: CentersAnnexRow[];
}
