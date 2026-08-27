/**
 * THE ROL'S CONCEPT CATALOGUE — declared just ONCE.
 *
 * Each entry ties together three things that have to say the same or the rol stops squaring with the
 * accountant's Excel: the **code** the screen names it with (`I-01`, `E-04`), the **column** of the
 * `GENERAL` sheet it comes from, and the **field** of the engine or of the capture that carries it.
 * None of that can live loose in a component: a different label on two screens or a column
 * misattributed in the parser are errors no test of figures detects, because the figures keep adding
 * up the same.
 *
 * This list's order is the SCREEN's: the `calculado` ones grouped at the top, because in the table
 * they are the grey rows that are not edited. **It is not the printed payslip's**, which orders by
 * the book's column and that is why it puts `I-07 Fondo de reserva` (column `U`) twelfth, behind
 * `COMISION VARIABLE`, and not seventh. That difference does not force declaring a second list:
 * `lib/payroll/payslip/` orders by the `column` field, which is already here.
 *
 * `calculado` = derived by `lib/payroll/engine/`; `capturado` = typed by whoever captures the month.
 * On screen the calculated ones go grey and are not edited, which is what the design calls «the
 * values in grey compute themselves».
 *
 * Two columns of the book are deliberately left outside this catalogue:
 * - `M` (TOTAL HORAS EXTRAS) is not a concept but the TOTAL of I-02…I-04, and it is where the
 *   approved amount lives (`approvedOvertime`); the screen shows it as the trim on those three rows,
 *   not as a row of its own.
 * - `AJ`–`AM`, four UNLABELLED deduction columns the book includes in its `SUM(X:AN)` and that are
 *   always zero. With no name they cannot come in here — it is open question §11.4.
 */
import type { CapturedDeductions, PayrollEmployeeComputation } from "./engine/types";
import type { PayrollMonthlyCapture } from "./types";

/** The fields of `PayrollMonthlyCapture` that are a typed income amount. */
export type CapturedIncomeField =
  | "vacationPay"
  | "privateInsurance"
  | "allowances"
  | "fixedCommission"
  | "variableCommission"
  | "bonus";

/** The fields of `PayrollEmployeeComputation` that are a derived income amount. */
export type ComputedIncomeField =
  | "unifiedSalary"
  | "overtimePay50"
  | "overtimePay100"
  | "overtimePay25"
  | "fourteenthMonthly"
  | "thirteenthMonthly"
  | "reserveFundPaid";

/** The hour quantities, which only three concepts have. */
export type OvertimeHoursField = "overtimeHours50" | "overtimeHours100" | "overtimeHours25";

export interface ConceptBase {
  /** How the screen names it. It is not a database id: it is not persisted. */
  code: string;
  /** Column of the `GENERAL` sheet. It is the traceability to the accountant's file. */
  column: string;
  /** Spanish label, the SCREEN's: lower case, normalized accents. */
  label: string;
  /**
   * VERBATIM label from the `INDIVIDUAL` payslip, the one printed in the PDF — capitals, punctuation
   * and the accountant's typos included (`DESCUENTO TIEMPO PACIAL`, `COMISION FIJA POR VTAS.`). They
   * are the labels they check paper against screen with.
   *
   * It is MANDATORY and lives here rather than in a separate `code → label` map for the same reason
   * this catalogue exists: a loose map falls short when someone adds a concept, and no test of
   * figures gives it away because the figures keep adding up the same. As a field, the compiler
   * rejects the incomplete concept.
   *
   * Two depart from the cell's literal, on purpose:
   * - `CONTRIBUCION SOLIDARIA` goes without the line break the cell carries inside it (`AG2`): a
   *   two-line row would break the fixed rhythm of the other twenty-five.
   * - Column `Q` is printed `SEGURO PRIVADO`. The book contradicts itself —its left-hand copy reads it
   *   from that column's header and the right-hand one says `GERENCIA DE TURNO` written by hand— and
   *   the header wins, which is where the datum comes from.
   */
  payslipLabel: string;
}

