/**
 * WHO can capture the external figures — the one place that decides it, so lifting the lock the day
 * another client asks for it is a single line and not a hunt through the folder.
 *
 * **There are two different rules in this module, and only ONE of them is a lock.**
 *
 * The comparativo and the crecimiento read the raíz 4 of the estado de resultados, which every chart
 * of accounts declares: they are available for ANY workspace, MicroPlus, Dingoo, estado único or
 * mensual por centros, and also inside the cross-client consolidado. That rule is STRUCTURAL —does the
 * plan have income accounts— and it is not decided here: it is decided by there being something to
 * read. It is the same lesson `EXPENSE_DISTRIBUTION_PRESET` already learnt, where a lock tied to the
 * system turned out to be a legibility problem and not a computational one.
 *
 * What IS locked is the capture, for two independent reasons:
 *
 * - **MicroPlus**: cobros con tarjeta, comisiones and pauta are figures this one client keeps, and
 *   offering the drawer to a workspace whose firm does not track them is offering an empty form.
 * - **Never the consolidado**: it is not a client but the SUM of all of them, so writing there would
 *   create a partition that belongs to nobody, that no screen lists and that no deletion reaches —
 *   the same defence `assertRealClient` mounts in PyG's database.
 *
 * Where this returns `false` the three «vs» cards and «Registrar datos» are NOT DRAWN. They are not
 * painted disabled: a control that means nothing for the open data does not render, which is the rule
 * the filter bar already holds up everywhere else.
 */
import { MICROPLUS_SYSTEM } from "@/lib/profit-loss/upload/systems";

export interface RevenueWorkspaceContext {
  /** The `id` of the upload strategy the workspace came from; `null` in the consolidado. */
  sourceSystemId: string | null;
  /** Whether what is open is the cross-client consolidado rather than a real client. */
  isConsolidated: boolean;
}

/** Whether this workspace can hold captured figures of its own. */
export function canCaptureExternal({
  sourceSystemId,
  isConsolidated,
}: RevenueWorkspaceContext): boolean {
  if (isConsolidated) {
    return false;
  }
  return sourceSystemId === MICROPLUS_SYSTEM;
}
