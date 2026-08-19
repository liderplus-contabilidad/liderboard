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

import type { CompanyProfile } from "@/lib/company-profile";
import type { CostCenter } from "@/lib/cost-center";
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
  /**
   * Lo que el papel de la firma imprime bajo el logo: razón social, ubicación y teléfonos. Es
   * OPCIONAL en el tipo aunque el diálogo exija sus seis campos, porque los clientes creados antes
   * de que existiera no lo tienen: un tipo que lo declarara obligatorio afirmaría algo falso sobre
   * lo que hay en la base y obligaría a cada lectura a mentir. La obligatoriedad es una regla del
   * ALTA y vive en el formulario, no en el dato.
   *
   * No indexado, como el logo, así que tampoco costó versión nueva de Dexie.
   */
  company?: CompanyProfile;
  /**
   * El CENTRO DE COSTO al que pertenece el papel de este cliente: un nombre más específico que el
   * suyo y —si el usuario lo subió— su propio logo. Opcional, declarado al crear el cliente, y UNO
   * solo: no es la estructura de centros de PyG ni de Ocupaciones, donde un centro sale de los
   * datos y hay varios (ver `lib/cost-center.ts`).
   *
   * Su efecto es entero del PAPEL: el rótulo del encabezado pasa a ser «Cliente · Centro»
   * (`costCenterHeading`) y su logo cierra el membrete por la derecha, donde PyG y Ocupaciones
   * ponen el del centro de cada hoja (`letterheadLogos`). Ni el motor, ni el asiento, ni una sola
   * cifra lo miran.
   *
   * No indexado, como el logo y el perfil, así que tampoco costó versión nueva de Dexie.
   */
  costCenter?: CostCenter;
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
 * Una fila de bono que la captura de ESTE empleado declara, además de los trece ingresos del libro.
 *
 * Existe porque el rol de cada empresa nombra los suyos: `MOVILIZACION NO APORTABLE` y
 * `ALIMENTACION NO APORTABLE` en el libro de DELICMAR, otros en el siguiente. Un catálogo cerrado
 * no puede crecer a ese ritmo sin tocar el motor, el asiento y el comprobante cada vez.
 *
 * **El rótulo y el importe viajan JUNTOS**, y esa es la diferencia con la forma anterior, donde la
 * declaración vivía en el período y el importe en la ficha: así no puede existir un importe
 * huérfano cuyo concepto ya nadie declara, ni dos definiciones de cómo se llama una fila. El
 * argumento que sostenía lo otro —una columna es de toda la nómina— se cae en cuanto el comodín
 * `AH OTROS` del propio libro significa cosas distintas en empleados distintos.
 *
 * El `id` es estable e independiente del rótulo dentro de esa captura: renombrar no mueve el
 * importe, que es todo el motivo por el que el `id` existe además del nombre.
 */
export interface PayrollExtraRow {
  id: string;
  /** Como lo escribe el rol de esa empresa, verbatim: `MOVILIZACION NO APORTABLE`. */
  label: string;
  kind: PayrollExtraConceptKind;
  amount: number;
}

export interface PayrollPeriod {
  id: string;
  clientId: string;
  year: number;
  /** 0–11, igual que el resto de la app. */
  monthIndex: number;
  kind: PayrollPeriodKind;
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
   * Las filas de BONO que este empleado declara este mes, en el orden en que se declararon.
   *
   * Cada una lleva su rótulo, su clase y su importe: no hay declaración en un sitio e importe en
   * otro, así que un importe huérfano no puede existir. Quitar la fila se lleva el importe con ella.
   *
   * AUSENTE en toda captura que no declara ninguna, que se lee como «ningún bono».
   */
  extras?: PayrollExtraRow[];
  /**
   * El RÓTULO PROPIO que este empleado le puso a una fila del catálogo, por código de concepto
   * (`"E-11"` → `"Uniformes"`).
   *
   * Existe porque `E-11 OTROS` es un comodín: es la columna `AH` del libro y significa cosas
   * distintas en empleados distintos, así que el comprobante que cada uno firma tiene que poder
   * decir `UNIFORMES` en vez del nombre de la columna. Lo admite toda fila cuyo IMPORTE se teclea;
   * las `calculado` no, porque su rótulo es una tasa de ley y no un nombre.
   *
   * Vive en la captura y no en la ficha porque un rótulo acompaña a un importe, y los importes son
   * del MES. AUSENTE se lee como «cada fila se llama como el libro».
   */
  labels?: Record<string, string>;
  /** `Y`…`AN` · los doce egresos con nombre. El aporte al IESS (`X`) no está aquí: lo deriva
   *  el motor. */
  deductions: CapturedDeductions;
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
  /**
   * `AS`, `AT` · si se provisionan los décimos.
   *
   * Están en la FICHA por la misma razón que las dos de arriba, y no es una analogía: cobrar los
   * décimos mensualizados o acumularlos es una elección del EMPLEADO —la del SUT—, estable mes a
   * mes. Viviendo en la captura no sobrevivían a `copyRoster`, así que había que volver a
   * marcarlas cada mes empleado por empleado, y olvidarse un mes dejaba de provisionar sin que
   * nada lo dijera.
   *
   * Apagadas en todo el archivo real, porque los décimos ya se mensualizan en `N` y `O` y
   * provisionarlos otra vez los contaría dos veces. Que estén aquí no las hace menos del mes para
   * el motor: cada período guarda su propia ficha, así que el importador las sigue deduciendo del
   * archivo mes a mes.
   */
  provisionsThirteenth: boolean;
  provisionsFourteenth: boolean;
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
