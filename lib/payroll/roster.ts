/**
 * La copia de nómina: pura. `copyRoster` es la ÚNICA definición de qué sobrevive de un período a
 * otro y qué no — la frontera de la operación, para que nadie tenga que deducirla leyendo `db.ts`.
 *
 * LO QUE SOBREVIVE (la ficha, estable mes a mes): nombre, cargo, área, sueldo base, tipo de
 * contrato, cédula, fecha de ingreso, código sectorial — exactamente los campos de
 * `PayrollEmployeeLine`.
 *
 * LO QUE NO: horas extras (`G`, `H`, `I`), comisiones/viáticos/bonos (`Q`–`V`), anticipos, multas,
 * préstamos y demás descuentos (`Y`–`AN`), y todo lo derivado (`F` sueldo unificado, `N` décimo
 * IV, `O` décimo III, `W` total ingresos, `X` aporte IESS, `AO`, `AP`…) — son del MES, se capturan
 * o se recalculan cada vez, y por eso no tienen campo en `PayrollEmployeeLine`: no hay nada que
 * "no copiar", ya no existe en la ficha.
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
    days: COPIED_DAYS,
  }));
}
