/**
 * Los tipos del motor de cálculo del rol. Cada campo nombra una columna de la hoja `GENERAL`
 * del libro del contador; el mapa completo está en `docs/payroll/rol-de-pagos-formulas.md` §1.
 */

/**
 * Los once componentes de ingreso, que son de donde salen las seis bases de cálculo (§2).
 *
 * Están todos juntos en un tipo —y no repartidos por función— porque el orden en que se llenan
 * importa: `thirteenthMonthly` (`O`) se deriva de una base que NO lo contiene, y luego entra en
 * otras dos. Cada función de `bases.ts` declara con un `Pick` exactamente cuáles lee, así que
 * el tipo de la función ES la documentación de qué columna entra en esa base.
 */
export interface IncomeComponents {
  /** `F` · SUELDO UNIFICADO */
  unifiedSalary: number;
  /** `M` · TOTAL HORAS EXTRAS reconocido este mes — el importe tecleado (`approvedOvertime`) o,
   *  si no hay ninguno, todo lo trabajado. Es la ÚNICA vía por la que las horas extras alcanzan
   *  un total o una base: ningún consumidor suma `J+K+L` por su cuenta. */
  overtimeTotal: number;
  /** `N` · DECIMO IV MENSUAL */
  fourteenthMonthly: number;
  /** `O` · DECIMO III MENSUAL */
  thirteenthMonthly: number;
  /** `P` · VACACIONES - MENSUAL */
  vacationPay: number;
  /** `Q` · SEGURO PRIVADO */
  privateInsurance: number;
  /** `R` · VIATICOS/VIVIENDA */
  allowances: number;
  /** `S` · COMISION FIJA POR VTAS. */
  fixedCommission: number;
  /** `T` · COMISION VARIABLE */
  variableCommission: number;
  /** `U` · FONDO DE RESERVA (el que se paga en el mes, no el que se acumula) */
  reserveFundPaid: number;
  /** `V` · BONO CUMPLIMIENTO */
  bonus: number;
}

/**
 * Los egresos que se CAPTURAN, en el orden de columnas del libro (`Y`…`AN`). El orden importa:
 * `AO` los suma sin redondear, y la suma en coma flotante no es asociativa (§9).
 *
 * Faltan a propósito las cuatro columnas sin rótulo `AJ`–`AM`, que el libro incluye en su
 * `SUM(X:AN)` pero siempre valen cero — es la pregunta abierta §11.4. Mientras valgan cero, no
 * modelarlas da el mismo total; si resultan ser descuentos reales, entran aquí con su nombre.
 */
export interface CapturedDeductions {
  /** `Y` · PRESTAMOS QUIROGRAFARIOS E HIPOTECARIOS */
  iessLoans: number;
  /** `Z` · LICENCIA SIN SUELDO */
  unpaidLeave: number;
  /** `AA` · ANTICIPO SUELDO */
  salaryAdvance: number;
  /** `AB` · PRESTAMOS EMPRESARIALES */
  companyLoans: number;
  /** `AC` · IMPUESTO RENTA */
  incomeTax: number;
  /** `AD` · ALMUERZOS */
  meals: number;
  /** `AE` · MULTAS */
  fines: number;
  /** `AF` · CONSUMO LOCALES EMPLEADO */
  inHouseConsumption: number;
  /** `AG` · CONTRIBUCION SOLIDARIA */
  solidarityContribution: number;
  /** `AH` · OTROS */
  otherDeductions: number;
  /** `AI` · DESCUENTO TIEMPO PACIAL (sic, así lo escribe el libro) */
  partTimeDeduction: number;
  /** `AN` · Descuento PERMISO MEDICO */
  medicalLeaveDeduction: number;
}

/**
 * Lo que el libro escribe como un `*0` al final de una fórmula (§6). Son decisiones POR EMPLEADO
 * y POR MES: el contador las aplica a mano, celda por celda. Modelarlas —y no hornear el cero—
 * es lo que permite que la app reproduzca el archivo tal como llegó y a la vez deje corregirlo.
 */
export interface PayrollComputationFlags {
  /** `AS` · ¿se provisiona el décimo tercero? Apagada en todo el archivo real: ya se mensualiza
   *  en `O`, así que provisionarlo otra vez lo contaría dos veces. */
  provisionsThirteenth: boolean;
  /** `AT` · ¿se provisiona el décimo cuarto? Apagada en todo el archivo real, por lo mismo. */
  provisionsFourteenth: boolean;
}

