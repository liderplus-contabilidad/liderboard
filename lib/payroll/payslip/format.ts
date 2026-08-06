/**
 * LOS FORMATOS DEL COMPROBANTE, que no son los de la app.
 *
 * `lib/format.ts` escribe el dólar de Ecuador (`$57,961.95`) y lo usa toda la pantalla. El papel
 * del contador escribe otras dos cosas, y las escribe así porque su hoja lo hace:
 *
 * - Las filas de concepto van SIN símbolo (`487.21`), y un cero se imprime **`-`** — es el formato
 *   contable `_(* #,##0.00_);_(* \(#,##0.00\);_(* "-"??_)` que llevan las celdas `G9:G40`. Una
 *   columna con dieciocho `0.00` se lee como dieciocho cifras; con dieciocho rayas se lee como lo
 *   que es, nada que declarar.
 * - Los tres totales llevan **`US$`**, no `$`: es el formato `_ "US$"* #,##0.00_` de `G22`, `G41`
 *   y `G42`.
 *
 * Vive aquí y no en `lib/format.ts` porque es del comprobante, no de la app: llevarlo allí
 * ofrecería a cualquier pantalla un dólar que solo este papel escribe.
 */

/** Los separadores de Ecuador: `,` para los miles y `.` para los centavos — la misma razón por la
 *  que `lib/format.ts` se construye sobre `en-US` y no sobre `es-EC`, que invierte los dos. */
const AMOUNT = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * El importe de una fila de concepto: dos decimales, sin símbolo, y `-` cuando vale cero.
 *
 * El cero se juzga DESPUÉS de redondear a centavos, no antes: el motor no redondea sus totales
 * (§9 del documento de fórmulas) y arrastra ruido de coma flotante, así que un `1e-14` que el
 * comprobante imprimiría `0.00` tiene que salir `-` como cualquier otro cero.
 */
export function formatRowAmount(value: number): string {
  return Math.round(value * 100) === 0 ? "-" : AMOUNT.format(value);
}

/** Un total del comprobante: `US$567.98`, con el signo delante del símbolo (`-US$40.00`). */
export function formatTotal(value: number): string {
  const formatted = `US$${AMOUNT.format(Math.abs(value))}`;
  return Math.round(value * 100) < 0 ? `-${formatted}` : formatted;
}

/** Una cantidad de horas de la columna `Cantidad`: sin decimales si es entera (`5`), con ellos si
 *  no (`5.50`), y `-` en cero — igual que los importes, porque comparten esa columna. */
export function formatQuantity(value: number): string {
  if (value === 0) {
    return "-";
  }
  return Number.isInteger(value) ? String(value) : AMOUNT.format(value);
}
