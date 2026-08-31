/**
 * What «Análisis costo personal» stores — **one figure per month, and nothing else** — and the narrow
 * input its pure layer reads.
 *
 * The only thing persisted is the **nómina de la familia**: how much of the month's administrative
 * payroll belongs to the owning family. No chart of accounts separates it —that is precisely why the
 * workbook writes it as a hard number in the cell— so it is the one figure this module cannot derive.
 *
 * Everything else on the screen —the twenty-one rows, the three group subtotals, the two section
 * subtotals, the grand total, the three levels of percentage and the four cards— is recomputed from
 * PyG on every render. A stored copy goes stale at the next adjustment in Datos and the screen would
 * contradict the data: the same rule by which Rol de Pagos persists not a single total.
 *
 * **A database of its own** (`liderboard-personnel-cost`), separate from PyG's even though the
 * partition is PyG's client: what is stored here is not an account of any chart of accounts, and
 * putting it in the estado de resultados' database would force that database to hold something that
 * is not an account. What is shared is the client's identity, not the store — `lib/revenue/db.ts`'s
 * same reasoning.
 */

/** Every year has twelve of them, and the axis is always the full year. */
export const MONTHS_IN_YEAR = 12;

/** A month's captured figure, as it is stored. */
export interface PersonnelFamilyMonth {
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
  /**
   * The family's share of that month's administrative payroll.
   *
   * It is a `number` and never `null`: absence is written by the row NOT EXISTING, which is what
   * `db.ts` does when the cell is cleared. A stored row of `null` and no row have to mean the same
   * thing — «no se ha registrado» — and keeping both spellings would leave the table growing a row per
   * month the user merely tabbed through.
   */
  amount: number;
}

/** A month's key within a client. */
export function familyMonthId(clientId: string, year: number, monthIndex: number): string {
  return `${clientId}:${year}-${String(monthIndex + 1).padStart(2, "0")}`;
}

/** Twelve empty slots — the shape a year with nothing captured takes. */
export function emptyFamilySeries(): (number | null)[] {
  return Array.from({ length: MONTHS_IN_YEAR }, () => null);
}

/**
 * What the pure layer receives for ONE year, and deliberately nothing else.
 *
 * It is a STRUCTURAL input and not PyG's provider context: `lib/personnel-cost/` has no business
 * knowing about `PygDataset`, `CellEdit` or `WorkspaceMeta`, and a layer that received the whole
 * context could reach for anything in it. Whoever mounts the screen adapts PyG to this — the
 * dependency points from the component to the pure layer and never the other way round, which is what
 * lets the whole engine be tested without mounting anything.
 */
export interface PersonnelCostYearInput {
  year: number;
  /**
   * The workspace's DECLARED coverage for this year (`WorkspaceMeta.loadedMonthsByYear`), ascending.
   *
   * It is declared and never inferred from the values, because the two answer different questions: a
   * loaded month where a concept happens to be zero is a real zero, and a month never loaded is not a
   * figure at all. Everything downstream —the axes, the totals, the three percentages— rests on that
   * distinction.
   */
  coverage: readonly number[];
  /**
   * The rollups the map asks for, by MicroPlus code (trailing dot already stripped), twelve raw slots
   * each. A code this client's plan does not have is simply ABSENT from the map — not present as
   * twelve zeros, which would be the claim that the account exists and moved nothing.
   */
  accounts: ReadonlyMap<string, readonly number[]>;
  /** The raíz 4 of the estado de resultados, twelve raw slots — the denominator of every percentage. */
  revenue: readonly number[];
  /** The captured nómina de familia: `null` where nothing was written, even inside coverage. */
  family: readonly (number | null)[];
}
