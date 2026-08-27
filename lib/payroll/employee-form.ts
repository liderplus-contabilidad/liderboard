/**
 * The employee creation form: its values, its validation and its translation into a record.
 *
 * It lives here and not inside the modal because it is the only part of the creation with rules that
 * can be wrong — what is required, what shape a cédula has, what range the days admit — and a rule
 * with no test is a rule nobody checks. The component keeps what really is its own: drawing the
 * controls and deciding WHEN to show the errors.
 *
 * `validateEmployeeForm` returns errors **per field** and not a boolean: the screen has to be able to
 * point at which one fails, and with a `false` it could only say «something is wrong».
 *
 * About the CÉDULA: the shape is required —ten digits— and **not** the check digit. That is
 * deliberate. The importer writes whatever the accountant's file says, without judging it, so a form
 * stricter than the importer would create employees the app allows loading by Excel but not adding by
 * hand; and a document the civil registry's algorithm rejects —a passport, an old cédula— would block
 * a real creation with nothing the person doing it could do. The shape catches the typo, which is the
 * frequent error; the check digit would also catch the legitimate employee.
 */
import { STANDARD_PAYROLL_AREAS } from "./areas";
import { DEFAULT_PAYROLL_PARAMETERS } from "./engine/parameters";
import { reserveFundFlags, reserveFundMode, type ReserveFundMode } from "./reserve-fund";
import type { ParsedPayrollEmployeeLine, PayrollEmployeeLine } from "./types";

/**
 * What the form holds. The figures are `number | null` and not text because `NumericInput` already
 * resolves the step from text to number (and it is tested): here VALUES are judged, not what someone
 * is halfway through typing. `null` is «the field is empty».
 */
export interface EmployeeFormValues {
  // The record
  name: string;
  idCard: string;
  role: string;
  area: string;
  baseSalary: number | null;
  days: number | null;
  contractType: "CT" | "TP";
  /** §7's three cases, already crossed — see `reserve-fund.ts`. */
  reserveFund: ReserveFundMode;
  /** ISO `YYYY-MM-DD`, or `""` if not declared. */
  hireDate: string;
  sectorCode: string;

  /**
   * `AS`, `AT` · whether the décimos are provisioned. They belong to the RECORD (see
   * `PayrollEmployeeLine`), and that is why they are here and not among what is captured of the
   * month.
   *
   * The book's `M` —the approved overtime amount— is NOT in this form, and that is deliberate: it
   * belongs to the MONTH, Gerencia approves it according to occupancy, and this form does not capture
   * the hours that amount trims. It is typed on the employee's screen, next to them.
   */
  provisionsThirteenth: boolean;
  provisionsFourteenth: boolean;
}

export type EmployeeFormErrors = Partial<Record<keyof EmployeeFormValues, string>>;

/** What needs to be known about the already registered nómina to detect a duplicate creation. */
export interface EmployeeFormContext {
  existing?: readonly { id?: string; name: string; idCard: string }[];
  /**
   * The employee being EDITED, when there is one. Without them, opening a record and saving it
   * without touching the cédula would accuse it of being a duplicate of itself, and the form could
   * not be saved without changing it — which is exactly the opposite of what is needed when
   * correcting the job title.
   */
  selfId?: string;
}

const MAX_DAYS = 31;
const ID_CARD_DIGITS = 10;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * A freshly opened form. The two considered defaults:
 *
 *   - **30 days**, the same one `copyRoster` sets when copying a nómina — a full month is the normal
 *     case and the days are only corrected when there was a mid-month start, a departure or a leave.
 *   - **The current SBU** as the base salary, read from the período's parameters and not written by
 *     hand, so the January the SBU rises does not leave last year's number here.
 */
export function emptyEmployeeForm(): EmployeeFormValues {
  return {
    name: "",
    idCard: "",
    role: "",
    area: STANDARD_PAYROLL_AREAS[0],
    baseSalary: DEFAULT_PAYROLL_PARAMETERS.unifiedBasicSalary,
    days: DEFAULT_PAYROLL_PARAMETERS.monthlyDays,
    contractType: "CT",
    reserveFund: "sin-derecho",
    hireDate: "",
    sectorCode: "",
    provisionsThirteenth: false,
    provisionsFourteenth: false,
  };
}

