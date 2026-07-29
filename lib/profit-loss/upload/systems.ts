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
 * Cómo se NOMBRA un sistema en pantalla. El `id` no es copy — `4.1.01.01.01` vs `4.1.1.1.1` le
 * dice algo al código y nada al contador —, así que todo texto que hable de un sistema pasa por
 * aquí. Son las etiquetas de las estrategias, acortadas donde el nombre largo solo repetía lo que
 * la propia pantalla ya dice (MicroPlus, Dingoo).
 *
 * Vive junto a los ids, y no en el registry, por la misma razón que ellos: nombrar un sistema no
 * puede obligar a importar SheetJS.
 */
const SYSTEM_LABELS: Record<string, string> = {
  [MONTHLY_CENTERS_SYSTEM]: "Mensual por centros de costo",
  [MONTHLY_SINGLE_SYSTEM]: "Estado único mensual",
  [MICROPLUS_SYSTEM]: "MicroPlus",
  [DINGOO_SYSTEM]: "Dingoo",
  [APP_WORKBOOK_SYSTEM]: "Excel completo de la app",
};

/** La etiqueta de un sistema; nunca su `id`, ni siquiera cuando no se reconoce. */
export function systemLabel(systemId: string): string {
  return SYSTEM_LABELS[systemId] ?? "Otro sistema contable";
}
