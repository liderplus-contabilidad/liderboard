/**
 * The report's cover, written out in Spanish.
 *
 * PyG never needed this. On screen the filter bar sits above every tab, so a narrowed view
 * explains itself; Ocupaciones has had `describeSelection` for a while precisely because its
 * cards had to caption a period the bar was declaring elsewhere. On paper the bar does not
 * exist, and a report of two marked accounts looks exactly like a report of the whole chart.
 *
 * Hence the rule that shapes this module: **a filter with nothing marked is still written**,
 * and written by what not marking it implies — «Ninguna marcada — el árbol completo». An empty
 * renderón leaves the reader deciding whether there was no filter or nobody wrote it down.
 *
 * Pure, `generatedAt` included: the timestamp arrives as an argument rather than being read off
 * the clock, so the whole cover is testable.
 */
import { MONTHS_FULL_ES, MONTHS_SHORT_ES } from "@/lib/date";
import { frequencyLabel, type Frequency } from "@/lib/period";
import { periodSlotLabel } from "../analytics/period";
import { CONSOLIDADO_ID, type PygFilters } from "../filters";
import { systemLabel } from "../upload/systems";
import type { ReportCover, ReportField } from "./types";

export interface ReportSummaryInput {
  /** The name the user gave the client — never the razón social of the file. */
  clientName: string;
  companyName: string;
  /** `null` in a workspace with nothing loaded; the cover then says so instead of guessing. */
  sourceSystemId: string | null;
  /**
   * Cómo NOMBRAR el origen cuando no es un sistema contable — el consolidado entre clientes, que
   * puede venir de varios a la vez y por tanto de ninguno. Sin él, la portada de una suma de
   * Dingoo y MicroPlus diría «Sin sistema declarado», que es cierto y no significa nada.
   */
  systemLabelOverride?: string;
  mode: "single" | "multi";
  filters: PygFilters;
  /** Every account of the resolved view, so a marked code can be named rather than printed. */
  accounts: readonly { code: string; name: string }[];
  /** Selector entries, Consolidado included; empty in single mode. */
  views: readonly { id: string; name: string }[];
  /** What `resolveActiveCenterId` resolved — the report never resolves it again. */
  activeCenterId: string;
  visibleYears: readonly number[];
  frequency: Frequency;
  loadedMonthsByYear: Readonly<Record<number, readonly number[]>>;
  generatedAt: Date;
}

const MODE_LABELS: Record<"single" | "multi", string> = {
  multi: "Por centros de costo",
  single: "Estado único",
};

/** What an empty cell means. It is the one reading rule nothing on the page can convey alone. */
const COVERAGE_NOTE = "Los meses no cargados aparecen vacíos, nunca como cero.";

export function describePygReport(input: ReportSummaryInput): ReportCover {
  return {
    clientName: input.clientName,
    companyName: input.companyName,
    systemLabel:
      input.systemLabelOverride ??
      (input.sourceSystemId ? systemLabel(input.sourceSystemId) : "Sin sistema declarado"),
    modeLabel: MODE_LABELS[input.mode],
    scope: describeScope(input),
    filters: describeFilters(input),
    coverageNote: COVERAGE_NOTE,
    generatedAt: formatTimestamp(input.generatedAt),
  };
}

/** «Qué está mirando» — the resolved view, not the marks that produced it. */
function describeScope(input: ReportSummaryInput): ReportField[] {
  const fields: ReportField[] = [];

  // Single mode writes no center line at all: there are no centers to name, and a row reading
  // «Centro: —» invents a dimension this workspace does not have.
  if (input.mode === "multi") {
    fields.push({ label: "Centro", value: centerScope(input) });
  }

  fields.push(
    { label: "Años", value: joinList(input.visibleYears.map(String)) },
    { label: "Granularidad", value: frequencyLabel(input.frequency) },
    { label: "Cobertura", value: describeCoverage(input) },
  );
  return fields;
}

