/**
 * Importes de MUESTRA del asiento contable — el rol de MARZO 2026 del archivo del contador, para
 * que la pantalla del asiento tenga algo que mostrar antes de que exista la conexión con las
 * cifras reales del período. Este archivo entero existe para BORRARSE en cuanto el asiento se
 * alimente de esas cifras: no es un valor por defecto ni un caso de prueba de producción, es un
 * andamio.
 *
 * Los importes salen de `GENERAL!39` (la fila «SUMAN», que totaliza los cinco subtotales de área) a través de las mismas
 * fórmulas que suma cada cuenta en `GENERAL!43-71` — la versión CORREGIDA del asiento, no la de
 * `ASIENTOS`. A diferencia del mock anterior, que tenía que meter a mano los 64.25 del préstamo
 * IESS para cuadrar (la de `ASIENTOS` leía la columna equivocada), esta muestra cuadra SIN
 * corregir nada: Debe = Haber = 3889.06.
 *
 * Las 24 claves de `JOURNAL_ACCOUNTS` están presentes, y eso es deliberado: un `0` explícito dice
 * «esa columna del rol no tuvo movimiento en marzo», que es distinto de una clave ausente — la
 * ausencia significa «no se sabe» y la pantalla la rinde en raya. En marzo se mueven 9 cuentas y 15
 * quedan en cero; cuáles son se lee del objeto de abajo, no de una lista aquí arriba que habría que
 * mantener sincronizada con él.
 */
import type { JournalAmounts } from "./journal";

export const JOURNAL_MOCK_AMOUNTS: JournalAmounts = {
  "sueldos-administracion": 2918.58,
  "horas-extras-administracion": 0,
  "comisiones-administracion": 0,
  "decimo-tercer-sueldo-administracion": 243.21,
  "decimo-cuarto-sueldo-administracion": 241.02,
  "vacaciones-administracion": 131.63,
  "aporte-patronal-iess-administracion": 354.62,
  "fondo-reserva-iess-administracion": 0,
  viaticos: 0,
  "bono-nd": 0,
  "licencias-permisos-tiempo-parcial": 0,
  "sueldos-por-pagar": 2862.76,
  "decimo-tercer-sueldo-por-pagar": 0,
  "decimo-cuarto-sueldo-por-pagar": 0,
  "vacaciones-por-pagar": 131.63,
  "anticipo-empleados": 200,
  "multas-empleados": 0,
  almuerzos: 0,
  "aportes-iess-por-pagar": 694.67,
  "prestamos-empresariales": 0,
  "impuesto-renta-empleados": 0,
  "consumo-locales-empleados": 0,
  "contribucion-solidaria": 0,
  "otros-descuentos": 0,
};
