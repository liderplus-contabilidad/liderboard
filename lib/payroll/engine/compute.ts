/**
 * El motor de cálculo del rol de pagos: las 20 columnas derivadas de la hoja `GENERAL`, en el
 * orden de dependencias del §5 de `docs/payroll/rol-de-pagos-formulas.md`.
 *
 * Es la reimplementación de las fórmulas del libro del contador, verificada contra el archivo
 * real de marzo 2026: reproduce las 20 columnas de los 6 empleados **exactas al bit**, ruido de
 * coma flotante incluido (`golden.test.ts`).
 *
 * Dos reglas gobiernan todo lo de abajo y no son cosmética:
 *
 * - **Las derivaciones redondean a dos decimales; los totales NO** (§9). `W`, `AO`, `AP`, `AX`
 *   y `AY` arrastran el ruido a propósito, porque es lo que guarda el archivo y lo que se
 *   compara contra el `PAGADO` tecleado a mano.
 * - **Los totales suman en el ORDEN DE COLUMNAS del libro.** Sin redondeo de por medio la suma
 *   en coma flotante no es asociativa, así que reordenar sumandos «para que se lea mejor»
 *   puede separar el resultado en el último bit.
 *
 * Nada aquí decide qué es un empleado ni de dónde salen los números: eso es de `upload/` y de
 * `db.ts`. Este módulo es una función pura de `(input, parámetros) → cifras`.
 */
import { sameToTheCentavo } from "../amounts";
import {
  contributoryBase,
  grossIncome,
  reserveFundAccrualBase,
  thirteenthBase,
  thirteenthProvisionBase,
  vacationBase,
} from "./bases";
import type { PayrollParameters } from "./parameters";
import { roundToCents } from "./round";
import type {
  CapturedDeductions,
  IncomeComponents,
  PayrollEmployeeComputation,
  PayrollEmployeeInput,
} from "./types";

/** `Y`…`AN` en el orden en que el libro los barre con `SUM(X:AN)`. */
function sumCapturedDeductions(d: CapturedDeductions): number {
  return (
    d.iessLoans +
    d.unpaidLeave +
    d.salaryAdvance +
    d.companyLoans +
    d.incomeTax +
    d.meals +
    d.fines +
    d.inHouseConsumption +
    d.solidarityContribution +
    d.otherDeductions +
    d.partTimeDeduction +
    d.medicalLeaveDeduction
  );
}

/** Cero exacto cuando el valor no llega a un centavo; si llega, se devuelve INTACTO, con su
 *  ruido. Se apoya en `sameToTheCentavo`, que es la única definición de «mismo importe» del
 *  módulo, para no abrir una segunda aquí. Ver el comentario de `difference` más abajo. */
function collapseSubCentavoNoise(value: number): number {
  return sameToTheCentavo(value, 0) ? 0 : value;
}

