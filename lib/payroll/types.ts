/**
 * Rol de Pagos domain types: PERÍODOS, each EMPLOYEE's record (`PayrollEmployeeLine`) and what is
 * CAPTURED of their month (`PayrollMonthlyCapture`). There is not a single figure of the rol here:
 * the twenty columns are derived by the engine (`lib/payroll/engine/`) from the record and the
 * capture, and none of that is persisted. `PayrollPeriod` does not store totals either: the
 * período's (`lib/payroll/period-detail.ts`) and its nómina's count (`PayrollRosterSummary`, below)
 * are always DERIVED from `PayrollEmployeeLine[]`, never persisted next to it — a total stored
 * separately could go stale and then the KPI card would say one thing and the table another.
 *
 * `ParsedPayrollPeriod` mirrors `ParsedDataset` in `lib/profit-loss/types.ts`: what a future parse
 * step would produce, with no owner yet — `db.ts` is what stamps the `clientId` at the door.
 */

import type { CompanyProfile } from "@/lib/company-profile";
import type { CostCenter } from "@/lib/cost-center";
import type { EntityLogo } from "@/lib/workspaces";
import type { CapturedDeductions } from "./engine/types";

/** The Rol de Pagos client: a name chosen by the user. The same shape as `NamedEntity` of
 *  `@/lib/workspaces`, so the generic name rules (validation, order, search) apply with no wrapper of
 *  its own — this module has no identity to compare, unlike PyG and Ocupaciones. */
export interface PayrollClient {
  id: string;
  name: string;
  /** The logo the user uploaded, if they uploaded one — the one that heads their payslip in PDF.
   *  Optional and NOT indexed, so it cost no Dexie migration. */
  logo?: EntityLogo;
  /**
   * What the firm's paper prints under the logo: razón social, location and phone numbers. It is
   * OPTIONAL in the type even though the dialog requires its six fields, because the clients created
   * before it existed do not have it: a type that declared it mandatory would assert something false
   * about what is in the database and would force every read to lie. Being mandatory is a rule of the
   * CREATION and lives in the form, not in the datum.
   *
   * Not indexed, like the logo, so it cost no new Dexie version either.
   */
  company?: CompanyProfile;
  /**
   * The COST CENTER this client's paper belongs to: a name more specific than its own and —if the
   * user uploaded one— its own logo. Optional, declared when creating the client, and just ONE: it is
   * not PyG's or Ocupaciones' structure of centers, where a center comes out of the data and there
   * are several (see `lib/cost-center.ts`).
   *
   * Its effect is entirely the PAPER's: the header's label becomes «Client · Center»
   * (`costCenterHeading`) and its logo closes the letterhead on the right, where PyG and Ocupaciones
   * put each sheet's center (`letterheadLogos`). Neither the engine, nor the journal entry, nor a
   * single figure looks at it.
   *
   * Not indexed, like the logo and the profile, so it cost no new Dexie version either.
   */
  costCenter?: CostCenter;
}

/** The only período type for now; the type leaves room for "décimos" and "liquidaciones" later on. */
export type PayrollPeriodKind = "ordinario";

/**
 * A período's number of employees and areas — ALWAYS derived from its stored nómina
 * (`PayrollEmployeeLine[]`), never persisted next to it: a count stored separately could go stale and
 * then the table would say one thing and the data another.
 */
export interface PayrollRosterSummary {
  employees: number;
  areas: number;
}

/**
 * The two classes of an extra income concept, and the only thing about it the COMPUTATION looks at.
 *
 * `aportable` behaves exactly like `R` viáticos and `S`/`T` commissions: it enters the five partial
 * bases and the total. `noAportable` behaves like `V` bonus and `U` reserve fund: it only reaches the
 * total. The label is free precisely because it decides nothing.
 */
export type PayrollExtraConceptKind = "aportable" | "noAportable";

/**
 * A bonus row THIS employee's capture declares, on top of the book's thirteen income items.
 *
 * It exists because each company's rol names its own: `MOVILIZACION NO APORTABLE` and `ALIMENTACION
 * NO APORTABLE` in DELICMAR's book, others in the next one. A closed catalogue cannot grow at that
 * rate without touching the engine, the journal entry and the payslip every time.
 *
 * **The label and the amount travel TOGETHER**, and that is the difference from the previous shape,
 * where the declaration lived on the período and the amount on the record: that way there can be no
 * orphan amount whose concept nobody declares any more, and no two definitions of what a row is
 * called. The argument that held up the other one —a column belongs to the whole nómina— collapses as
 * soon as the book's own `AH OTROS` wildcard means different things in different employees.
 *
 * The `id` is stable and independent of the label within that capture: renaming does not move the
 * amount, which is the whole reason the `id` exists on top of the name.
 */
export interface PayrollExtraRow {
  id: string;
  /** As that company's rol writes it, verbatim: `MOVILIZACION NO APORTABLE`. */
  label: string;
  kind: PayrollExtraConceptKind;
  amount: number;
}

export interface PayrollPeriod {
  id: string;
  clientId: string;
  year: number;
  /** 0–11, like the rest of the app. */
  monthIndex: number;
  kind: PayrollPeriodKind;
}

/** What the parse layer would produce, with no owner yet: `db.ts` stamps the `clientId`. */
export type ParsedPayrollPeriod = Omit<PayrollPeriod, "clientId">;

/**
 * The employee's RECORD: what is stable month to month, and therefore what a nómina copy drags along
 * (`lib/payroll/roster.ts`'s `copyRoster`). Overtime, commissions, bonuses, advances, deductions and
 * everything derived (unified salary, décimos, IESS contribution…) belong to the MONTH — they are
 * captured or recomputed each time — and that is why they have no field here.
 */