export type IncomeConcept = ConceptBase & {
  /**
   * The `(*)` the payslip writes in the `Cantidad` column, and which its footnote explains: «No
   * aporta IESS ni es Ingreso Gravado».
   *
   * They are exactly the two income items `grossIncome` adds and NO base touches — the paid reserve
   * fund and the bonus—, according to `lib/payroll/engine/bases.ts`. It is declared here rather than
   * derived at runtime so as not to put a call to the engine in the layer that only has to produce an
   * asterisk, and `concepts.test.ts` ties it to the engine with an executable assertion: adding 1 to
   * the field of a marked concept cannot move `contributoryBase`.
   */
  notContributory?: true;
} & (
    | {
        kind: "calculado";
        field: ComputedIncomeField;
        /** The three overtime classes declare which quantity they come from; the rest do not. */
        hoursField?: OvertimeHoursField;
        hoursColumn?: string;
      }
    | { kind: "capturado"; field: CapturedIncomeField }
  );

export type DeductionConcept = ConceptBase &
  (
    | { kind: "calculado"; field: "iessEmployee" }
    | { kind: "capturado"; field: keyof CapturedDeductions }
  );

/** The 13 income items, in the book's order. */
export const INCOME_CONCEPTS: readonly IncomeConcept[] = [
  {
    code: "I-01",
    column: "F",
    label: "Sueldo unificado",
    payslipLabel: "SUELDO UNIFICADO",
    kind: "calculado",
    field: "unifiedSalary",
  },
  {
    code: "I-02",
    column: "J",
    label: "Horas extras 50%",
    payslipLabel: "VALOR GANADO EXTRAS 50%",
    kind: "calculado",
    field: "overtimePay50",
    hoursField: "overtimeHours50",
    hoursColumn: "G",
  },
  {
    code: "I-03",
    column: "K",
    label: "Horas extras 100%",
    payslipLabel: "VALOR GANADO EXTRAS 100%",
    kind: "calculado",
    field: "overtimePay100",
    hoursField: "overtimeHours100",
    hoursColumn: "H",
  },
  {
    // The book labels the QUANTITY «HORAS EXTRAS 15%» and its VALUE «VALOR GANADO EXTRAS 25%», and
    // one row uses 0.15 where the others use 0.25. Here 25 % is written because it is what the value
    // column says, which is the one that produces the amount — pending §11.2.
    code: "I-04",
    column: "L",
    label: "Horas extras 25%",
    payslipLabel: "VALOR GANADO EXTRAS 25%",
    kind: "calculado",
    field: "overtimePay25",
    hoursField: "overtimeHours25",
    hoursColumn: "I",
  },
  {
    code: "I-05",
    column: "N",
    label: "Décimo cuarto mensualizado",
    payslipLabel: "DECIMO IV SUELDO-MENSUAL",
    kind: "calculado",
    field: "fourteenthMonthly",
  },
  {
    code: "I-06",
    column: "O",
    label: "Décimo tercero mensualizado",
    payslipLabel: "DECIMO III SUELDO-MENSUAL",
    kind: "calculado",
    field: "thirteenthMonthly",
  },
  {
    code: "I-07",
    column: "U",
    label: "Fondo de reserva",
    payslipLabel: "FONDO DE RESERVA",
    notContributory: true,
    kind: "calculado",
    field: "reserveFundPaid",
  },
  {
    code: "I-08",
    column: "P",
    label: "Vacaciones mensualizadas",
    payslipLabel: "VACACIONES - MENSUAL",
    kind: "capturado",
    field: "vacationPay",
  },
  {
    code: "I-09",
    column: "Q",
    label: "Seguro privado",
    payslipLabel: "SEGURO PRIVADO",
    kind: "capturado",
    field: "privateInsurance",
  },
  {
    code: "I-10",
    column: "R",
    label: "Viáticos / vivienda",
    payslipLabel: "VIATICOS/VIVIENDA",
    kind: "capturado",
    field: "allowances",
  },
  {
    code: "I-11",
    column: "S",
    label: "Comisión fija por ventas",
    payslipLabel: "COMISION FIJA POR VTAS.",
    kind: "capturado",
    field: "fixedCommission",
  },
  {
    code: "I-12",
    column: "T",
    label: "Comisión variable",
    payslipLabel: "COMISION VARIABLE",
    kind: "capturado",
    field: "variableCommission",
  },
  {
    code: "I-13",
    column: "V",
    label: "Bono de cumplimiento",
    payslipLabel: "BONO CUMPLIMIENTO",
    notContributory: true,
    kind: "capturado",
    field: "bonus",
  },
];