/** Todo lo que hace falta para calcular el mes de UN empleado. Nada aquí se deriva. */
export interface PayrollEmployeeInput {
  /** `D` · SUELDO BASE */
  baseSalary: number;
  /** `E` · DIAS pagados del mes */
  days: number;
  /** `BB` · TC. El parcial cobra la mitad del décimo cuarto. */
  contractType: "CT" | "TP";
  /** `BA` · FR — ¿tiene derecho a fondo de reserva? */
  hasReserveFund: boolean;
  /** `AZ` · AC FR — ¿lo acumula en el IESS en vez de cobrarlo mensual? Ver §7. */
  accumulatesReserveFund: boolean;
  /** `G` · cantidad de horas al 50 % */
  overtimeHours50: number;
  /** `H` · cantidad de horas al 100 % */
  overtimeHours100: number;
  /** `I` · cantidad de horas de la tercera clase. El libro la rotula 15 % y a su valor 25 % (§11.2). */
  overtimeHours25: number;
  /**
   * `M` · el IMPORTE de horas extras que se reconoce este mes. `null` = todas las trabajadas
   * (`J+K+L`); un número = ese importe exacto, y `0` es el `*0` que el libro escribe a mano.
   *
   * **Se teclea, no se calcula.** El rol se presenta a Gerencia antes de pagarse y lo aprobado
   * puede ser la totalidad o una parte, según la ocupación del hotel ese mes y los acuerdos con
   * cada empleado; la firma fue explícita en que «más que un porcentaje predeterminado no sería
   * como tal» y en que «esa variación no es calculada, sino manual». Por eso esto es un importe
   * y no un porcentaje: la app no deriva la cifra de nada, la recibe. Y por eso vive aquí, entre
   * lo que se captura, y no en `PayrollParameters`, que es solo lo fijado por Ley.
   *
   * Es exactamente lo que hace el Excel, donde `M` es una celda que el contador edita.
   *
   * Recorta lo que SUMA, no lo que se muestra: `J`, `K` y `L` siguen enseñando el valor entero
   * de las horas trabajadas. Lo no reconocido no entra a `W` ni a NINGUNA base — ni al aporte al
   * IESS, ni al décimo tercero, ni a la provisión de vacaciones.
   */
  approvedOvertime: number | null;
  /** `P` · VACACIONES - MENSUAL */
  vacationPay: number;
  /** `Q` · SEGURO PRIVADO */
  privateInsurance: number;
  /** `R` · VIATICOS/VIVIENDA */
  allowances: number;
  /** `S` · COMISION FIJA POR VTAS. */
  fixedCommission: number;
  /**
   * `T` · COMISION VARIABLE.
   *
   * **Es un IMPORTE ya calculado, no una base a la que aplicar un porcentaje.** La firma nombra
   * un 20 % ligado a la comisión variable, pero confirmó que «es igual manual»: el porcentaje se
   * aplica fuera de la app y aquí llega el resultado. No añadir un cálculo del 20 % — el libro
   * tampoco lo tiene (no hay ninguna fórmula con `0.2` en las 8 hojas) y sería una segunda
   * definición que puede separarse de la suya.
   */
  variableCommission: number;
  /** `V` · BONO CUMPLIMIENTO */
  bonus: number;
  deductions: CapturedDeductions;
  /** `BZ` · PAGADO, tecleado a mano. `null` cuando el período no lo declara todavía — y eso NO
   *  es cero: sin él un empleado no está ni conciliado ni con diferencia. */
  paid: number | null;
  flags: PayrollComputationFlags;
}

/** Las 20 columnas derivadas. Ninguna se guarda: se recalculan siempre desde el input. */
export interface PayrollEmployeeComputation {
  /** `F` */ unifiedSalary: number;
  /** `J` */ overtimePay50: number;
  /** `K` */ overtimePay100: number;
  /** `L` */ overtimePay25: number;
  /** `M` — las horas extras recortadas por lo que Gerencia aprobó, mientras los tres valores de
   *  arriba siguen enteros. Es lo que permite que el rol enseñe 16,75 de horas extras y un total
   *  que no las contiene. */
  overtimeTotal: number;
  /** `N` */ fourteenthMonthly: number;
  /** `O` */ thirteenthMonthly: number;
  /** `U` */ reserveFundPaid: number;
  /** `W` — sin redondear */ grossIncome: number;
  /** `X` */ iessEmployee: number;
  /** `AO` — sin redondear */ totalDeductions: number;
  /** `AP` — sin redondear */ netPay: number;
  /** `AS` */ thirteenthProvision: number;
  /** `AT` */ fourteenthProvision: number;
  /** `AU` */ iessEmployer: number;
  /** `AV` */ vacationProvision: number;
  /** `AW` */ reserveFundAccrued: number;
  /** `AX` — sin redondear */ totalProvision: number;
  /** `AY` — sin redondear */ employerCost: number;
  /** `CA` — `null` cuando no hay `PAGADO` declarado, que no es lo mismo que cero. */
  difference: number | null;
}
