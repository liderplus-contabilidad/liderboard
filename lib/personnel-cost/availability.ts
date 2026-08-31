/**
 * WHO can read this análisis — the one place that decides it, so lifting the lock the day another
 * client asks for it is a single line and not a hunt through the folder.
 *
 * **The lock is by SYSTEM, and that is a departure from what `lib/revenue/availability.ts` learnt.**
 * Over there the comparativo reads the raíz 4, which every chart of accounts declares, so tying it to
 * MicroPlus turned out to be a legibility problem and not a computational one. Here it is the
 * opposite: what `accounts.ts` maps are twenty-one SPECIFIC leaf and branch codes of the MicroPlus
 * default plan —`5.2.04.01.03`, `5.3.03.17.06`— and in a Dingoo or a monthly-by-centers workspace
 * those codes are not the same accounts under another name, they are other accounts. A screen drawn
 * there would not be empty, which would be honest; it would be WRONG, which is worse.
 *
 * **Never the consolidado**, for a second and independent reason: it is not a client but the SUM of
 * all of them, and this análisis rests on a figure —the nómina de la familia— that is written client
 * by client. Capturing there would create a partition that belongs to nobody, that no screen lists and
 * that no deletion reaches — the same defence `assertRealClient` mounts in PyG's database.
 *
 * Where this returns `false` the screen is NOT drawn, and the page says which system the open client
 * came from instead. What it does NOT do is take the item out of the sidebar: an entry that appears
 * and disappears depending on which client is open cannot be discovered, which is the rule
 * `lib/modules.ts` already holds up for «Ventas por servicio» and «Reportería de ingresos».
 */
import { MICROPLUS_SYSTEM } from "@/lib/profit-loss/upload/systems";

export interface PersonnelCostWorkspaceContext {
  /** The `id` of the upload strategy the workspace came from; `null` in the consolidado. */
  sourceSystemId: string | null;
  /** Whether what is open is the cross-client consolidado rather than a real client. */
  isConsolidated: boolean;
}

/** Whether this workspace's plan is the one the map was written against. */
export function canReadPersonnelCost({
  sourceSystemId,
  isConsolidated,
}: PersonnelCostWorkspaceContext): boolean {
  if (isConsolidated) {
    return false;
  }
  return sourceSystemId === MICROPLUS_SYSTEM;
}
