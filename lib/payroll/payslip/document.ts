/**
 * FROM AN EMPLOYEE'S RECORD TO THE PAYSLIP, without touching `pdf-lib`.
 *
 * It reproduces the accountant's book `INDIVIDUAL` sheet (`Print_Area = A1:P49`), which is the paper
 * the employee signs each month. Three decisions hold up the fidelity and it is worth keeping them
 * together, because all three are the opposite of what the detail SCREEN does:
 *
 * 1. **Only the rows WITH an amount are printed.** The paper used to be printed whole, all 26 rows
 *    with a `-` where there was nothing, because a fixed-position form is reviewed by looking for
 *    each concept where it always is. The firm asked for the opposite: that the payslip lists what
 *    was paid and deducted this month, and nothing more. It is not the SCREEN's rule, which is
 *    another one and remains another one: `visibleIncomeConcepts` hides what is TYPED at zero and
 *    always keeps what the app derives —that table is where capturing happens, and a row that goes
 *    away takes with it the place to write it—; here nothing is captured, so the AMOUNT is judged,
 *    whether it comes from the engine or from the capture.
 * 2. **The order is the book's COLUMN order**, not the catalogue's. `concepts.ts` groups the
 *    calculated ones at the top (a decision of the table, where they are the grey rows that are not
 *    edited) and that is why it puts the reserve fund seventh; the paper puts it twelfth, because its
 *    column `U` comes after `T`. No second list has to be declared: it is ordered by the `column`
 *    field the catalogue already carries.
 * 3. **The four UNLABELLED deduction rows of the Excel are not printed** (columns `AJ`–`AM`). They
 *    are always zero, `concepts.ts` excludes them on purpose (§11.4: with no name they do not enter
 *    the catalogue), and printing them would force this file to declare rows no other part of the app
 *    knows about.
 *
 * None of this is persisted: the payslip is assembled at download time from the record, what was
 * captured and what the engine derives. A stored copy would go stale as soon as someone corrected the
 * days worked, and the paper would say one thing and the screen another.
 */
import { MONTHS_FULL_ES } from "@/lib/date";
import { letterheadLines, type CompanyProfile } from "@/lib/company-profile";
import { costCenterHeading, letterheadLogos, type CostCenter } from "@/lib/cost-center";
import type { EntityLogo } from "@/lib/logos";
import {
  DEDUCTION_CONCEPTS,
  INCOME_CONCEPTS,
  type DeductionConcept,
  type IncomeConcept,
  deductionAmount,
  incomeAmount,
} from "../concepts";
import { sameToTheCentavo } from "../amounts";
import type { PayrollEmployeeComputation } from "../engine/types";
import { payslipLabelFor } from "../row-labels";
import type { PayrollEmployeeLine, PayrollMonthlyCapture } from "../types";
import { formatPayslipAmount, formatQuantity } from "./format";
import type { PayslipDocument, PayslipRow } from "./types";

/** The `Cantidad` column's mark that the footnote explains. */
export const NOT_CONTRIBUTORY_MARK = "(*)";

/**
 * Orders two Excel columns: first by length, then alphabetically. Without the length, a plain
 * alphabetical order would put `AA` before `Z` and the deductions block would come out backwards.
 */
export function compareExcelColumns(a: string, b: string): number {
  return a.length - b.length || a.localeCompare(b);
}

/** The catalogue's income items in the paper's order. */
export function payslipIncomeConcepts(): IncomeConcept[] {
  return [...INCOME_CONCEPTS].sort((a, b) => compareExcelColumns(a.column, b.column));
}

/** The catalogue's deductions in the paper's order. */
export function payslipDeductionConcepts(): DeductionConcept[] {
  return [...DEDUCTION_CONCEPTS].sort((a, b) => compareExcelColumns(a.column, b.column));
}

/**
 * The `Cantidad` column of an income row. Only five of the thirteen use it:
 * - the three overtime ones, with the hours WORKED — not the approved ones. Gerencia's trim
 *   (`approvedOvertime`) moves what ADDS UP, not what is shown, just as on screen;
 * - the reserve fund and the bonus, with the literal `(*)` the footnote explains.
 */
function incomeQuantity(concept: IncomeConcept, capture: PayrollMonthlyCapture): string | null {
  if (concept.notContributory) {
    return NOT_CONTRIBUTORY_MARK;
  }
  if (concept.kind === "calculado" && concept.hoursField) {
    return formatQuantity(capture[concept.hoursField]);
  }
  return null;
}

/** A number with no cell format, as Excel's `&` writes it when concatenating: `0`, `45.67`. It is
 *  rounded to cents so as not to drag the engine's floating-point noise. */
function plainNumber(value: number): string {
  return String(Math.round(value * 100) / 100);
}

/**
 * A concept's row, or NONE if it has no amount — rule 1 of the header, written in a single place for
 * both blocks.
 *
 * Zero is judged to the CENT and with `sameToTheCentavo`, which is the module's only definition of
 * «the same amount»: the engine does not round its totals and drags floating-point noise, so a
 * `1e-14` is not a figure to declare and its row has no reason to take up a line.
 */
function rowFor(
  concept: IncomeConcept | DeductionConcept,
  amount: number,
  quantity: string | null,
  capture: PayrollMonthlyCapture,
): PayslipRow[] {
  if (sameToTheCentavo(amount, 0)) {
    return [];
  }
  return [
    {
      code: concept.code,
      // The book's label, unless this employee gave this row one of their own. It is the reason for
      // `row-labels.ts`: `E-11` is the `AH OTROS` column and a payslip that prints the column's name
      // does not say what was deducted.
      label: payslipLabelFor(concept, capture),
      quantity,
      value: formatPayslipAmount(amount),
    },
  ];
}

