/**
 * El `ROUND(x, 2)` de Excel, que NO es `Math.round(x * 100) / 100`, y las dos diferencias
 * importan porque el motor tiene que cuadrar al centavo con el libro del contador:
 *
 * 1. **El medio se va hacia AFUERA del cero**, no hacia +∞. `ROUND(-0.005, 2)` es `-0.01` en
 *    Excel; `Math.round(-0.5)` es `-0`. Casi todo en un rol es positivo, pero un descuento
 *    tecleado en negativo bastaría para separar la app del archivo.
 * 2. **El error de representación binaria se absorbe antes de decidir el medio.** `1.005` no
 *    es exactamente `1.005` en binario sino `1.00499999999999989…`, así que
 *    `Math.round(1.005 * 100)` da `100` y se pierde el centavo. Excel decide sobre el número
 *    DECIMAL que el usuario ve, no sobre su aproximación binaria, y `toPrecision(15)` —los
 *    dígitos que un `double` sí garantiza— reconstruye justo eso.
 *
 * Aplica solo a las derivaciones (`F`, `J`…`AW`). Los totales del libro (`W`, `AO`, `AP`,
 * `AX`, `AY`) NO se redondean a propósito: ver §9 de `docs/payroll/rol-de-pagos-formulas.md`.
 */
export function roundToCents(value: number): number {
  if (!Number.isFinite(value)) {
    return value;
  }
  const sign = value < 0 ? -1 : 1;
  const scaled = Number((Math.abs(value) * 100).toPrecision(15));
  const result = (sign * Math.round(scaled)) / 100;
  // `-0` es un valor legítimo de esta cuenta y se propaga a los totales; devolverlo como `0`
  // evita que una celda en cero se imprima «-0,00».
  return result === 0 ? 0 : result;
}
