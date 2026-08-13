/**
 * Rol de Pagos domain types: PERÍODOS, la ficha de cada EMPLEADO (`PayrollEmployeeLine`) y lo que
 * se CAPTURA de su mes (`PayrollMonthlyCapture`). Aquí no hay ni una cifra del rol: las veinte
 * columnas las deriva el motor (`lib/payroll/engine/`) desde la ficha y la captura, y nada de eso
 * se persiste. `PayrollPeriod` tampoco guarda totales: los del período
 * (`lib/payroll/period-detail.ts`) y el conteo de su nómina (`PayrollRosterSummary`, abajo) se
 * DERIVAN siempre de `PayrollEmployeeLine[]`, nunca se persisten junto a él — un total guardado
 * aparte podría quedar desactualizado y entonces la tarjeta de KPIs diría una cosa y la tabla otra.
 *
 * `ParsedPayrollPeriod` mirrors `ParsedDataset` in `lib/profit-loss/types.ts`: what a future parse
 * step would produce, with no owner yet — `db.ts` is what stamps the `clientId` at the door.
 */

import type { EntityLogo } from "@/lib/workspaces";
import type { CapturedDeductions } from "./engine/types";

/** El cliente de Rol de Pagos: un nombre elegido por el usuario. Misma forma que `NamedEntity`
 *  de `@/lib/workspaces`, así que las reglas genéricas de nombre (validación, orden, búsqueda)
 *  se aplican sin envoltorio propio — este módulo no tiene identidad que comparar, a diferencia
 *  de PyG y Ocupaciones. */
export interface PayrollClient {
  id: string;
  name: string;
  /** El logo que subió el usuario, si subió alguno — el que encabeza su comprobante en PDF.
   *  Opcional y NO indexado, así que no costó migración de Dexie. */
  logo?: EntityLogo;
}

/** Único tipo de período por ahora; el tipo deja sitio a "décimos" y "liquidaciones" más adelante. */
export type PayrollPeriodKind = "ordinario";

/**
 * El número de empleados y de áreas de un período — SIEMPRE derivado de su nómina guardada
 * (`PayrollEmployeeLine[]`), nunca persistido junto a ella: un conteo guardado aparte podría
 * quedar desactualizado y entonces la tabla diría una cosa y los datos otra.
 */
export interface PayrollRosterSummary {
  employees: number;
  areas: number;
}

/**
 * Las dos clases de un concepto de ingreso extra, y lo único de él que el CÁLCULO mira.
 *
 * `aportable` se comporta exactamente como `R` viáticos y `S`/`T` comisiones: entra en las cinco
 * bases parciales y en el total. `noAportable` se comporta como `V` bono y `U` fondo de reserva:
 * solo llega al total. El rótulo es libre justamente porque no decide nada.
 */
export type PayrollExtraConceptKind = "aportable" | "noAportable";

/**
 * Un concepto de ingreso que ESTE período declara además de los trece del libro.
 *
 * Existe porque el rol de cada empresa nombra los suyos: `MOVILIZACION NO APORTABLE` y
 * `ALIMENTACION NO APORTABLE` en el libro de DELICMAR, otros en el siguiente. Un catálogo cerrado
 * no puede crecer a ese ritmo sin tocar el motor, el asiento y el comprobante cada vez.
 *
 * **El rótulo vive en el PERÍODO y el importe en la ficha.** Un concepto extra es una COLUMNA del
 * rol, compartida por toda la nómina del mes — si el nombre viviera en cada captura, dos empleados
 * podrían llamar distinto a la misma columna y el rol dejaría de ser una tabla.
 *
 * El `id` es lo que la captura referencia, y por eso es estable e independiente del rótulo:
 * renombrar no mueve ningún importe.
 */
export interface PayrollExtraConcept {
  id: string;
  /** Como lo escribe el rol de esa empresa, verbatim: `MOVILIZACION NO APORTABLE`. */
  label: string;
  kind: PayrollExtraConceptKind;
}

export interface PayrollPeriod {
  id: string;
  clientId: string;
  year: number;
  /** 0–11, igual que el resto de la app. */
  monthIndex: number;
  kind: PayrollPeriodKind;
  /**
   * Los conceptos de ingreso extra que este período declara, en el orden en que se declararon.
   *
   * AUSENTE en un período que no declara ninguno, que es todo lo que existía antes de que esto
   * hubiera. Opcional y NO indexado, así que no costó migración de Dexie — igual que
   * `PayrollClient.logo`.
   */
  extraConcepts?: PayrollExtraConcept[];
}

/** Lo que produciría la capa de parseo, sin dueño todavía: `db.ts` estampa el `clientId`. */
export type ParsedPayrollPeriod = Omit<PayrollPeriod, "clientId">;

/**
 * La FICHA del empleado: lo estable mes a mes, y por tanto lo que una copia de nómina arrastra
 * (`lib/payroll/roster.ts`'s `copyRoster`). Horas extras, comisiones, bonos, anticipos, descuentos
 * y todo lo derivado (sueldo unificado, décimos, aporte IESS…) son del MES — se capturan o se
 * recalculan cada vez — y por eso no tienen campo aquí.
 */