/** An ISO date that also EXISTS: `2026-02-30` passes the pattern and is not a day of the calendar. */
function isRealIsoDate(value: string): boolean {
  if (!ISO_DATE.test(value)) {
    return false;
  }
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

/**
 * Which fields of the form are wrong, and why. A correct form returns `{}`.
 *
 * `context.existing` is the nómina the período already has: with it, adding the same person twice is
 * rejected while NAMING whoever already occupies it. Without that check the two rows add up
 * separately in the período's KPIs and nothing on screen gives it away, because a name typed twice
 * rarely comes out identical.
 */
export function validateEmployeeForm(
  values: EmployeeFormValues,
  context: EmployeeFormContext = {},
): EmployeeFormErrors {
  const errors: EmployeeFormErrors = {};

  if (values.name.trim() === "") {
    errors.name = "El nombre es obligatorio.";
  }

  if (values.role.trim() === "") {
    errors.role = "El cargo es obligatorio.";
  }

  const idCard = values.idCard.trim();
  if (idCard === "") {
    errors.idCard = "La cédula es obligatoria.";
  } else if (!new RegExp(`^\\d{${ID_CARD_DIGITS}}$`).test(idCard)) {
    errors.idCard = `La cédula son ${ID_CARD_DIGITS} dígitos.`;
  } else {
    // The `selfId === undefined` CANNOT be left out: without it, a creation (which does not bring
    // one) against a nómina whose entries do not bring an `id` either would compare
    // `undefined !== undefined`, silently skipping ALL duplicates.
    const clash = context.existing?.find(
      (line) =>
        line.idCard.trim() === idCard &&
        (context.selfId === undefined || line.id !== context.selfId),
    );
    if (clash) {
      errors.idCard = `${clash.name} ya está registrado con esta cédula en el período.`;
    }
  }

  if (values.baseSalary === null) {
    errors.baseSalary = "El sueldo base es obligatorio.";
  } else if (!Number.isFinite(values.baseSalary) || values.baseSalary <= 0) {
    // With a base salary of zero the employee's whole rol falls to zero —unified, décimo tercero,
    // IESS contribution— and the row is left adding up nothing: it is a capture error, not a case of
    // the business.
    errors.baseSalary = "El sueldo base tiene que ser mayor que cero.";
  }

  if (values.days === null) {
    errors.days = "Los días trabajados son obligatorios.";
  } else if (!Number.isInteger(values.days)) {
    errors.days = "Los días trabajados van en días enteros.";
  } else if (values.days < 0 || values.days > MAX_DAYS) {
    errors.days = `Los días trabajados van de 0 a ${MAX_DAYS}.`;
  }

  if (values.hireDate !== "" && !isRealIsoDate(values.hireDate)) {
    errors.hireDate = "La fecha de ingreso no es una fecha válida.";
  }

  return errors;
}

/**
 * The already validated form, as the record `db.ts` writes. It carries no `id` and no `periodId`: the
 * door stamps them, just as with `copyRoster` and with the importer.
 *
 * **`capture` is ALWAYS left absent**, and that is right: the only thing this form had of the month
 * was the approved overtime amount, and it no longer asks for it. An employee added by hand is
 * therefore born exactly like one copied from the previous month — with no capture, not with a
 * capture at zeros, which is not the same: the second would make the screen paint a month nobody
 * declared.
 *
 * With no capture there is no declared `PAGADO`, so the employee is born «unreconciled» — which is
 * exactly what they are. As soon as someone types what was transferred, it reconciles against the rol
 * the engine computes, with no file in between.
 */
export function toEmployeeLine(values: EmployeeFormValues): ParsedPayrollEmployeeLine {
  return {
    name: values.name.trim(),
    role: values.role.trim(),
    area: values.area,
    baseSalary: values.baseSalary ?? 0,
    contractType: values.contractType,
    idCard: values.idCard.trim(),
    hireDate: values.hireDate === "" ? null : values.hireDate,
    sectorCode: values.sectorCode.trim(),
    ...reserveFundFlags(values.reserveFund),
    provisionsThirteenth: values.provisionsThirteenth,
    provisionsFourteenth: values.provisionsFourteenth,
    days: values.days ?? 0,
  };
}

/**
 * The stored record, back into the form: what seeds EDIT mode.
 *
 * `days` and `baseSalary` are seeded even though the edit does not draw them, so ONE single type of
 * values and ONE single validation serve both modes — two different forms could drift apart in what
 * they require. `toEmployeePatch` is what decides they are not written.
 */
export function employeeFormFrom(line: PayrollEmployeeLine): EmployeeFormValues {
  return {
    name: line.name,
    idCard: line.idCard,
    role: line.role,
    area: line.area,
    baseSalary: line.baseSalary,
    days: line.days,
    contractType: line.contractType,
    reserveFund: reserveFundMode(line),
    hireDate: line.hireDate ?? "",
    sectorCode: line.sectorCode,
    provisionsThirteenth: line.provisionsThirteenth,
    provisionsFourteenth: line.provisionsFourteenth,
  };
}

/** What an edit of the record writes. It is a `Partial` because of the reserve fund — see below. */
export type EmployeePatch = Partial<
  Pick<
    PayrollEmployeeLine,
    | "name"
    | "role"
    | "area"
    | "contractType"
    | "idCard"
    | "hireDate"
    | "sectorCode"
    | "hasReserveFund"
    | "accumulatesReserveFund"
    | "provisionsThirteenth"
    | "provisionsFourteenth"
  >
>;

/**
 * The already validated form, as the patch an edit writes.
 *
 * **It carries neither `days` nor `baseSalary`**, even though the form has them: both are edited
 * inline on the month's screen, where the net pay can be watched moving as they are corrected, and a
 * second door to the same fields would be one more place to say something different. In the CREATION
 * they do travel, because there is no previous record to start from.
 *
 * **The two reserve-fund flags are only written if the MODE changed**, and that is not an
 * optimization: `reserve-fund.ts`'s translation is asymmetric on purpose —`(FR=N, AC FR=S)` reads as
 * «not entitled» and would come back as `(N, N)`— and MORALES MENA SILVIA JIMENA brings exactly that
 * combination in the real March 2026 rol. Always writing them would correct, on saving any other
 * field, a file nobody asked to have corrected: the figures would not move (with `FR=N` both branches
 * give zero) but the downloaded Excel would stop matching the one that came in.
 */
export function toEmployeePatch(
  values: EmployeeFormValues,
  original: Pick<PayrollEmployeeLine, "hasReserveFund" | "accumulatesReserveFund">,
): EmployeePatch {
  return {
    name: values.name.trim(),
    role: values.role.trim(),
    area: values.area,
    contractType: values.contractType,
    idCard: values.idCard.trim(),
    hireDate: values.hireDate === "" ? null : values.hireDate,
    sectorCode: values.sectorCode.trim(),
    ...(reserveFundMode(original) === values.reserveFund
      ? {}
      : reserveFundFlags(values.reserveFund)),
    provisionsThirteenth: values.provisionsThirteenth,
    provisionsFourteenth: values.provisionsFourteenth,
  };
}
