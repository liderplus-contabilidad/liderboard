/**
 * LOS FORMATOS DEL COMPROBANTE, que no son los de la app.
 *
 * Todo importe lleva **`$`**, incluidas las filas, que en el libro van sin símbolo y solo sus tres
 * totales lo llevan (y como `US$`). Es una decisión de la firma sobre su propio papel: un solo
 * símbolo, el mismo que `formatCurrency` escribe en toda la app, para que la pantalla y el
 * comprobante no hablen dos dialectos del dólar.
 *
 * Vive aquí y no en `lib/format.ts` por dos razones que siguen en pie:
 *
 * - **Dos decimales siempre.** `formatCurrency` da dólares enteros por defecto, que en un rol
 *   pierde los centavos que el contador coteja.
 * - **Un cero nunca sale con signo.** El motor no redondea sus totales (§9 del documento de
 *   fórmulas) y arrastra ruido de coma flotante; con la regla de `formatCurrency` —`value < 0`—
 *   un `-1e-14` imprimiría `-$0.00` en la banda del líquido. Aquí el signo se juzga DESPUÉS de
 *   redondear a centavos.
 *
 * Lo que este archivo ya NO escribe es la raya del formato contable del libro
 * (`_(* #,##0.00_);_(* \(#,##0.00\);_(* "-"??_)` de las celdas `G9:G40`): el comprobante OMITE las
 * filas sin importe en vez de imprimirlas en cero, así que no queda ningún cero de fila al que
 * ponerle raya. Quién decide esa omisión es `document.ts`.
 */

/** Los separadores de Ecuador: `,` para los miles y `.` para los centavos — la misma razón por la
 *  que `lib/format.ts` se construye sobre `en-US` y no sobre `es-EC`, que invierte los dos. */
const AMOUNT = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * Un importe del comprobante: `$487.21`, `$6,704.32`, con el signo delante del símbolo
 * (`-$40.00`), como `formatCurrency`.
 *
 * Es UNO solo para filas y totales. Lo era en dos mientras las filas en cero se imprimían con
 * raya y los totales con `$0.00`; ahora una fila en cero no se imprime, así que el único cero que
 * queda es el de un total —«a este empleado no se le descontó nada»—, que es una afirmación sobre
 * el mes y va como cifra.
 */
export function formatPayslipAmount(value: number): string {
  const formatted = `$${AMOUNT.format(Math.abs(value))}`;
  return Math.round(value * 100) < 0 ? `-${formatted}` : formatted;
}

/** Una cantidad de horas de la columna `Cantidad`: sin decimales si es entera (`5`), con ellos si
 *  no (`5.50`). No tiene caso para el cero: sin horas la fila no vale nada, y una fila sin importe
 *  ya no se imprime. */
export function formatQuantity(value: number): string {
  return Number.isInteger(value) ? String(value) : AMOUNT.format(value);
}
