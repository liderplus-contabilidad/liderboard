/**
 * What «Ventas por servicio» stores, and nothing else: the INVOICE LINE the report brings and the
 * MONTH containing it. Nothing derived lives here —the breakdown by service, the concentration by
 * payer and the year's evolution are recomputed on every read (`derive.ts`)—, the same rule by which
 * Rol de Pagos persists not a single total: a copy stored separately goes stale on the next upload and
 * the screen would say one thing and the data another.
 *
 * The grain is the line because it is what the file declares and the only thing the firm can check a
 * figure against. What does NOT happen is a view walking them: every reading aggregates before
 * reaching a card.
 */

/**
 * A row of the report: which service, who pays for it, how many and for how much.
 *
 * `serviceCode` goes VERBATIM —the report writes `\01`, with its backslash— for the same reason Dingoo
 * keeps the zeros of `5.02.01`: it is what the accountant checks against their own file. `payer`
 * stores the WHOLE name, people's included: anonymity is a PRESENTATION decision (`payer.ts`), and a
 * figure whose owner was not stored stops being traceable.
 */
export interface SalesLine {
  serviceCode: string;
  serviceName: string;
  payer: string;
  quantity: number;
  amount: number;
}

/**
 * A month read from the Excel, which does not belong to anybody yet — the mirror of `ParsedDataset` in
 * PyG. Who its owner is is decided by the client that is open, and `db.ts` STAMPS it at the door,
 * never the file.
 */
export interface ParsedSalesMonth {
  year: number;
  /** 0–11, as in the whole app. */
  monthIndex: number;
  /** The razón social the file DECLARES — never the name the user gave the client. */
  companyName: string;
  lines: SalesLine[];
  /**
   * The total of the report's own closing row, or `null` if it does not write one. It is stored so it
   * is possible to say WHAT it was squared against: without it, a difference can only be asserted at
   * upload time and is lost on reloading the screen.
   */
  declaredTotal: number | null;
  /** What the reading had to warn about — the imbalance against `declaredTotal`, above all. */
  warnings: string[];
}

/** What is stored: the month read plus its owner. `id` is `<clientId>:<year>-<month>`, so reloading a
 *  month REPLACES it by construction instead of leaving two rows of the same period. */
export interface SalesMonth extends ParsedSalesMonth {
  id: string;
  clientId: string;
}

/** A month's key within a client. */
export function salesMonthId(clientId: string, year: number, monthIndex: number): string {
  return `${clientId}:${year}-${String(monthIndex + 1).padStart(2, "0")}`;
}

/**
 * A year's COVERAGE: which months arrived. It is a list of indices and not twelve slots because what
 * the app has to be able to say is «this month NEVER arrived», which is different from «it arrived and
 * came in at zero» — the same distinction `loadedMonthsByYear` in PyG and `monthHasData` in
 * Ocupaciones rest on.
 */
export interface SalesCoverage {
  year: number;
  /** Indices 0–11, ascending, without repeats. */
  months: number[];
}
