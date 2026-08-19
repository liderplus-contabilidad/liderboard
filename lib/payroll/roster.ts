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
 *
 * LA EXCEPCIÓN son las FILAS DE BONO, que viajan con su rótulo y su clase y con el importe en CERO.
 * No contradice la frontera: una fila de bono es FORMA del rol —la columna que esa empresa nombra
 * `MOVILIZACION NO APORTABLE` y repite todos los meses—, y lo que no viaja es lo que cada empleado
 * cobró en ella. Sin arrastrarlas, una nómina de cuarenta personas con tres bonos pediría ciento
 * veinte altas a mano cada mes.
 *
 * Y NO viajan los rótulos propios de las filas del CATÁLOGO (`labels`), que es la asimetría que
 * conviene tener escrita: una fila del catálogo existe en el libro con o sin cifra y solo se VE si
 * tiene una, así que arrastrar su nombre sin su importe pondría el rótulo de marzo esperando a la
 * cifra de abril — un «Rotura de vajilla» sobre un descuento que todavía no es nada. Una fila de
 * bono, en cambio, no existe más que por haberla declarado.
 *
 * Por eso una línea con bonos llega con `capture` PRESENTE, vacía salvo por ellos, donde antes
 * llegaba ausente. Nada distingue hoy ausente de vacía —todo lector hace `capture ?? emptyCapture()`
 * y el motor las trata igual— y esta copia vivía antes en `db.ts`, fuera de la única definición de
 * qué sobrevive a un período.
 */
import { emptyCapture } from "./employee-input";
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
    ...(line.capture?.extras?.length
      ? {
          capture: {
            ...emptyCapture(),
            extras: line.capture.extras.map((row) => ({ ...row, amount: 0 })),
          },
        }
      : {}),
  }));
}
