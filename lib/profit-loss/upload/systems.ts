/**
 * The accounting SYSTEM a workspace came from — the `id` of the strategy that originated it,
 * which is what `(sistema, empresa, año, modo)` compares (see `workspace-identity.ts`).
 *
 * These live apart from the strategies themselves so the client bundle and the persistence
 * layer can name a system without importing SheetJS: `db.ts`'s migration, the data provider and
 * `excel-metadata.ts` all need the id, none of them needs a parser.
 */

export const APP_WORKBOOK_SYSTEM = "app-workbook";
export const MONTHLY_CENTERS_SYSTEM = "monthly-centers";
export const MONTHLY_SINGLE_SYSTEM = "monthly-single";
export const MICROPLUS_SYSTEM = "microplus";
export const DINGOO_SYSTEM = "dingoo";

/**
 * What a workspace with no system recorded is taken to be: the single-statement strategy, the
 * only thing that could have created one before MicroPlus existed (see the change's Migration
 * Plan). Read by the Dexie migration and by an app workbook whose metadata predates the field.
 */
export const LEGACY_SYSTEM = MONTHLY_SINGLE_SYSTEM;

/**
 * How a system is NAMED on screen. The `id` is not copy — `4.1.01.01.01` vs `4.1.1.1.1` says
 * something to the code and nothing to the accountant —, so every text that speaks of a system goes
 * through here. They are the strategies' labels, shortened where the long name only repeated what the
 * screen itself already says (MicroPlus, Dingoo).
 *
 * It lives next to the ids, and not in the registry, for the same reason they do: naming a system
 * cannot force importing SheetJS.
 */
const SYSTEM_LABELS: Record<string, string> = {
  [MONTHLY_CENTERS_SYSTEM]: "Mensual por centros de costo",
  [MONTHLY_SINGLE_SYSTEM]: "Estado único mensual",
  [MICROPLUS_SYSTEM]: "MicroPlus",
  [DINGOO_SYSTEM]: "Dingoo",
  [APP_WORKBOOK_SYSTEM]: "Excel completo de la app",
};

/** A system's label; never its `id`, not even when it is not recognised. */
export function systemLabel(systemId: string): string {
  return SYSTEM_LABELS[systemId] ?? "Otro sistema contable";
}
