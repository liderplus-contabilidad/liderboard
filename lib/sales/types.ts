/**
 * What «Ventas por servicio» stores: the INVOICE LINE the flat report brings, the MONTH containing
 * it, and that month's COVERAGE. Nothing else derived lives here — every reading is recomputed
 * (`derive.ts`). Why the grain is the line, with its measurements: `docs/architecture.md`.
 */

/**
 * A row of the report. One field per column the firm declared relevant —`FECHA` resolves into the
 * month the line is stored under— plus `articleCode`, kept because the truncated NAME cannot
 * identify an article. Text is stored verbatim except for whitespace, trimmed at the door.
 * `amount` is the NETO, the only figure the module measures with.
 */
export interface SalesLine {
  /** `SEGURO`. Never empty in the real report, which is why there is no «unidentified» group. */
  seguro: string;
  /** `TIPO DE SERVICIO.` — a name, not a code: the report declares none. */
  tipo: string;
  /** `COD. ARTICULO` — the article's IDENTITY. */
  articleCode: string;
  /** `NOMBRE DEL ARTICULO` — its LABEL. The code joins it on screen only where two articles
   *  would otherwise read the same (`derive.ts`, `disambiguate`). */
  articleName: string;
  /** `VENDEDOR`, or empty where the report declares none. */
  vendor: string;
  /** `NETO`. */
  amount: number;
}

/**
 * What a month's file declares ABOUT the month, kept apart from its lines so «which years and
 * months exist» is answered without deserialising them. The only derived thing persisted; it is
 * written in the same transaction as the lines it summarises.
 */
export interface SalesMonthCoverage {
  year: number;
  /** 0–11, as in the whole app. */
  monthIndex: number;
  lineCount: number;
  /** First and last day the file's lines of this month cover (1–31) — what lets the modal say a
   *  reload brings only part of the month. */
  firstDay: number;
  lastDay: number;
  /** `COD. EMPRESA` — one value per file, and the module's whole identity (`identity.ts`). */
  companyCode: string;
}

/**
 * A month read from the Excel, not yet anybody's: `db.ts` stamps the open client at the door.
 * Reading warnings belong to the FILE (`SalesFileReading`), never to a month.
 */
export interface ParsedSalesMonth extends SalesMonthCoverage {
  lines: SalesLine[];
}

/** What is stored: the month's LINES plus its owner. `id` is `<clientId>:<year>-<month>`, so
 *  reloading a month REPLACES it by construction instead of leaving two rows of the same period. */
export interface SalesMonth {
  id: string;
  clientId: string;
  year: number;
  /** 0–11. */
  monthIndex: number;
  lines: SalesLine[];
}

/** The coverage row, in its own table so it can be read without the lines. Same `id` as its month,
 *  so the two are written and deleted together. */
export interface SalesCoverage extends SalesMonthCoverage {
  id: string;
  clientId: string;
}

/** A month's key within a client. */
export function salesMonthId(clientId: string, year: number, monthIndex: number): string {
  return `${clientId}:${year}-${String(monthIndex + 1).padStart(2, "0")}`;
}