/** The 13 deductions, in the book's order. The first is the only derived one. */
export const DEDUCTION_CONCEPTS: readonly DeductionConcept[] = [
  {
    code: "E-01",
    column: "X",
    label: "Aportes al IESS",
    payslipLabel: "APORTES AL IESS",
    kind: "calculado",
    field: "iessEmployee",
  },
  {
    code: "E-02",
    column: "Y",
    label: "Préstamos quirografarios e hipotecarios",
    payslipLabel: "PRESTAMOS QUIROGRAFARIOS E HIPOTECARIOS",
    kind: "capturado",
    field: "iessLoans",
  },
  {
    code: "E-03",
    column: "Z",
    label: "Licencia sin sueldo",
    payslipLabel: "LICENCIA SIN SUELDO",
    kind: "capturado",
    field: "unpaidLeave",
  },
  {
    code: "E-04",
    column: "AA",
    label: "Anticipo de sueldo",
    payslipLabel: "ANTICIPO SUELDO",
    kind: "capturado",
    field: "salaryAdvance",
  },
  {
    code: "E-05",
    column: "AB",
    label: "Préstamos empresariales",
    payslipLabel: "PRESTAMOS EMPRESARIALES",
    kind: "capturado",
    field: "companyLoans",
  },
  {
    code: "E-06",
    column: "AC",
    label: "Impuesto a la renta",
    payslipLabel: "IMPUESTO RENTA",
    kind: "capturado",
    field: "incomeTax",
  },
  {
    code: "E-07",
    column: "AD",
    label: "Almuerzos",
    payslipLabel: "ALMUERZOS",
    kind: "capturado",
    field: "meals",
  },
  {
    code: "E-08",
    column: "AE",
    label: "Multas",
    payslipLabel: "MULTAS",
    kind: "capturado",
    field: "fines",
  },
  {
    code: "E-09",
    column: "AF",
    label: "Consumo en locales",
    payslipLabel: "CONSUMO LOCALES EMPLEADO",
    kind: "capturado",
    field: "inHouseConsumption",
  },
  {
    // Cell `AG2` carries a line break inside it («CONTRIBUCION \nSOLIDARIA»). It is normalized to a
    // single line: a two-line row would break the fixed rhythm of the other twenty-five.
    code: "E-10",
    column: "AG",
    label: "Contribución solidaria",
    payslipLabel: "CONTRIBUCION SOLIDARIA",
    kind: "capturado",
    field: "solidarityContribution",
  },
  {
    code: "E-11",
    column: "AH",
    label: "Otros",
    payslipLabel: "OTROS",
    kind: "capturado",
    field: "otherDeductions",
  },
  {
    code: "E-12",
    column: "AI",
    label: "Descuento tiempo parcial",
    // «PACIAL», sic — that is how the book writes it, and it is the label the accountant checks
    // against.
    payslipLabel: "DESCUENTO TIEMPO PACIAL",
    kind: "capturado",
    field: "partTimeDeduction",
  },
  {
    code: "E-13",
    column: "AN",
    label: "Descuento permiso médico",
    payslipLabel: "Descuento PERMISO MEDICO",
    kind: "capturado",
    field: "medicalLeaveDeduction",
  },
];

/**
 * The QUANTITY an income concept captures, if it captures any.
 *
 * Only the three overtime classes: they are the only concepts of the catalogue that derive their
 * VALUE (`J`, `K`, `L` are computed by the engine) and at the same time capture their QUANTITY (`G`,
 * `H`, `I` are typed by whoever assembles the rol). That double nature is what decides which rows are
 * visible and which can be picked, so it has a name instead of being repeated as
 * `"hoursField" in concept`.
 */
export function capturedHoursField(concept: IncomeConcept): OvertimeHoursField | null {
  return concept.kind === "calculado" ? (concept.hoursField ?? null) : null;
}

/** Whether anything of this concept is TYPED — and therefore whether it can be added, picked in a
 *  dropdown and disappear when empty. The opposite is what the app derives on its own. */
function isChoosable(concept: IncomeConcept | DeductionConcept): boolean {
  return concept.kind === "capturado" || capturedHoursField(concept as IncomeConcept) !== null;
}

