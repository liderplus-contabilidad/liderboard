/**
 * LOS FORMATOS DEL COMPROBANTE, que no son los de la app.
 *
 * `lib/format.ts` escribe el dólar de Ecuador (`$57,961.95`) y lo usa toda la pantalla. El papel
 * del contador escribe otras dos cosas, y las escribe así porque su hoja lo hace:
 *
 * - Un cero de fila se imprime **`-`** — es el formato contable
 *   `_(* #,##0.00_);_(* \(#,##0.00\);_(* "-"??_)` que llevan las celdas `G9:G40`. Una columna con
 *   dieciocho `$0.00` se lee como dieciocho cifras; con dieciocho rayas se lee como lo que es,
 *   nada que declarar.
 * - Todo importe lleva **`$`**, incluidas las filas, que en el libro van sin símbolo y solo sus
 *   tres totales lo llevan (y como `US$`). Es una decisión de la firma sobre su propio papel: un
 *   solo símbolo, el mismo que `formatCurrency` escribe en toda la app, para que la pantalla y el
 *   comprobante no hablen dos dialectos del dólar.
 *
 * Vive aquí y no en `lib/format.ts` porque los dos decimales fijos y la raya del cero son del
 * comprobante: `formatCurrency` da dólares enteros por defecto, que en un rol pierde los centavos
 * que el contador coteja.
 */

/** Los separadores de Ecuador: `,` para los miles y `.` para los centavos — la misma razón por la
 *  que `lib/format.ts` se construye sobre `en-US` y no sobre `es-EC`, que invierte los dos. */
const AMOUNT = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** `$487.21`, con el signo delante del símbolo (`-$40.00`), como `formatCurrency`. */
function withSymbol(value: number): string {
  const formatted = `$${AMOUNT.format(Math.abs(value))}`;
  return Math.round(value * 100) < 0 ? `-${formatted}` : formatted;
}

/**
 * El importe de una fila de concepto: `$487.21`, y `-` cuando vale cero.
 *
 * El cero se juzga DESPUÉS de redondear a centavos, no antes: el motor no redondea sus totales
 * (§9 del documento de fórmulas) y arrastra ruido de coma flotante, así que un `1e-14` que el
 * comprobante imprimiría `$0.00` tiene que salir `-` como cualquier otro cero.
 */
export function formatRowAmount(value: number): string {
  return Math.round(value * 100) === 0 ? "-" : withSymbol(value);
}

/**
 * Un total del comprobante: `$6,704.32`.
 *
 * A diferencia de una fila, un total en cero SÍ imprime `$0.00` en vez de `-`. No es lo mismo: la
 * raya de una fila dice «este concepto no tiene nada que declarar», mientras que un total es una
 * afirmación sobre el mes entero — «a este empleado no se le descontó nada» es una cifra, y
 * esconderla tras una raya la haría parecer un dato que falta.
 */
export function formatTotal(value: number): string {
  return withSymbol(value);
}

/** Una cantidad de horas de la columna `Cantidad`: sin decimales si es entera (`5`), con ellos si
 *  no (`5.50`), y `-` en cero — igual que los importes, porque comparten esa columna. */
export function formatQuantity(value: number): string {
  if (value === 0) {
    return "-";
  }
  return Number.isInteger(value) ? String(value) : AMOUNT.format(value);
}
