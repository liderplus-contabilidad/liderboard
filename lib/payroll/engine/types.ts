/**
 * The types of the rol's computation engine. Each field names a column of the accountant's book's
 * `GENERAL` sheet; the complete map is in `docs/payroll/rol-de-pagos-formulas.md` §1.
 */

/**
 * The eleven income components, which are where the six computation bases come from (§2).
 *
 * They are all together in one type —and not spread across functions— because the order in which
 * they are filled matters: `thirteenthMonthly` (`O`) is derived from a base that does NOT contain it,
 * and then enters two others. Each function of `bases.ts` declares with a `Pick` exactly which ones
 * it reads, so the function's type IS the documentation of which column enters that base.
 */
export interface IncomeComponents {
  /** `F` · SUELDO UNIFICADO */
  unifiedSalary: number;
  /** `M` · TOTAL HORAS EXTRAS recognised this month — the typed amount (`approvedOvertime`) or, if
   *  there is none, everything worked. It is the ONLY route by which overtime reaches a total or a
   *  base: no consumer sums `J+K+L` on its own. */
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
  /** `U` · FONDO DE RESERVA (the one paid within the month, not the one accrued) */
  reserveFundPaid: number;
  /** `V` · BONO CUMPLIMIENTO */
  bonus: number;
  /**
   * The CONTRIBUTORY extra concepts the período declares, already summed. **With no column in
   * Cultura Manor's book**: they are the ones other roles label on their own (`MOVILIZACION`,
   * `ALIMENTACION`), and here they arrive as a single number because to the six bases three bonuses
   * of 50 and one of 150 are indistinguishable.
   *
   * It behaves like `R`, `S` and `T`: it enters the five partial bases and the total.
   */
  contributoryExtras: number;
  /** The NON-contributory extra concepts, already summed. It behaves like `U` and `V`: it only
   *  reaches the total, without being the base of anything. */
  nonContributoryExtras: number;
}

/**
 * The extra concepts reduced to the only thing the computation looks at: how much each class adds up
 * to.
 *
 * It lives here, in the engine's vocabulary, and not in `lib/payroll/extra-income.ts`, which is what
 * PRODUCES it: that way the engine does not acquire a dependency on the way those concepts are stored
 * nor, through it, on the generic name rules of `lib/workspaces.ts`.
 */
export interface ExtraIncomeTotals {
  contributory: number;
  nonContributory: number;
}

/**
 * The deductions that are CAPTURED, in the book's column order (`Y`…`AN`). The order matters: `AO`
 * sums them unrounded, and floating-point addition is not associative (§9).
 *
 * The four unlabelled columns `AJ`–`AM` are deliberately missing; the book includes them in its
 * `SUM(X:AN)` but they are always zero — it is open question §11.4. As long as they are zero, not
 * modelling them gives the same total; if they turn out to be real deductions, they come in here with
 * their name.
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
  /** `AI` · DESCUENTO TIEMPO PACIAL (sic, that is how the book writes it) */
  partTimeDeduction: number;
  /** `AN` · Descuento PERMISO MEDICO */
  medicalLeaveDeduction: number;
}

/**
 * What the book writes as a `*0` at the end of a formula (§6). They are decisions PER EMPLOYEE and
 * PER MONTH: the accountant applies them by hand, cell by cell. Modelling them —and not baking the
 * zero in— is what allows the app to reproduce the file as it arrived and at the same time allow
 * correcting it.
 */
export interface PayrollComputationFlags {
  /** `AS` · is the décimo tercero provisioned? Switched off throughout the real file: it is already
   *  taken monthly in `O`, so provisioning it again would count it twice. */
  provisionsThirteenth: boolean;
  /** `AT` · is the décimo cuarto provisioned? Switched off throughout the real file, for the same
   *  reason. */
  provisionsFourteenth: boolean;
}

