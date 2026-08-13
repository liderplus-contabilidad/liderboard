/**
 * De dónde sale cada importe del asiento: la costura entre el motor y el catálogo de cuentas.
 *
 * `journal.ts` declara, por cuenta, las columnas del rol que la componen (`sourceColumns`). Este
 * archivo declara, por columna, DE DÓNDE se saca su valor — del cómputo del motor o de lo capturado
 * del mes— y suma la nómina entera recorriendo ambas declaraciones.
 *
 * **Se recorre `sourceColumns` en vez de escribir 25 sumas a mano**, y eso es la decisión de
 * diseño de este archivo. Escribirlas a mano funciona, pero crea una segunda definición de «de
 * dónde sale este importe» que puede separarse de la anotación del catálogo; entonces
 * `sourceColumns` diría una cosa mientras el asiento hace otra, y el contador —que revisa la
 * anotación contra su hoja— estaría revisando algo que no manda. Recorriéndola, la única forma de
 * equivocarse es equivocarse en la anotación.
 *
 * **Una columna sin destino no compila.** `RolColumn` se deriva del propio catálogo, así que
 * `COLUMN_SOURCES` está obligado a cubrirlas todas. Importa porque el modo de fallo contrario es
 * invisible: una columna sin mapear devolvería `0`, su cuenta saldría sin movimiento, el
 * interruptor de ocultar ceros la escondería, y el asiento descuadraría sin causa visible.
 *
 * No se redondea por el camino. El redondeo es del motor y de `formatCurrency`; meter otro aquí
 * crearía diferencias de céntimo contra los cuatro totales del período, que suman lo mismo.
 */
import { computeEmployeePayroll } from "./engine/compute";
import type { PayrollParameters } from "./engine/parameters";
import type { PayrollEmployeeComputation, PayrollEmployeeInput } from "./engine/types";
import { toEngineInput } from "./employee-input";
import { JOURNAL_ACCOUNTS, type JournalAccountId, type JournalAmounts } from "./journal";
import type { ParsedPayrollEmployeeLine, PayrollExtraConcept } from "./types";

/**
 * Las columnas del rol que alguna cuenta nombra, derivadas del catálogo — nunca una lista aparte,
 * que se desincronizaría en cuanto alguien añadiera una cuenta.
 */
export type RolColumn = (typeof JOURNAL_ACCOUNTS)[number]["sourceColumns"][number];

/**
 * Qué vale cada columna para UN empleado. Los rótulos son los del libro (§1 del documento de
 * fórmulas), y el reparto entre las dos fuentes no es casual: lo que el motor DERIVA sale de
 * `computation`, y lo que se TECLEA sale de `input`.
 *
 * El segundo argumento es `PayrollEmployeeInput` —la entrada del MOTOR— y no la
 * `PayrollMonthlyCapture` que la base guarda, aunque compartan campos. Es deliberado: así el mapa
 * habla el vocabulario del motor de punta a punta (su entrada y su salida) en vez del de la forma
 * en que se almacena, y por eso el fixture de oro de marzo 2026 —que son entradas de motor
 * transcritas del `.xls`— se puede pasar por aquí tal cual y cotejar el asiento contra la hoja del
 * contador. Con la forma de almacenamiento habría que inventar una ficha alrededor de cada entrada.
 */
const COLUMN_SOURCES: Record<
  RolColumn,
  (computation: PayrollEmployeeComputation, input: PayrollEmployeeInput) => number