export function computeEmployeePayroll(
  input: PayrollEmployeeInput,
  parameters: PayrollParameters,
): PayrollEmployeeComputation {
  const p = parameters;

  // 1 · `F` — el sueldo base prorrateado por días. No se acota por arriba: el libro no lo hace,
  // y un mes de 31 días con 31 pagados es un caso real, no un error de captura.
  const unifiedSalary = roundToCents((input.baseSalary / p.monthlyDays) * input.days);

  // 2 · `J`, `K`, `L` — el valor de la hora sale del sueldo BASE, no del unificado: a quien
  // trabajó medio mes su hora extra se le paga a tarifa completa.
  const hourlyRate = input.baseSalary / p.monthlyDays / p.dailyHours;
  const overtimePay50 = roundToCents(hourlyRate * p.overtimeMultiplier50 * input.overtimeHours50);
  const overtimePay100 = roundToCents(
    hourlyRate * p.overtimeMultiplier100 * input.overtimeHours100,
  );
  const overtimePay25 = roundToCents(hourlyRate * p.overtimeMultiplier25 * input.overtimeHours25);

  // 3 · `M` — el importe de horas extras que se reconoce. Se TECLEA, no se calcula: `null` es
  // «todas las trabajadas» y cualquier número es ese importe exacto, incluido el `0` que el
  // libro escribe como `*0`. Lo no reconocido sigue VISIBLE en las tres columnas de arriba pero
  // no alimenta NADA: ni el total, ni el aporte, ni los décimos, ni las provisiones (§6).
  //
  // La rama `null` no redondea, igual que el libro, que escribe literalmente `(J+K+L)`: los tres
  // sumandos ya vienen redondeados y su suma arrastra el ruido que `W` tiene que conservar (§9).
  // Redondear aquí «para que quede limpio» rompería la igualdad al bit con el archivo.
  const overtimeTotal = input.approvedOvertime ?? overtimePay50 + overtimePay100 + overtimePay25;

  // 4 · `N` — el SBU repartido en el año por días trabajados. No depende del sueldo del
  // empleado; el contrato parcial cobra la mitad.
  const fourteenthFull = (p.unifiedBasicSalary / p.yearlyDays) * input.days;
  const fourteenthMonthly = roundToCents(
    input.contractType === "CT" ? fourteenthFull : fourteenthFull / 2,
  );

  // Los componentes se van llenando en el orden en que las bases los necesitan: `O` se deriva
  // de una base que NO lo contiene, y después entra en otras dos.
  const components: IncomeComponents = {
    unifiedSalary,
    overtimeTotal,
    fourteenthMonthly,
    thirteenthMonthly: 0,
    vacationPay: input.vacationPay,
    privateInsurance: input.privateInsurance,
    allowances: input.allowances,
    fixedCommission: input.fixedCommission,
    variableCommission: input.variableCommission,
    reserveFundPaid: 0,
    bonus: input.bonus,
    contributoryExtras: input.extras.contributory,
    nonContributoryExtras: input.extras.nonContributory,
  };

  // 5 · `O` — un doceavo de su propia base, que deja fuera las vacaciones mensualizadas.
  components.thirteenthMonthly = roundToCents(thirteenthBase(components) / 12);

  // 6 · `U` — solo lo cobra quien tiene derecho Y no lo acumula. Un doceavo, no la tasa del
  // 8,33 % que usa su gemelo `AW`: no dan lo mismo y el libro no los unifica (§7, §8).
  components.reserveFundPaid =
    input.hasReserveFund && !input.accumulatesReserveFund
      ? roundToCents(contributoryBase(components) / 12)
      : 0;

  // 7 · `W` — sin redondear, en el orden de columnas del libro.
  const gross = grossIncome(components);

  // 8 · `X` — base aportable por la tasa personal.
  const iessEmployee = roundToCents(contributoryBase(components) * p.iessEmployeeRate);

  // 9 · `AO` y 10 · `AP` — sin redondear ninguno de los dos.
  const totalDeductions = iessEmployee + sumCapturedDeductions(input.deductions);
  const netPay = gross - totalDeductions;

  // 11 · las cinco de la provisión, en orden de columna.
  const thirteenthProvision = input.flags.provisionsThirteenth
    ? roundToCents(thirteenthProvisionBase(components) / 12)
    : 0;
  // El libro escribe aquí un `470` rancio (y un `846` en su fila plantilla) en vez del SBU
  // vigente, pero como la columna va siempre multiplicada por cero nunca se pudo verificar
  // cuál era el correcto. Se usa el SBU del período, que es la única lectura defendible.
  const fourteenthProvisionFull = (p.unifiedBasicSalary / p.yearlyDays) * input.days;
  const fourteenthProvision = input.flags.provisionsFourteenth
    ? roundToCents(
        input.contractType === "CT" ? fourteenthProvisionFull : fourteenthProvisionFull / 2,
      )
    : 0;
  const iessEmployer = roundToCents(contributoryBase(components) * p.iessEmployerRate);
  const vacationProvision = roundToCents(vacationBase(components) / 24);
  const reserveFundAccrued =
    input.hasReserveFund && input.accumulatesReserveFund
      ? roundToCents(reserveFundAccrualBase(components) * p.reserveFundRate)
      : 0;

  // 12 · `AX` y 13 · `AY` — sin redondear.
  const totalProvision =
    thirteenthProvision +
    fourteenthProvision +
    iessEmployer +
    vacationProvision +
    reserveFundAccrued;
  const employerCost = totalProvision + gross;

  // 14 · `CA` — `null` cuando no hay `PAGADO`: sin él no se puede afirmar ni que cuadra ni que
  // no, y un cero ahí sería una conciliación inventada.
  //
  // Por DEBAJO del centavo la diferencia se colapsa a cero exacto, y no es una licencia: el
  // líquido es una suma sin redondear que llega con ruido (`457.69000000000005`) mientras lo
  // pagado está tecleado a mano con dos decimales (`457.69`), así que toda diferencia real es
  // un número entero de centavos y cualquier resto es del binario. Es la misma regla que
  // `sameToTheCentavo` ya aplica en el asiento, y es también lo que hace el archivo:
  // Excel colapsa a cero una resta despreciable frente a sus operandos, por eso `CA15` guarda
  // `0` y no `5,7e-14`. Lo que NO se toca es una diferencia de verdad: la de VEGA sigue siendo
  // `-41.70999999999992`, con su ruido, exactamente como el libro la guarda.
  const difference = input.paid === null ? null : collapseSubCentavoNoise(netPay - input.paid);

  return {
    unifiedSalary,
    overtimePay50,
    overtimePay100,
    overtimePay25,
    overtimeTotal,
    fourteenthMonthly,
    thirteenthMonthly: components.thirteenthMonthly,
    reserveFundPaid: components.reserveFundPaid,
    grossIncome: gross,
    iessEmployee,
    totalDeductions,
    netPay,
    thirteenthProvision,
    fourteenthProvision,
    iessEmployer,
    vacationProvision,
    reserveFundAccrued,
    totalProvision,
    employerCost,
    difference,
  };
}
