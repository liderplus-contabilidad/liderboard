/**
 * Rol de Pagos domain types. This phase only creates and lists PERÍODOS — no Excel parsing, no
 * empleados, no cálculos — so `PayrollPeriod` carries just enough to render the historial: its
 * period, its kind, its status and, once loaded, its four totals.
 *
 * `ParsedPayrollPeriod` mirrors `ParsedDataset` in `lib/profit-loss/types.ts`: what a future parse
 * step would produce, with no owner yet — `db.ts` is what stamps the `clientId` at the door.
 */

/** El cliente de Rol de Pagos: un nombre elegido por el usuario. Misma forma que `NamedEntity`
 *  de `@/lib/workspaces`, así que las reglas genéricas de nombre (validación, orden, búsqueda)
 *  se aplican sin envoltorio propio — este módulo no tiene identidad que comparar, a diferencia
 *  de PyG y Ocupaciones. */
export interface PayrollClient {
  id: string;
  name: string;
}

/** Único tipo de período por ahora; el tipo deja sitio a "décimos" y "liquidaciones" más adelante. */
export type PayrollPeriodKind = "ordinario";

/** Un período nace en captura; se cierra cuando se cargan sus datos — un paso que todavía no existe. */
export type PayrollPeriodStatus = "captura" | "cerrado";

/**
 * Las cifras de un período. AUSENTE mientras no se cargue su Excel — no es cero, es «no hay»: la
 * misma distinción que un mes no cargado en PyG o en Ocupaciones (`null` contra un valor real).
 */
export interface PayrollPeriodTotals {
  employees: number;
  net: number;
  cost: number;
  areas: number;
}

export interface PayrollPeriod {
  id: string;
  clientId: string;
  year: number;
  /** 0–11, igual que el resto de la app. */
  monthIndex: number;
  kind: PayrollPeriodKind;
  status: PayrollPeriodStatus;
  totals?: PayrollPeriodTotals;
}

/** Lo que produciría la capa de parseo, sin dueño todavía: `db.ts` estampa el `clientId`. */
export type ParsedPayrollPeriod = Omit<PayrollPeriod, "clientId">;
