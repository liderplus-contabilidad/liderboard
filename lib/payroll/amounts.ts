/**
 * Helpers de comparación de importes del módulo de Rol de Pagos. Una sola definición de
 * «dos importes son el mismo» para que la conciliación de un empleado y el cuadre del
 * asiento contable usen la misma regla.
 */

/**
 * Dos importes son el MISMO cuando lo son al CENTAVO. La igualdad exacta no sirve aquí y no es
 * un tecnicismo: en el rol real, el líquido (`AP`) es resultado de una fórmula y llega con ruido
 * de coma flotante —`457.69000000000005`— mientras lo pagado (`BZ`) es un valor tecleado a mano,
 * `457.69`. Comparados con `===`, cuatro de los cinco empleados conciliados del archivo del
 * contador salían «con diferencia» por 5,7e-14, y la tarjeta de KPIs decía justo lo contrario de
 * lo que el archivo dice.
 */
export function sameToTheCentavo(a: number, b: number): boolean {
  return Math.round(a * 100) === Math.round(b * 100);
}
