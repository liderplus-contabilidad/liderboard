/**
 * What «Reportería de ingresos» stores, and the narrow input its pure layer reads.
 *
 * **Only three figures per month are persisted**, and they are the three that no estado de resultados
 * contains: what was collected by card, what the issuer took in commission and what was spent on
 * Facebook advertising. The INGRESO is not among them — it is the raíz 4 of the PyG and is derived on
 * every read (`derive.ts`), the same rule by which Rol de Pagos persists not a single total. A stored
 * copy would go stale at the next adjustment in Datos and the screen would contradict the data.
 *
 * The three amounts are `number | null` and not `number`, and the whole module rests on that
 * distinction: `null` is «no se ha registrado» and `0` is «se registró y fue cero». A month with sales
 * and no capture has to stay OUT of every percentage —see `ratio.ts`— and that is impossible to say if
 * absence is written as a zero.
 */

/** Every month has twelve of them, and the axis is always the full year. */
export const MONTHS_IN_YEAR = 12;

/** A month's captured figures, as they are stored. */
export interface RevenueExternalMonth {
  /** `<clientId>:<year>-<mm>`, so rewriting a month REPLACES it by construction. */
  id: string;
  /**
   * The PyG client this belongs to. Every read and every write is bounded by it: with several clients
   * sharing one table, a query without it mixes two companies in silence and nothing downstream can
   * notice.
   */
  clientId: string;
  year: number;
  /** 0–11, as in the whole app. */
  monthIndex: number;
  /** INGRESOS POR COBRO CON TARJETAS. */
  cardRevenue: number | null;
  /** VALOR COMISIÓN / RETENCIONES. */
  cardFees: number | null;
  /** VALOR PUBLICIDAD FACEBOOK. */
  adSpend: number | null;
}

/** A month's key within a client. */
export function revenueMonthId(clientId: string, year: number, monthIndex: number): string {
  return `${clientId}:${year}-${String(monthIndex + 1).padStart(2, "0")}`;
}

/** The three captured amounts of a month, without the identity that owns them. */
export interface RevenueExternalAmounts {
  cardRevenue: number | null;
  cardFees: number | null;
  adSpend: number | null;
}

/** Twelve slots each, one per month of the year. */
export interface RevenueExternalSeries {
  cardRevenue: (number | null)[];
  cardFees: (number | null)[];
  adSpend: (number | null)[];
}

/**
 * What the pure layer receives for ONE year, and deliberately nothing else.
 *
 * It is a STRUCTURAL input and not PyG's provider context: `lib/revenue/` has no business knowing
 * about `PygDataset`, `CellEdit` or `WorkspaceMeta`, and a layer that received the whole context
 * could reach for anything in it. Whoever mounts the screen is the one that adapts PyG to this — the
 * dependency points from the component to the pure layer and never the other way round.
 */
export interface RevenueYearInput {
  year: number;
  /** Length 12. A month never loaded is `null`; a loaded month that sold nothing is `0`. */
  monthlyRevenue: (number | null)[];
  external: RevenueExternalSeries;
}

/** Twelve empty slots — the shape a year with nothing captured takes. */
export function emptyMonthSeries(): (number | null)[] {
  return Array.from({ length: MONTHS_IN_YEAR }, () => null);
}

export function emptyExternalSeries(): RevenueExternalSeries {
  return {
    cardRevenue: emptyMonthSeries(),
    cardFees: emptyMonthSeries(),
    adSpend: emptyMonthSeries(),
  };
}

/** Whether a captured month holds anything at all — what decides between a `put` and a delete. */
export function hasAnyAmount(amounts: RevenueExternalAmounts): boolean {
  return amounts.cardRevenue !== null || amounts.cardFees !== null || amounts.adSpend !== null;
}

/**
 * EXACTLY what the cards were built from. It lives HERE, beside `RevenueYearInput`, and not inside
 * `cards/`: the five builders all need it and so does the report, and having them import it from
 * `cards/index.ts` —which imports them— would be a cycle.
 *
 * The provider exposes it so the report and the Excel ask for the same cards with the same arguments
 * rather than recomposing them.
 */
export interface RevenueCardsInput {
  /** The marked years with their series, ascending. */
  years: readonly RevenueYearInput[];
  /** The span: the marked months, or every loaded month of the marked years. */
  months: readonly number[];
  /** How that span is named (`periodLabel`), so every subtitle says the same thing. */
  period: string;
  /** Whether this workspace holds captured figures at all — see `availability.ts`. */
  canCapture: boolean;
}
