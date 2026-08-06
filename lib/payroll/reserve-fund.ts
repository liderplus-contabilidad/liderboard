/**
 * Las DOS banderas del fondo de reserva vistas como UN modo.
 *
 * El libro cruza `FR` (`BA`, tiene derecho) con `AC FR` (`AZ`, lo acumula en el IESS) y de ese
 * cruce salen TRES resultados, no cuatro (§7 de `docs/payroll/rol-de-pagos-formulas.md`):
 * sin derecho no genera nada · con derecho y sin acumular lo cobra como ingreso (`U`) · con
 * derecho y acumulando va al costo patronal (`AW`) sin verse en su líquido.
 *
 * Por qué existe esta traducción en vez de dos casillas en pantalla: dos controles independientes
 * ofrecen una cuarta combinación que no significa nada y obligan a cruzar las banderas de cabeza
 * para saber en cuál de los tres casos está uno. En la base siguen las dos columnas —son las que
 * el Excel trae y las que el parser lee—, así que la conversión vive aquí, pura y testeada, y no
 * dentro de un componente.
 *
 * **La traducción es ASIMÉTRICA a propósito, y hay un caso real.** `(FR=N, AC FR=S)` es
 * «sin derecho» —`FR` manda, porque las dos ramas de §7 arrancan preguntando por él— y volver
 * desde ese modo daría `(N, N)`. MORALES MENA SILVIA JIMENA trae exactamente esa combinación en
 * el rol de marzo 2026. En las cifras no cambia nada (con `FR=N` ambas ramas dan cero), pero la
 * pantalla **no debe reescribir las banderas al abrir una ficha**: solo cuando alguien cambie el
 * modo. Reescribirlas antes sería corregir un archivo que nadie pidió corregir.
 */
import type { PayrollEmployeeLine } from "./types";

export type ReserveFundMode = "sin-derecho" | "mensual" | "acumula";

/** Las dos columnas del libro que definen el modo — la firma mínima, para que la lea igual una
 *  ficha guardada que un formulario a medio llenar. */
type ReserveFundFlags = Pick<PayrollEmployeeLine, "hasReserveFund" | "accumulatesReserveFund">;

/**
 * Los tres modos con el nombre que la pantalla les da. Viven junto al tipo, y no en el componente,
 * por la misma razón que `systemLabel` vive junto a los ids de los sistemas contables de PyG: si
 * la lista de modos y sus rótulos se declararan en sitios distintos, añadir un modo dejaría uno
 * de los dos sin actualizar.
 */
export const RESERVE_FUND_OPTIONS: readonly { value: ReserveFundMode; label: string }[] = [
  { value: "sin-derecho", label: "No le corresponde" },
  { value: "mensual", label: "Lo cobra cada mes" },
  { value: "acumula", label: "Lo acumula en el IESS" },
];

/** Qué modo describen las banderas guardadas. */
export function reserveFundMode(flags: ReserveFundFlags): ReserveFundMode {
  if (!flags.hasReserveFund) {
    return "sin-derecho";
  }
  return flags.accumulatesReserveFund ? "acumula" : "mensual";
}

/** Las banderas que hay que guardar para un modo elegido. */
export function reserveFundFlags(mode: ReserveFundMode): ReserveFundFlags {
  return {
    hasReserveFund: mode !== "sin-derecho",
    accumulatesReserveFund: mode === "acumula",
  };
}
