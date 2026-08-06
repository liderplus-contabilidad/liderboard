/**
 * La copia de nómina: pura. `copyRoster` es la ÚNICA definición de qué sobrevive de un período a
 * otro y qué no — la frontera de la operación, para que nadie tenga que deducirla leyendo `db.ts`.
 *
 * LO QUE SOBREVIVE (la ficha, estable mes a mes): nombre, cargo, área, sueldo base, tipo de
 * contrato, cédula, fecha de ingreso, código sectorial, y las dos banderas del fondo de reserva
 * (`FR` y `AC FR`) — que son de la ficha porque dependen de la antigüedad y de una elección del
 * empleado, no del mes.
 *
 * LO QUE NO: todo lo que vive en `PayrollMonthlyCapture` —horas extras (`G`, `H`, `I`), el
 * importe aprobado (`M`), comisiones/viáticos/bonos (`P`–`V`), anticipos, multas, préstamos y
 * demás descuentos (`Y`–`AN`)— y todo lo derivado (`F` sueldo unificado, `N` décimo IV, `O`
 * décimo III, `W` total ingresos, `X` aporte IESS, `AO`, `AP`…). Los primeros son del MES y se
 * capturan cada vez; los segundos los recalcula el motor. Por eso la copia deja `capture`
 * AUSENTE en vez de en ceros: un período recién copiado todavía no recibió su archivo, y esa
 * distinción es la que hace que la pantalla no pinte un rol completo de un mes vacío.
 *
 * `days` sí es del mes (días pagados), pero tiene un default natural — se copia como 30 y se
 * corrige al capturar (ingreso a mitad de mes, salida, licencia) — así que la copia lo RESETEA en
 * vez de arrastrarlo.
 */
import type { ParsedPayrollEmployeeLine, PayrollEmployeeLine } from "./types";

const COPIED_DAYS = 30;

export function copyRoster(source: readonly PayrollEmployeeLine[]): ParsedPayrollEmployeeLine[] {
  return source.map((line) => ({
    name: line.name,
    role: line.role,
    area: line.area,
    baseSalary: line.baseSalary,
    contractType: line.contractType,
    idCard: line.idCard,
    hireDate: line.hireDate,
    sectorCode: line.sectorCode,
    hasReserveFund: line.hasReserveFund,
    accumulatesReserveFund: line.accumulatesReserveFund,
    days: COPIED_DAYS,
  }));
}
