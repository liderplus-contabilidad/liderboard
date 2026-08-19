/**
 * El puente entre lo que la base guarda de un empleado y lo que el motor consume.
 *
 * Existe porque las dos formas responden a preguntas distintas y no deben fusionarse:
 * `PayrollEmployeeLine` es cómo se ALMACENA —ficha estable más la captura del mes—, y
 * `PayrollEmployeeInput` es lo que el CÁLCULO necesita, sin identidad ni procedencia. Que el motor
 * no conozca `id`, `periodId` ni `name` es lo que lo mantiene testeable contra el libro del
 * contador sin inventarse un empleado.
 */
import { computeEmployeePayroll } from "./engine/compute";
import type { PayrollParameters } from "./engine/parameters";
import type { PayrollEmployeeComputation, PayrollEmployeeInput } from "./engine/types";
import { sumExtraIncome } from "./extra-income";
import type { ParsedPayrollEmployeeLine, PayrollMonthlyCapture } from "./types";

/**
 * Una captura en blanco: todo en cero y sin recorte de horas extras.
 *
 * Devuelve un objeto NUEVO en cada llamada, y eso no es ceremonia: una constante compartida
 * dejaría que editar el mes de un empleado moviera las cifras de otro, porque `deductions` es
 * un objeto anidado y se copiaría por referencia.
 */
export function emptyCapture(): PayrollMonthlyCapture {
  return {
    overtimeHours50: 0,
    overtimeHours100: 0,
    overtimeHours25: 0,
    approvedOvertime: null,
    vacationPay: 0,
    privateInsurance: 0,
    allowances: 0,
    fixedCommission: 0,
    variableCommission: 0,
    bonus: 0,
    extras: [],
    deductions: {
      iessLoans: 0,
      unpaidLeave: 0,
      salaryAdvance: 0,
      companyLoans: 0,
      incomeTax: 0,
      meals: 0,
      fines: 0,
      inHouseConsumption: 0,
      solidarityContribution: 0,
      otherDeductions: 0,
      partTimeDeduction: 0,
      medicalLeaveDeduction: 0,
    },
    provisionsThirteenth: false,
    provisionsFourteenth: false,
    paid: null,
  };
}

/**
 * Cruza la ficha del empleado con lo capturado del mes. **Siempre devuelve una entrada**: una
 * línea sin captura se lee como una captura VACÍA.
 *
 * Eso es deliberado y es lo que hace que la app sirva sin Excel. El rol de un empleado no
 * necesita ningún archivo para existir: su sueldo unificado sale del sueldo base y los días, el
 * décimo cuarto del SBU, el décimo tercero y el aporte al IESS de ahí. Lo único que aporta una
 * captura son las horas extras, los otros pagos y los descuentos — todo lo cual, sin capturar,
 * vale CERO de verdad, no «no se sabe». Una nómina recién copiada del mes anterior enseña su rol
 * completo desde el primer momento, que es el caso de uso principal del módulo.
 *
 * Es la diferencia con PyG, de donde se copió al principio la regla contraria: allí un mes no
 * cargado no es un mes en cero porque nadie declaró esas cifras, mientras que aquí la ficha
 * DECLARA el sueldo y el resto se deriva. Lo que sí conserva esa distinción es `paid`: sin
 * nadie que declare lo transferido queda `null` y el empleado sale «sin conciliar», que no es lo
 * mismo que cuadrado.
 *
 * Reparto de responsabilidades entre las dos mitades, que es lo que decide qué campo sale de
 * dónde: el fondo de reserva (`hasReserveFund`, `accumulatesReserveFund`) es de la FICHA porque
 * depende de la antigüedad y de una elección del empleado, no del mes — si viajara en la
 * captura, copiar la nómina del mes anterior lo perdería. `paid` es del MES y por eso vive en la
 * captura, la teclee quien arma el rol o la traiga el `BZ` de un archivo: para el motor son
 * indistinguibles, que es lo que permite conciliar un alta a mano sin ningún Excel de por medio.
 *
 * Las FILAS DE BONO llegan dentro de la captura y no por parámetro, y eso cierra un modo de fallo
 * en vez de tener que defenderlo: cuando la declaración vivía en el período, esta función recibía
 * la lista por argumento y el argumento se declaró obligatorio y sin default a propósito, para que
 * un consumidor que lo olvidara no compilara en lugar de devolver un rol POR DEBAJO con una cifra
 * plausible que ningún test de otro consumidor mira. Viajando en la línea no hay nada que olvidar.
 */
export function toEngineInput(line: ParsedPayrollEmployeeLine): PayrollEmployeeInput {
  const capture = line.capture ?? emptyCapture();

  return {
    baseSalary: line.baseSalary,
    days: line.days,
    contractType: line.contractType,
    hasReserveFund: line.hasReserveFund,
    accumulatesReserveFund: line.accumulatesReserveFund,
    overtimeHours50: capture.overtimeHours50,
    overtimeHours100: capture.overtimeHours100,
    overtimeHours25: capture.overtimeHours25,
    approvedOvertime: capture.approvedOvertime,
    vacationPay: capture.vacationPay,
    privateInsurance: capture.privateInsurance,
    allowances: capture.allowances,
    fixedCommission: capture.fixedCommission,
    variableCommission: capture.variableCommission,
    bonus: capture.bonus,
    // La lista se reduce AQUÍ a sus dos agregados: el motor no sabe cuántas filas hay ni cómo se
    // llaman, porque para las seis bases tres bonos aportables de 50 y uno de 150 son lo mismo.
    extras: sumExtraIncome(capture.extras),
    // Copia, no referencia: quien reciba esta entrada puede editarla para previsualizar un
    // cambio sin que eso toque lo guardado hasta que alguien decida escribirlo.
    deductions: { ...capture.deductions },
    paid: capture.paid,
    flags: {
      provisionsThirteenth: capture.provisionsThirteenth,
      provisionsFourteenth: capture.provisionsFourteenth,
    },
  };
}

/**
 * El rol de UNA línea guardada: la composición de `toEngineInput` con el motor, declarada aquí
 * una sola vez.
 *
 * Existe porque esa pareja de llamadas la necesitan cuatro consumidores —la tarjeta de KPIs, la
 * tabla de la nómina, la ficha del empleado y la descarga de comprobantes— y estaba escrita a
 * mano en cada uno. Con una sola definición, ninguna pantalla puede quedarse con una versión
 * distinta de «el rol de este empleado»; sin ella, ya pasó: el badge de conciliación comparaba
 * una cosa y el motor otra.
 */
export function computeLinePayroll(
  // `ParsedPayrollEmployeeLine` y no `PayrollEmployeeLine`: el rol de una línea no depende de su
  // `id` ni de su `periodId`, y pedir la forma sin dueño es lo que deja a la PREVIA de una carga
  // totalizar lo que el archivo trae antes de que exista en la base — con esta misma definición,
  // no con una copia.
  line: ParsedPayrollEmployeeLine,
  parameters: PayrollParameters,
): PayrollEmployeeComputation {
  return computeEmployeePayroll(toEngineInput(line), parameters);
}
