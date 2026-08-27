/**
 * The PERÍODO's parameters (§3 of `docs/payroll/rol-de-pagos-formulas.md`).
 *
 * They are not constants of the code: they change by year —the SBU rises every January, the IESS
 * rates rarely— and that is why they are stored next to the período. It is what allows March 2026 to
 * keep squaring when 2027 brings another SBU, instead of a `const` rewriting history.
 *
 * **ONLY what is the same for every employee of a período comes in here.** The distinction belongs to
 * the firm and it is what separates this file from the rest of the engine: there are figures fixed by
 * LAW —which apply to everyone and only change by decree— and there are DISCRETIONARY decisions
 * —management, agreements with each employee— that vary case by case and **are typed in**. The latter
 * do not live here: they are inputs per employee and per month. `approvedOvertime` is the example,
 * and that is why it is an AMOUNT in `PayrollEmployeeInput` and not a rate in this table — «anything
 * more than a predetermined percentage would not be one» and «that variation is not computed, it is
 * manual».
 *
 * Each field is marked with its origin.
 */
export interface PayrollParameters {
  /** [LAW] The current SBU. It is what the décimo cuarto is spread from, and it does NOT depend on
   *  the employee's salary. It rises by decree every January. */
  unifiedBasicSalary: number;
  /** [LAW] Personal IESS contribution. `0.0945` = 9.45 %. */
  iessEmployeeRate: number;
  /** [LAW] Employer IESS contribution. `0.1215` = 12.15 %. */
  iessEmployerRate: number;
  /** [LAW] ACCRUED reserve fund. `0.0833` = 8.33 %. Careful: the PAID reserve fund uses a twelfth,
   *  not this rate, and they are not the same — see §8. */
  reserveFundRate: number;
  /** [BOOK CONVENTION] Days the book considers a full month, for prorating the salary. It is not a
   *  legal figure: it is how this sheet divides up the month. */
  monthlyDays: number;
  /** [BOOK CONVENTION] Hours of a working day, for the overtime hourly rate. */
  dailyHours: number;
  /** [BOOK CONVENTION] Days the book considers a year, for spreading the décimo cuarto. */
  yearlyDays: number;
  /** [LEY] Horas suplementarias: hora + 50 % de recargo. */
  overtimeMultiplier50: number;
  /** [LEY] Horas extraordinarias: hora + 100 % de recargo. */
  overtimeMultiplier100: number;
  /** [DISPUTED] The third class. In the book it is `0.25`, which is ONLY the premium, while the
   *  other two are the total, and one row uses `0.15` — see §11.2. Pending confirmation.
   *  When the answer arrives this number gets corrected, not a formula. */
  overtimeMultiplier25: number;
}

/**
 * The values in force in 2026, read from the formulas of HOTEL BOUTIQUE CULTURA MANOR's March 2026
 * rol. They are a new período's default; a stored período carries its own.
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