> = {
  /** `F` · SUELDO UNIFICADO */
  F: (c) => c.unifiedSalary,
  /** `M` · TOTAL HORAS EXTRAS reconocido — nunca `J+K+L`, que es lo trabajado sin recortar. */
  M: (c) => c.overtimeTotal,
  /** `N` · DECIMO IV MENSUAL */
  N: (c) => c.fourteenthMonthly,
  /** `O` · DECIMO III MENSUAL */
  O: (c) => c.thirteenthMonthly,
  /** `P` · VACACIONES - MENSUAL */
  P: (_c, k) => k.vacationPay,
  /** `Q` · SEGURO PRIVADO — la columna que obligó a añadir la cuenta 25. */
  Q: (_c, k) => k.privateInsurance,
  /** `R` · VIATICOS/VIVIENDA. Es la columna de `Viaticos`; `ASIENTOS` leía `V` por error. */
  R: (_c, k) => k.allowances,
  /** `S` · COMISION FIJA POR VTAS. */
  S: (_c, k) => k.fixedCommission,
  /** `T` · COMISION VARIABLE */
  T: (_c, k) => k.variableCommission,
  /** `U` · FONDO DE RESERVA pagado en el mes */
  U: (c) => c.reserveFundPaid,
  /** `V` · BONO CUMPLIMIENTO */
  V: (_c, k) => k.bonus,
  /**
   * `EXTRA_AP` y `EXTRA_NA` no son columnas del libro sino los dos agregados de los conceptos que
   * el PERÍODO declara — el motor ya los recibe reducidos, así que aquí se leen de la entrada.
   *
   * Salen de `input.extras` y no de la captura: el reparto por clase lo decide la declaración del
   * período, y `toEngineInput` es el único sitio donde ese cruce ocurre. Leer `capture.extraAmounts`
   * aquí obligaría a repetirlo y podría discrepar.
   */
  EXTRA_AP: (_c, k) => k.extras.contributory,
  EXTRA_NA: (_c, k) => k.extras.nonContributory,
  /** `X` · APORTE IESS del empleado */
  X: (c) => c.iessEmployee,
  /** `Y` · PRESTAMOS QUIROGRAFARIOS E HIPOTECARIOS */
  Y: (_c, k) => k.deductions.iessLoans,
  /** `Z` · LICENCIA SIN SUELDO */
  Z: (_c, k) => k.deductions.unpaidLeave,
  /** `AA` · ANTICIPO SUELDO */
  AA: (_c, k) => k.deductions.salaryAdvance,
  /** `AB` · PRESTAMOS EMPRESARIALES */
  AB: (_c, k) => k.deductions.companyLoans,
  /** `AC` · IMPUESTO RENTA */
  AC: (_c, k) => k.deductions.incomeTax,
  /** `AD` · ALMUERZOS */
  AD: (_c, k) => k.deductions.meals,
  /** `AE` · MULTAS */
  AE: (_c, k) => k.deductions.fines,
  /** `AF` · CONSUMO LOCALES EMPLEADO */
  AF: (_c, k) => k.deductions.inHouseConsumption,
  /** `AG` · CONTRIBUCION SOLIDARIA */
  AG: (_c, k) => k.deductions.solidarityContribution,
  /** `AH` · OTROS */
  AH: (_c, k) => k.deductions.otherDeductions,
  /** `AI` · DESCUENTO TIEMPO PACIAL (sic) */
  AI: (_c, k) => k.deductions.partTimeDeduction,
  /** `AN` · Descuento PERMISO MEDICO */
  AN: (_c, k) => k.deductions.medicalLeaveDeduction,
  /** `AP` · LIQUIDO A RECIBIR */
  AP: (c) => c.netPay,
  /** `AS` · provisión del décimo tercero */
  AS: (c) => c.thirteenthProvision,
  /** `AT` · provisión del décimo cuarto */
  AT: (c) => c.fourteenthProvision,
  /** `AU` · APORTE PATRONAL IESS */
  AU: (c) => c.iessEmployer,
  /** `AV` · provisión de vacaciones */
  AV: (c) => c.vacationProvision,
  /** `AW` · FONDO DE RESERVA acumulado en el IESS */
  AW: (c) => c.reserveFundAccrued,
};

/**
 * Los importes del asiento a partir de entradas de MOTOR ya emparejadas con su cómputo.
 *
 * Es el núcleo, y existe aparte para que el contraste contra el archivo real (`GOLDEN_MARCH_2026`,
 * seis entradas transcritas del `.xls`) pueda pasar por la MISMA suma que la pantalla, sin fabricar
 * una ficha de almacenamiento alrededor de cada una.
 */
export function journalAmountsForInputs(
  inputs: readonly PayrollEmployeeInput[],
  parameters: PayrollParameters,
): JournalAmounts {
  // Se computa cada entrada UNA vez: el motor es lo caro y varias cuentas leen de la misma columna.
  const rows = inputs.map((input) => ({
    computation: computeEmployeePayroll(input, parameters),
    input,
  }));

  const amounts = {} as Record<JournalAccountId, number>;
  for (const account of JOURNAL_ACCOUNTS) {
    let total = 0;
    for (const column of account.sourceColumns) {
      const read = COLUMN_SOURCES[column];
      for (const row of rows) {
        total += read(row.computation, row.input);
      }
    }
    amounts[account.id] = total;
  }
  return amounts;
}

/**
 * Los importes del asiento de un período: cada cuenta, la suma de sus columnas sobre TODA la
 * nómina.
 *
 * Devuelve siempre las claves del catálogo completas, con `0` explícito donde no hubo movimiento.
 * `buildJournalEntry` distingue `0` («esa columna no se movió») de ausente («no se sabe»), y
 * alimentado del período lo segundo ya no puede ocurrir: la nómina se conoce entera. Una nómina
 * VACÍA da las 25 cuentas en cero, que es lo que es — no hay nada que asentar.
 *
 * Toma `ParsedPayrollEmployeeLine` y no `PayrollEmployeeLine` por la misma razón que
 * `computeLinePayroll`: el asiento no depende del `id` ni del `periodId` de nadie, y pedir la forma
 * sin dueño deja que una PREVIA de carga se aseme antes de existir en la base.
 */
export function journalAmountsFor(
  lines: readonly ParsedPayrollEmployeeLine[],
  parameters: PayrollParameters,
  /** Los conceptos extra que declara el período de esa nómina. Sin ellos los importes de las dos
   *  cuentas nuevas saldrían en cero y el asiento DESCUADRARÍA por lo que la nómina sí pagó. */
  extraConcepts: readonly PayrollExtraConcept[],
): JournalAmounts {
  // `toEngineInput` es la única traducción de ficha + captura a entrada de motor, y se reusa en vez
  // de leer `line.capture` aquí: una segunda lectura podría discrepar de la suya.
  return journalAmountsForInputs(
    lines.map((line) => toEngineInput(line, extraConcepts)),
    parameters,
  );
}