/**
 * Lo que se CAPTURA del mes de un empleado, más allá de su ficha: todo lo que el motor
 * (`lib/payroll/engine/`) necesita para derivar las 20 columnas del rol y que no es estable mes
 * a mes. Los importes van en las unidades del libro; las cantidades de horas, en horas.
 *
 * Es lo que `copyRoster` NO arrastra al copiar la nómina del mes anterior: un anticipo o unas
 * horas extras de marzo no son de abril.
 */
export interface PayrollMonthlyCapture {
  /** `G`, `H`, `I` · cantidades de horas extras por clase. */
  overtimeHours50: number;
  overtimeHours100: number;
  overtimeHours25: number;
  /** `M` · el IMPORTE de horas extras que se reconoce, tecleado. `null` = todo lo trabajado,
   *  `0` = nada (el `*0` del libro). Se decide por Gerencia y por acuerdos con cada empleado,
   *  así que no se calcula ni tiene default — ver §6 y §11.1 del documento de fórmulas. */
  approvedOvertime: number | null;
  /** `P`…`T`, `V` · los otros pagos del mes, ya calculados fuera de la app. */
  vacationPay: number;
  privateInsurance: number;
  allowances: number;
  fixedCommission: number;
  /** `T` · importe ya calculado. El 20 % que la firma nombra se aplica FUERA; aquí no se
   *  recalcula nada. */
  variableCommission: number;
  bonus: number;
  /**
   * El importe de cada concepto extra que el PERÍODO declara, por `id`.
   *
   * Solo el importe: el rótulo y la clase viven en `PayrollPeriod.extraConcepts`, porque un
   * concepto extra es una columna del rol y no una decisión de cada empleado. Una entrada cuyo
   * concepto ya no exista es huérfana y no suma —nadie la recorre sin su declaración—, pero se
   * limpia al borrarlo, en la misma transacción, para que no reviva si alguien reusara el `id`.
   *
   * AUSENTE en toda captura anterior a este campo, que se lee como «ningún importe extra».
   */
  extraAmounts?: Record<string, number>;
  /** `Y`…`AN` · los doce egresos con nombre. El aporte al IESS (`X`) no está aquí: lo deriva
   *  el motor. */
  deductions: CapturedDeductions;
  /** `AS`, `AT` · si el mes provisiona los décimos. Apagados en todo el archivo real, porque
   *  ya se mensualizan en `N` y `O`. */
  provisionsThirteenth: boolean;
  provisionsFourteenth: boolean;
  /**
   * `BZ` · PAGADO. `null` mientras nadie lo declare — y eso NO es cero: sin él el empleado no
   * está ni conciliado ni con diferencia.
   *
   * Vive en la captura porque se TECLEA: sin Excel, quien arma el rol escribe lo que se
   * transfirió. Cuando el mes viene de un archivo, la carga escribe aquí su `BZ` y una corrección
   * posterior lo pisa — que es lo que se quiere, porque quien corrige sabe más que el archivo del
   * que salió.
   */
  paid: number | null;
}

export interface PayrollEmployeeLine {
  id: string;
  periodId: string;
  name: string; // hoja GENERAL, columna B
  role: string; // C · cargo
  area: string; // el bloque del rol: ADMINISTRACION, HOSPEDAJE, COCINA, RESTAURANTE, VENTAS
  baseSalary: number; // D · sueldo base
  contractType: "CT" | "TP"; // BB · tiempo completo / parcial. Parte a la mitad el décimo IV.
  idCard: string; // BD · cédula
  hireDate: string | null; // BC · fecha de ingreso, ISO
  sectorCode: string; // BF · código sectorial
  /** `BA` · FR — ¿tiene derecho a fondo de reserva? Es de la ficha: cambia con la antigüedad,
   *  no con el mes. */
  hasReserveFund: boolean;
  /** `AZ` · AC FR — ¿lo acumula en el IESS en vez de cobrarlo mensual? También de la ficha:
   *  es una elección del empleado, no del mes. */
  accumulatesReserveFund: boolean;
  /** E · días pagados del mes. Es del MES, no de la ficha, pero tiene un default natural: se
   *  copia como 30 y se corrige al capturar (ingreso a mitad de mes, salida, licencia). */
  days: number;
  /** Lo capturado del mes. AUSENTE mientras nadie capture nada, y el motor la lee entonces como
   *  una captura VACÍA: a diferencia de PyG, aquí la ficha DECLARA el sueldo y lo no capturado
   *  vale cero de verdad. Ver `toEngineInput`. */
  capture?: PayrollMonthlyCapture;
}

/** Una ficha sin dueño todavía: lo que produce `copyRoster`, antes de que `db.ts` la estampe con
 *  `id` y `periodId` al escribirla — el mismo patrón que `ParsedPayrollPeriod`. */
export type ParsedPayrollEmployeeLine = Omit<PayrollEmployeeLine, "id" | "periodId">;