/**
 * The BONUS rows this employee's capture declares, with the label they gave them.
 *
 * The `code` goes empty: the catalogue's `I-01`…`I-13` are positions of the book the accountant
 * recognises, and numbering these with the same grammar would claim they come from their sheet too.
 * The label is printed in CAPITALS, which is the convention of every `payslipLabel`.
 *
 * The NON-contributory ones carry the `(*)`, the same mark as `U` and `V`, because its footnote —«No
 * aporta IESS ni es Ingreso Gravado»— is literally what their class means.
 */
function extraIncomeRows(capture: PayrollMonthlyCapture): PayslipRow[] {
  return (capture.extras ?? []).flatMap((row) => {
    if (sameToTheCentavo(row.amount, 0)) {
      return [];
    }
    return [
      {
        code: "",
        label: row.label.toUpperCase(),
        quantity: row.kind === "noAportable" ? NOT_CONTRIBUTORY_MARK : null,
        value: formatPayslipAmount(row.amount),
      },
    ];
  });
}

/** The month as the payslip writes it: `MARZO 2026`. */
export function payslipMonthLabel(year: number, monthIndex: number): string {
  return `${MONTHS_FULL_ES[monthIndex].toUpperCase()} ${year}`;
}

export function buildPayslipDocument({
  line,
  computed,
  capture,
  year,
  monthIndex,
  clientName,
  clientLogo,
  clientCompany,
  clientCostCenter,
  position,
}: {
  line: PayrollEmployeeLine;
  computed: PayrollEmployeeComputation;
  capture: PayrollMonthlyCapture;
  year: number;
  monthIndex: number;
  /** The name the user gave the client. The razón social the accountant prints here goes BELOW, in
   *  `companyLines`: they are two different things —«Delicmar» and `DELICMAR S.A.S.`— and the paper
   *  writes both. */
  clientName: string;
  /** The client's logo, if they uploaded one. It heads the payslip next to the name. */
  clientLogo?: EntityLogo;
  /** The company data the client declared. Without it the header stays as it was. */
  clientCompany?: CompanyProfile;
  /** The declared cost center, if there is one: it contributes the second half of the label and the
   *  right-hand logo. Without it the payslip comes out exactly as it used to. */
  clientCostCenter?: CostCenter;
  /** The employee's position in the nómina, 1…N. It is what the book calls `Codigo:` — its column
   *  `A` is a running counter that skips the area headers, not a stable identifier. */
  position: number;
}): PayslipDocument {
  const incomes: PayslipRow[] = [
    ...payslipIncomeConcepts().flatMap((concept) =>
      rowFor(
        concept,
        incomeAmount(concept, computed, capture),
        incomeQuantity(concept, capture),
        capture,
      ),
    ),
    // The bonus rows go AFTER the catalogue and not interleaved: the paper's order is the book's
    // COLUMN order, and these have none — there is no place to put them that would mean anything.
    // Behind, besides, leaves the position of the thirteen rows the accountant knows untouched.
    ...extraIncomeRows(capture),
  ];

  const deductions: PayslipRow[] = payslipDeductionConcepts().flatMap((concept) =>
    rowFor(concept, deductionAmount(concept, computed, capture), null, capture),
  );

  const logos = letterheadLogos(clientLogo, clientCostCenter);

  return {
    company: costCenterHeading(clientName, clientCostCenter),
    ...(logos.left ? { logo: logos.left } : {}),
    ...(logos.right ? { rightLogo: logos.right } : {}),
    companyLines: letterheadLines(clientCompany),
    title: "ROL DE PAGOS",
    period: `MES: ${payslipMonthLabel(year, monthIndex)}`,
    codeLine: `Codigo: ${position}`,
    daysLine: `Dias Trabajados: ${line.days}`,
    // The book's `G7` is `"FR="&VLOOKUP(…,21,…)`, and column 21 of its range is `U`: the AMOUNT of
    // the reserve fund paid, not the record's `hasReserveFund` flag. It goes WITHOUT the rows'
    // accounting format —a zero comes out `FR=0`, not `FR=-`— because Excel's `&` converts the raw
    // number and skips the cell's format.
    reserveFundLine: `FR=${plainNumber(computed.reserveFundPaid)}`,
    employeeName: line.name,
    role: line.role,
    incomes,
    deductions,
    // The note only comes out if some mark is left on the sheet to explain: the two rows that carry
    // it are the ones that are zero most often, and a footnote clarifying a `(*)` that is not on the
    // paper sends the reader looking for something that does not exist.
    footnote: incomes.some((row) => row.quantity === NOT_CONTRIBUTORY_MARK)
      ? PAYSLIP_FOOTNOTE
      : null,
    totalIncome: formatPayslipAmount(computed.grossIncome),
    totalDeductions: formatPayslipAmount(computed.totalDeductions),
    netPay: formatPayslipAmount(computed.netPay),
    idCardLine: `C.C. ${line.idCard}`,
  };
}

/** The footnote that explains the `(*)`. Verbatim from `B43`. */
export const PAYSLIP_FOOTNOTE = "(*) No aporta IESS ni es Ingreso Gravado";

/** The declaration the employee accepts on signing. Verbatim from `B44`. */
export const PAYSLIP_DECLARATION =
  "Declaro y acepto que los valores de remuneraciones, horas extras y descuentos son correctos y " +
  "que recibo del valor que consta en LIQUIDO A RECIBIR a mi entera satisfacción.";

export const PAYSLIP_SIGNATURE_CAPTION = "Firma del Trabajador";