/**
 * WHICH CONCEPTS ARE VISIBLE — the rule that makes the rol's table readable.
 *
 * A concept is judged by WHAT IS TYPED into it: it appears if that is not zero, or if someone added
 * it by hand. What the app derives on its own is ALWAYS there, because its row is informative even at
 * zero (a reserve fund showing a dash says this employee does not receive it, and that has to be
 * readable).
 *
 * **Overtime is judged by the HOURS, not by its value.** They are `calculado` —the engine derives
 * `J`, `K` and `L`—, but what someone writes are the hours, and with no hours the value is zero by
 * construction: the row can only be a dash. Putting them in the «derived ⇒ always visible» branch put
 * three empty rows in the table of every employee with no overtime, which is exactly what this rule
 * exists to avoid. Mind the case that keeps them alive: hours trimmed by Gerencia
 * (`approvedOvertime: 0`, the book's `*0`) are worth zero and are STILL shown, because the hours were
 * worked and the accountant's payslip prints them (§10).
 *
 * Without this rule the table would list the book's 26 concepts, eighteen of them showing a dash, and
 * a normal rol —salary, décimos and contribution— would read as a half-filled form. The accountant's
 * payslip does not print them all either: it prints the ones that have something to say.
 *
 * `added` are the codes the user added with «Agregar ingreso»/«Agregar deducción». They are needed
 * apart from the amount because a freshly added concept is still worth zero: without remembering it,
 * the row would disappear the instant it was created.
 *
 * THE ORDER is two segments. What is visible by its own figure goes in the CATALOGUE's order —the
 * book's and the printed payslip's—, which is what allows reading two employees of the same month in
 * parallel. What someone has just ADDED goes at the end, in the order it was added, because the
 * button that creates it is at the foot of the table: slipping the new row into its catalogue place
 * makes it appear far from where it was clicked, sometimes out of sight. There is no contradiction
 * between the two halves because `added` only lives while the screen is open — on reload, a row with
 * a figure goes back to its place in the book on its own, so nothing STORED is reordered.
 */

/**
 * The two segments of the order. `typedOf` returns what is typed of each concept, or `null` when the
 * app derives it entirely (and then the row is always there).
 */
function orderedVisible<T extends { code: string }>(
  catalogue: readonly T[],
  typedOf: (concept: T) => number | null,
  added: ReadonlySet<string>,
): T[] {
  const byCode = new Map(catalogue.map((concept) => [concept.code, concept]));
  const own = catalogue.filter((concept) => {
    if (added.has(concept.code)) {
      return false; // it goes in the second segment, so it does not come out twice
    }
    const typed = typedOf(concept);
    return typed === null || typed !== 0;
  });
  // A `Set` keeps insertion order, which here IS the order of addition. The codes of the other table
  // —income and deductions share a single `added`— are not in this catalogue and drop out.
  const appended = [...added]
    .map((code) => byCode.get(code))
    .filter((concept): concept is T => concept !== undefined);
  return [...own, ...appended];
}

/** What is typed of an income item: its amount if it is captured, its hours if it is overtime, and
 *  `null` when the app derives it entirely. */
function typedIncome(concept: IncomeConcept, capture: PayrollMonthlyCapture): number | null {
  if (concept.kind === "capturado") {
    return capture[concept.field];
  }
  const hours = capturedHoursField(concept);
  return hours === null ? null : capture[hours];
}

export function visibleIncomeConcepts(
  capture: PayrollMonthlyCapture,
  added: ReadonlySet<string>,
): IncomeConcept[] {
  return orderedVisible(INCOME_CONCEPTS, (concept) => typedIncome(concept, capture), added);
}

export function visibleDeductionConcepts(
  capture: PayrollMonthlyCapture,
  added: ReadonlySet<string>,
): DeductionConcept[] {
  return orderedVisible(
    DEDUCTION_CONCEPTS,
    (concept) => (concept.kind === "capturado" ? capture.deductions[concept.field] : null),
    added,
  );
}

/**
 * The ones «Agregar ingreso» can offer: everything that is typed and is not visible yet. What the app
 * derives on its own never comes in — nobody adds a unified salary.
 *
 * Overtime DOES come in, and that is not a detail: they are the only rows that can hide themselves
 * away taking with them the only place their hours are typed. Without this door, hiding them when
 * empty would make them unreachable — with no row there is nowhere to write the hours, and with no
 * hours the row does not come back.
 */
export function addableIncomeConcepts(
  capture: PayrollMonthlyCapture,
  added: ReadonlySet<string>,
): IncomeConcept[] {
  const visible = new Set(visibleIncomeConcepts(capture, added).map((c) => c.code));
  return INCOME_CONCEPTS.filter((c) => isChoosable(c) && !visible.has(c.code));
}

/** The twin for deductions. There are no concepts with a quantity here, so it is only what is
 *  captured. */
