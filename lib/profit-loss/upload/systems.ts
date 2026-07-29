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

/**
 * What a workspace with no system recorded is taken to be: the single-statement strategy, the
 * only thing that could have created one before MicroPlus existed (see the change's Migration
 * Plan). Read by the Dexie migration and by an app workbook whose metadata predates the field.
 */
export const LEGACY_SYSTEM = MONTHLY_SINGLE_SYSTEM;
