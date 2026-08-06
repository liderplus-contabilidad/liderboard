/**
 * Los parámetros del PERÍODO (§3 de `docs/payroll/rol-de-pagos-formulas.md`).
 *
 * No son constantes del código: cambian por año —el SBU sube cada enero, las tasas del IESS
 * rara vez— y por eso se guardan junto al período. Es lo que permite que marzo de 2026 siga
 * cuadrando cuando 2027 traiga otro SBU, en vez de que un `const` reescriba la historia.
 *
 * **Aquí SOLO entra lo que es igual para todos los empleados de un período.** La distinción es
 * de la firma y es la que separa este archivo del resto del motor: hay cifras fijadas por LEY
 * —que se aplican a todo el mundo y solo cambian por decreto— y hay decisiones DISCRECIONALES
 * —gerencia, acuerdos con cada empleado— que varían caso por caso y **se teclean**. Las segundas
 * no viven aquí: son entradas por empleado y por mes. `approvedOvertime` es el ejemplo, y por eso
 * es un IMPORTE en `PayrollEmployeeInput` y no una tasa en esta tabla — «más que un porcentaje
 * predeterminado no sería como tal» y «esa variación no es calculada, sino manual».
 *
 * Cada campo va marcado con su origen.
 */
export interface PayrollParameters {
  /** [LEY] El SBU vigente. Es lo que reparte el décimo cuarto, y NO depende del sueldo del
   *  empleado. Sube por decreto cada enero. */
  unifiedBasicSalary: number;
  /** [LEY] Aporte personal al IESS. `0.0945` = 9,45 %. */
  iessEmployeeRate: number;
  /** [LEY] Aporte patronal al IESS. `0.1215` = 12,15 %. */
  iessEmployerRate: number;
  /** [LEY] Fondo de reserva ACUMULADO. `0.0833` = 8,33 %. Ojo: el fondo de reserva PAGADO usa
   *  un doceavo, no esta tasa, y no dan lo mismo — ver §8. */
  reserveFundRate: number;
  /** [CONVENCIÓN DEL LIBRO] Días que el libro considera un mes completo, para prorratear el
   *  sueldo. No es una cifra legal: es cómo esta hoja reparte el mes. */
  monthlyDays: number;
  /** [CONVENCIÓN DEL LIBRO] Horas de una jornada, para el valor de la hora extra. */
  dailyHours: number;
  /** [CONVENCIÓN DEL LIBRO] Días que el libro considera un año, para repartir el décimo cuarto. */
  yearlyDays: number;
  /** [LEY] Horas suplementarias: hora + 50 % de recargo. */
  overtimeMultiplier50: number;
  /** [LEY] Horas extraordinarias: hora + 100 % de recargo. */
  overtimeMultiplier100: number;
  /** [EN DISPUTA] La tercera clase. En el libro es `0.25`, que es SOLO el recargo, mientras las
   *  otras dos son el total, y una fila usa `0.15` — ver §11.2. Pendiente de confirmación.
   *  Cuando llegue la respuesta se corrige este número, no una fórmula. */
  overtimeMultiplier25: number;
}

/**
 * Los valores vigentes en 2026, leídos de las fórmulas del rol de marzo 2026 de HOTEL BOUTIQUE
 * CULTURA MANOR. Son el default de un período nuevo; un período guardado lleva los suyos.
 */
export const DEFAULT_PAYROLL_PARAMETERS: PayrollParameters = {
  unifiedBasicSalary: 482,
  iessEmployeeRate: 0.0945,
  iessEmployerRate: 0.1215,
  reserveFundRate: 0.0833,
  monthlyDays: 30,
  dailyHours: 8,
  yearlyDays: 360,
  overtimeMultiplier50: 1.5,
  overtimeMultiplier100: 2,
  overtimeMultiplier25: 0.25,
};
