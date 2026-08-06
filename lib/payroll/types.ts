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
  /** E · días pagados del mes. Es del MES, no de la ficha, pero tiene un default natural: se
   *  copia como 30 y se corrige al capturar (ingreso a mitad de mes, salida, licencia). */
  days: number;
  /** Las cifras del mes, si el período ya recibió su archivo. Ver `PayrollEmployeeFigures`. */
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