/** Everything needed to compute ONE employee's month. Nothing here is derived. */
export interface PayrollEmployeeInput {
  /** `D` · SUELDO BASE */
  baseSalary: number;
  /** `E` · DIAS paid in the month */
  days: number;
  /** `BB` · TC. A part-time contract receives half the décimo cuarto. */
  contractType: "CT" | "TP";
  /** `BA` · FR — is there an entitlement to the reserve fund? */
  hasReserveFund: boolean;
  /** `AZ` · AC FR — is it accrued at the IESS instead of received monthly? See §7. */
  accumulatesReserveFund: boolean;
  /** `G` · number of hours at 50 % */
  overtimeHours50: number;
  /** `H` · number of hours at 100 % */
  overtimeHours100: number;
  /** `I` · number of hours of the third class. The book labels it 15 % and its value 25 % (§11.2). */
  overtimeHours25: number;
  /**
   * `M` · the AMOUNT of overtime recognised this month. `null` = all the hours worked (`J+K+L`); a
   * number = that exact amount, and `0` is the `*0` the book writes by hand.
   *
   * **It is typed, not computed.** The rol is presented to Gerencia before being paid and what is
   * approved may be all of it or a part, depending on the hotel's occupancy that month and on the
   * agreements with each employee; the firm was explicit that «anything more than a predetermined
   * percentage would not be one» and that «that variation is not computed, it is manual». That is why
   * this is an amount and not a percentage: the app derives the figure from nothing, it receives it.
   * And that is why it lives here, among what is captured, and not in `PayrollParameters`, which is
   * only what is fixed by Law.
   *
   * It is exactly what the Excel does, where `M` is a cell the accountant edits.
   *
   * It trims what ADDS UP, not what is shown: `J`, `K` and `L` keep showing the whole value of the
   * hours worked. What is not recognised does not enter `W` nor ANY base — not the IESS contribution,
   * not the décimo tercero, not the vacation provision.
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
   * **It is an AMOUNT already computed, not a base to apply a percentage to.** The firm names a 20 %
   * tied to the variable commission, but confirmed that «it is manual anyway»: the percentage is
   * applied outside the app and the result arrives here. Do not add a 20 % computation — the book
   * does not have it either (there is no formula with `0.2` in its 8 sheets) and it would be a second
   * definition that can drift from theirs.
   */
  variableCommission: number;
  /** `V` · BONO CUMPLIMIENTO */
  bonus: number;
  /**
   * The income concepts the PERÍODO declares in addition to the book's, already summed by class.
   *
   * It arrives aggregated and not as a list because the engine has no reason to know how many there
   * are or what they are called — that is needed by the screen, the payslip and the cap notice, which
   * read the período's declaration directly. What reduces the list to these two numbers is
   * `sumExtraIncome` (`lib/payroll/extra-income.ts`), in the same place where the record is crossed
   * with the capture.
   */
  extras: ExtraIncomeTotals;
  deductions: CapturedDeductions;
  /** `BZ` · PAGADO, typed by hand. `null` when the período does not declare it yet — and that is NOT
   *  zero: without it an employee is neither reconciled nor in difference. */
  paid: number | null;
  flags: PayrollComputationFlags;
}

/** The 20 derived columns. None is stored: they are always recomputed from the input. */
export interface PayrollEmployeeComputation {
  /** `F` */ unifiedSalary: number;
  /** `J` */ overtimePay50: number;
  /** `K` */ overtimePay100: number;
  /** `L` */ overtimePay25: number;
  /** `M` — the overtime trimmed by what Gerencia approved, while the three values above stay whole.
   *  It is what allows the rol to show 16.75 of overtime and a total that does not contain it. */
  overtimeTotal: number;
  /** `N` */ fourteenthMonthly: number;
  /** `O` */ thirteenthMonthly: number;
  /** `U` */ reserveFundPaid: number;
  /** `W` — unrounded */ grossIncome: number;
  /** `X` */ iessEmployee: number;
  /** `AO` — unrounded */ totalDeductions: number;
  /** `AP` — unrounded */ netPay: number;
  /** `AS` */ thirteenthProvision: number;
  /** `AT` */ fourteenthProvision: number;
  /** `AU` */ iessEmployer: number;
  /** `AV` */ vacationProvision: number;
  /** `AW` */ reserveFundAccrued: number;
  /** `AX` — unrounded */ totalProvision: number;
  /** `AY` — unrounded */ employerCost: number;
  /** `CA` — `null` when there is no declared `PAGADO`, which is not the same as zero. */
  difference: number | null;
}