export function addableDeductionConcepts(
  capture: PayrollMonthlyCapture,
  added: ReadonlySet<string>,
): DeductionConcept[] {
  const visible = new Set(visibleDeductionConcepts(capture, added).map((c) => c.code));
  return DEDUCTION_CONCEPTS.filter((c) => isChoosable(c) && !visible.has(c.code));
}

/**
 * What a CAPTURED row's dropdown offers: itself plus the free concepts.
 *
 * It is what turns «Agregar ingreso» into a real choice instead of an imposed row: the row is born
 * with a concept and it is changed right there. The concept itself heads the list because it is the
 * selected value — without it, the dropdown would start showing another one and it would look as
 * though the row had already changed by itself.
 *
 * The ones already in place are not offered: two rows cannot be the same concept, because both would
 * write the same field of the capture and the second would overwrite the first.
 */
export function swapOptionsFor<T extends IncomeConcept | DeductionConcept>(
  code: string,
  catalogue: readonly T[],
  capture: PayrollMonthlyCapture,
  added: ReadonlySet<string>,
): T[] {
  const isIncome = catalogue === (INCOME_CONCEPTS as readonly unknown[]);
  const visible = isIncome
    ? visibleIncomeConcepts(capture, added)
    : visibleDeductionConcepts(capture, added);
  const taken = new Set(visible.map((c) => c.code));

  const self = catalogue.find((c) => c.code === code && isChoosable(c));
  const free = catalogue.filter((c) => isChoosable(c) && !taken.has(c.code));
  return self ? [self, ...free] : free;
}

/**
 * What has to be written into the capture for an INCOME row to change concept, or `null` if the
 * change does not apply (either of the two is derived by the app on its own).
 *
 * The source is ALWAYS emptied —otherwise the figure would count twice— and what was typed is carried
 * to the new row **only when both speak the same unit**:
 *
 *   - two captured rows move the AMOUNT: whoever types 120 and realises it was «Comisión fija» and
 *     not «Viáticos» expects to correct the row, not to write it again;
 *   - two overtime rows move the HOURS, which is what is typed there: 5.5 hours misclassified at
 *     50 % are 5.5 hours at 100 %;
 *   - crossing families carries NOTHING, because 200 dollars of an advance are not 200 hours and any
 *     conversion would be invented. In practice nothing is lost: the dropdown only offers FREE
 *     concepts, and a row with a figure is already taken.
 */
export function incomeSwapPatch(
  origin: IncomeConcept,
  target: IncomeConcept,
  capture: PayrollMonthlyCapture,
): Partial<PayrollMonthlyCapture> | null {
  if (!isChoosable(origin) || !isChoosable(target)) {
    return null;
  }
  const originHours = capturedHoursField(origin);
  const targetHours = capturedHoursField(target);

  if (originHours !== null) {
    return targetHours !== null
      ? { [originHours]: 0, [targetHours]: capture[originHours] }
      : { [originHours]: 0 };
  }
  const originField = (origin as Extract<IncomeConcept, { kind: "capturado" }>).field;
  if (targetHours !== null) {
    return { [originField]: 0 };
  }
  const targetField = (target as Extract<IncomeConcept, { kind: "capturado" }>).field;
  return { [originField]: 0, [targetField]: capture[originField] };
}

/** The twin for DEDUCTIONS, which have no quantity: it always moves the amount, inside the nested
 *  `deductions` object. `null` when either of the two is the IESS contribution, which the engine
 *  derives. */
export function deductionSwapPatch(
  origin: DeductionConcept,
  target: DeductionConcept,
  capture: PayrollMonthlyCapture,
): Partial<PayrollMonthlyCapture> | null {
  if (origin.kind !== "capturado" || target.kind !== "capturado") {
    return null;
  }
  return {
    deductions: {
      ...capture.deductions,
      [origin.field]: 0,
      [target.field]: capture.deductions[origin.field],
    },
  };
}

/** An income concept's amount, whether it comes from the engine or from the capture. */
export function incomeAmount(
  concept: IncomeConcept,
  computed: PayrollEmployeeComputation,
  capture: PayrollMonthlyCapture,
): number {
  return concept.kind === "calculado" ? computed[concept.field] : capture[concept.field];
}

/** A deduction concept's amount, whether it comes from the engine or from the capture. */
export function deductionAmount(
  concept: DeductionConcept,
  computed: PayrollEmployeeComputation,
  capture: PayrollMonthlyCapture,
): number {
  return concept.kind === "calculado" ? computed.iessEmployee : capture.deductions[concept.field];
}
