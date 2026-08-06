/**
 * Rol de Pagos domain types: PERÍODOS, la ficha de cada EMPLEADO (`PayrollEmployeeLine`) y sus
 * cifras del mes (`PayrollEmployeeFigures`). `PayrollPeriod` no guarda totales: los del período
 * (`lib/payroll/period-detail.ts`) y el conteo de su nómina (`PayrollRosterSummary`, abajo) se
 * DERIVAN siempre de `PayrollEmployeeLine[]`, nunca se persisten junto a él — un total guardado
 * aparte podría quedar desactualizado y entonces la tarjeta de KPIs diría una cosa y la tabla otra.
 *
 * `ParsedPayrollPeriod` mirrors `ParsedDataset` in `lib/profit-loss/types.ts`: what a future parse
 * step would produce, with no owner yet — `db.ts` is what stamps the `clientId` at the door.
 */

import type { CapturedDeductions } from "./engine/types";

/** El cliente de Rol de Pagos: un nombre elegido por el usuario. Misma forma que `NamedEntity`
 *  de `@/lib/workspaces`, así que las reglas genéricas de nombre (validación, orden, búsqueda)
 *  se aplican sin envoltorio propio — este módulo no tiene identidad que comparar, a diferencia
 *  de PyG y Ocupaciones. */
export interface PayrollClient {
  id: string;
  name: string;
}

/** Único tipo de período por ahora; el tipo deja sitio a "décimos" y "liquidaciones" más adelante. */
export type PayrollPeriodKind = "ordinario";

/** Un período nace en captura; se cierra cuando se cargan sus datos — un paso que todavía no existe. */
export type PayrollPeriodStatus = "captura" | "cerrado";

/**
 * El número de empleados y de áreas de un período — SIEMPRE derivado de su nómina guardada
 * (`PayrollEmployeeLine[]`), nunca persistido junto a ella: un conteo guardado aparte podría
 * quedar desactualizado y entonces la tabla diría una cosa y los datos otra.
 */
export interface PayrollRosterSummary {
  employees: number;
  areas: number;
}

export interface PayrollPeriod {
  id: string;
  clientId: string;
  year: number;
  /** 0–11, igual que el resto de la app. */
  monthIndex: number;
  kind: PayrollPeriodKind;
  status: PayrollPeriodStatus;
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
   * Está aquí y no solo en `figures` porque se TECLEA: sin Excel, quien arma el rol escribe lo
   * que se transfirió. Cuando el mes vino de un archivo, `figures.paid` guarda lo que ESE archivo
   * declaró y esto lo pisa si alguien lo corrige a mano — que es lo que se quiere, porque una
   * corrección posterior sabe más que el archivo del que salió.
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
  /** Lo capturado del mes. AUSENTE mientras el período no reciba su archivo — igual que
   *  `figures`, y por la misma razón: no es cero, es «no hay». */
  capture?: PayrollMonthlyCapture;
  /** Las cifras del mes TAL COMO EL ARCHIVO las trae, sin recalcular. Conviven con `capture`
   *  a propósito: `capture` es lo que el motor consume y `figures` es contra lo que se
   *  contrasta, que es la única forma de notar si la app y el Excel del contador dejan de
   *  decir lo mismo. Ver `PayrollEmployeeFigures`. */
  figures?: PayrollEmployeeFigures;
}

/** Una ficha sin dueño todavía: lo que produce `copyRoster`, antes de que `db.ts` la estampe con
 *  `id` y `periodId` al escribirla — el mismo patrón que `ParsedPayrollPeriod`. */
export type ParsedPayrollEmployeeLine = Omit<PayrollEmployeeLine, "id" | "periodId">;

/**
 * Las cifras del MES de un empleado, leídas VERBATIM del archivo — nunca recalculadas por la app.
 * El rol trae 1.199 fórmulas y su cuadre es el del contador; recalcular aquí produciría una segunda
 * definición de «sueldo unificado» o de «aporte IESS» que puede separarse de la suya al centavo, y
 * entonces la pantalla y su Excel dirían cifras distintas sin que nada lo delate.
 *
 * AUSENTE mientras el período no reciba su archivo: no es cero, es «no hay» — la misma distinción
 * que un mes no cargado en PyG. Una ficha nacida de `copyRoster` no las trae por construcción.
 */
export interface PayrollEmployeeFigures {
  /** W · TOTAL INGRESO */
  gross: number;
  /** AO · TOTAL EGRESOS */
  deductions: number;
  /** AP · LÍQUIDO A RECIBIR */
  net: number;
  /** AY · COSTO TOTAL EMPRESA (provisión + ingresos) */
  cost: number;
  /**
   * BZ · PAGADO — lo que efectivamente se transfirió, que el archivo declara aparte del líquido.
   * `null` cuando no lo declara, y eso NO es cero: un período sin conciliar todavía no dice que
   * no se pagó nada. La diferencia (`CA = BH − BZ`) es lo que separa «conciliado» de «con
   * diferencia», y con `null` un empleado no es ninguna de las dos cosas.
   */
  paid: number | null;
}