/**
 * What is CAPTURED of an employee's month, beyond their record: everything the engine
 * (`lib/payroll/engine/`) needs to derive the rol's 20 columns and that is not stable month to month.
 * The amounts go in the book's units; the hour quantities, in hours.
 *
 * It is what `copyRoster` does NOT drag along when copying the previous month's nómina: an advance or
 * some overtime from March does not belong to April.
 */
export interface PayrollMonthlyCapture {
  /** `G`, `H`, `I` · overtime hour quantities by class. */
  overtimeHours50: number;
  overtimeHours100: number;
  overtimeHours25: number;
  /** `M` · the AMOUNT of overtime that is recognised, typed. `null` = everything worked, `0` =
   *  nothing (the book's `*0`). It is decided by Gerencia and by agreements with each employee, so it
   *  is neither computed nor has a default — see §6 and §11.1 of the formulas document. */
  approvedOvertime: number | null;
  /** `P`…`T`, `V` · the month's other payments, already computed outside the app. */
  vacationPay: number;
  privateInsurance: number;
  allowances: number;
  fixedCommission: number;
  /** `T` · an already computed amount. The 20 % the firm names is applied OUTSIDE; nothing is
   *  recomputed here. */
  variableCommission: number;
  bonus: number;
  /**
   * The BONUS rows this employee declares this month, in the order they were declared.
   *
   * Each carries its label, its class and its amount: there is no declaration in one place and amount
   * in another, so an orphan amount cannot exist. Removing the row takes the amount with it.
   *
   * ABSENT in every capture that declares none, which reads as «no bonuses».
   */
  extras?: PayrollExtraRow[];
  /**
   * The OWN LABEL this employee gave a catalogue row, by concept code (`"E-11"` → `"Uniformes"`).
   *
   * It exists because `E-11 OTROS` is a wildcard: it is the book's `AH` column and it means different
   * things in different employees, so the payslip each of them signs has to be able to say
   * `UNIFORMES` instead of the column's name. Every row whose AMOUNT is typed admits it; the
   * `calculado` ones do not, because their label is a statutory rate and not a name.
   *
   * It lives in the capture and not in the record because a label accompanies an amount, and amounts
   * belong to the MONTH. ABSENT reads as «every row is called what the book calls it».
   */
  labels?: Record<string, string>;
  /** `Y`…`AN` · the twelve named deductions. The IESS contribution (`X`) is not here: the engine
   *  derives it. */
  deductions: CapturedDeductions;
  /**
   * `BZ` · PAGADO. `null` while nobody declares it — and that is NOT zero: without it the employee is
   * neither reconciled nor in difference.
   *
   * It lives in the capture because it is TYPED: with no Excel, whoever assembles the rol writes what
   * was transferred. When the month comes from a file, the upload writes its `BZ` here and a later
   * correction overrides it — which is what is wanted, because whoever corrects knows more than the
   * file it came from.
   */
  paid: number | null;
}

export interface PayrollEmployeeLine {
  id: string;
  periodId: string;
  name: string; // GENERAL sheet, column B
  role: string; // C · cargo
  area: string; // the rol's block: ADMINISTRACION, HOSPEDAJE, COCINA, RESTAURANTE, VENTAS
  baseSalary: number; // D · sueldo base
  contractType: "CT" | "TP"; // BB · full / part time. It halves the décimo IV.
  idCard: string; // BD · cédula
  hireDate: string | null; // BC · hire date, ISO
  sectorCode: string; // BF · sector code
  /** `BA` · FR — is there an entitlement to the reserve fund? It belongs to the record: it changes
   *  with seniority, not with the month. */
  hasReserveFund: boolean;
  /** `AZ` · AC FR — is it accrued at the IESS instead of received monthly? Also from the record:
   *  it is a choice of the employee, not of the month. */
  accumulatesReserveFund: boolean;
  /**
   * `AS`, `AT` · whether the décimos are provisioned.
   *
   * They are in the RECORD for the same reason as the two above, and it is not an analogy: taking the
   * décimos monthly or accruing them is a choice of the EMPLOYEE —the SUT's—, stable month to month.
   * Living in the capture they did not survive `copyRoster`, so they had to be marked again every
   * month employee by employee, and forgetting one month stopped provisioning with nothing saying so.
   *
   * Switched off throughout the real file, because the décimos are already taken monthly in `N` and
   * `O` and provisioning them again would count them twice. That they are here does not make them any
   * less of the month for the engine: each período stores its own record, so the importer keeps
   * deducing them from the file month by month.
   */
  provisionsThirteenth: boolean;
  provisionsFourteenth: boolean;
  /** E · days paid in the month. It belongs to the MONTH, not to the record, but it has a natural
   *  default: it is copied as 30 and corrected on capture (a mid-month start, a departure, a leave). */
  days: number;
  /** What was captured of the month. ABSENT while nobody captures anything, and the engine then reads
   *  it as an EMPTY capture: unlike PyG, here the record DECLARES the salary and what is not captured
   *  is really worth zero. See `toEngineInput`. */
  capture?: PayrollMonthlyCapture;
}

/** A record with no owner yet: what `copyRoster` produces, before `db.ts` stamps it with an `id` and
 *  a `periodId` on writing it — the same pattern as `ParsedPayrollPeriod`. */
export type ParsedPayrollEmployeeLine = Omit<PayrollEmployeeLine, "id" | "periodId">;
