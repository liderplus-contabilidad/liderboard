/**
 * Las cuatro constantes que el Excel del contador lleva INCRUSTADAS en sus propias fórmulas — no
 * son una convención de la app, son la lectura literal de la hoja GENERAL del rol de pagos. Fijas
 * por ahora: «Parámetros del período» las muestra de solo lectura, sin control para editarlas.
 *
 *   - SBU:              `ROUND(482/360*E15,2)` — el Salario Básico Unificado del año, prorrateado
 *     por día en la columna del sueldo unificado.
 *   - Aporte personal:  `*0.0945` — el 9.45% que se descuenta al empleado.
 *   - Aporte patronal:  `*0.1215` — el 12.15% que aporta la empresa.
 *   - Fondo de reserva: `*0.0833` — el 8.33% de fondo de reserva.
 */
export const PAYROLL_SBU = 482.0;
export const PAYROLL_PERSONAL_IESS_RATE = 0.0945;
export const PAYROLL_EMPLOYER_IESS_RATE = 0.1215;
export const PAYROLL_RESERVE_FUND_RATE = 0.0833;