function centerScope(input: ReportSummaryInput): string {
  if (input.activeCenterId !== CONSOLIDADO_ID) {
    return nameOfView(input.views, input.activeCenterId);
  }
  const centers = input.views.filter((view) => view.id !== CONSOLIDADO_ID).length;
  return centers > 0
    ? `Consolidado (suma de ${centers} ${centers === 1 ? "centro" : "centros"})`
    : "Consolidado";
}

/**
 * Coverage per visible year, «2025: ene–dic · 2026: ene–jul». Written as a RANGE when the loaded
 * months are contiguous and as a list when they are not, because «ene, feb, mar…» for a full year
 * is noise while a gap in the middle is exactly what the reader needs to see.
 */
function describeCoverage(input: ReportSummaryInput): string {
  const parts = input.visibleYears.map((year) => {
    const months = [...(input.loadedMonthsByYear[year] ?? [])].sort((a, b) => a - b);
    return `${year}: ${monthsLabel(months)}`;
  });
  return parts.length > 0 ? parts.join(" · ") : "Sin cobertura declarada";
}

function monthsLabel(months: readonly number[]): string {
  if (months.length === 0) {
    return "sin cobertura declarada";
  }
  const first = months[0];
  const last = months[months.length - 1];
  const contiguous = months.length === last - first + 1;
  if (!contiguous) {
    return months.map((month) => shortMonth(month)).join(", ");
  }
  return first === last ? shortMonth(first) : `${shortMonth(first)}–${shortMonth(last)}`;
}

function shortMonth(month: number): string {
  return (MONTHS_SHORT_ES[month] ?? String(month + 1)).toLowerCase();
}

/**
 * «Filtros aplicados», every one of them — including the ones nobody marked, written by what NOT
 * marking them implies. This is the whole reason the cover exists.
 */
function describeFilters(input: ReportSummaryInput): ReportField[] {
  const fields: ReportField[] = [
    {
      label: "Cuentas",
      value:
        input.filters.codes.length > 0
          ? joinList(input.filters.codes.map((code) => nameOfAccount(input.accounts, code)))
          : "Ninguna marcada — el árbol completo",
    },
  ];

  if (input.mode === "multi") {
    fields.push({
      label: "Centros",
      value:
        input.filters.centerIds.length > 0
          ? joinList(input.filters.centerIds.map((id) => nameOfView(input.views, id)))
          : "Ninguno marcado — el Consolidado",
    });
  }

  fields.push(
    {
      label: "Años",
      value:
        input.filters.years.length > 0
          ? joinList(input.filters.years.map(String))
          : "Ninguno marcado — todos los años cargados",
    },
    {
      label: "Periodos",
      value:
        input.filters.periods.length > 0
          ? joinList(input.filters.periods.map(periodSlotLabel))
          : "Ninguno marcado — el año completo",
    },
  );
  return fields;
}

function nameOfAccount(accounts: readonly { code: string; name: string }[], code: string): string {
  const account = accounts.find((candidate) => candidate.code === code);
  return account ? `${account.code} ${account.name}` : code;
}

function nameOfView(views: readonly { id: string; name: string }[], id: string): string {
  return views.find((view) => view.id === id)?.name ?? id;
}

/** «A, B y C» — the last separator is a word, because this is prose and not a legend. */
function joinList(values: readonly string[]): string {
  if (values.length === 0) {
    return "—";
  }
  if (values.length === 1) {
    return values[0];
  }
  return `${values.slice(0, -1).join(", ")} y ${values[values.length - 1]}`;
}

/** «30 de julio de 2026, 14:22» — the local reading, which is the one the accountant checks. */
function formatTimestamp(date: Date): string {
  const day = date.getDate();
  const month = MONTHS_FULL_ES[date.getMonth()]?.toLowerCase() ?? String(date.getMonth() + 1);
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${day} de ${month} de ${date.getFullYear()}, ${hours}:${minutes}`;
}
