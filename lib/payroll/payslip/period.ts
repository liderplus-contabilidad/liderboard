/**
 * A WHOLE PERÍODO'S PAYSLIPS: the stored nómina → one `PayslipDocument` per employee.
 *
 * It is `buildPayslipDocument` in a loop, and it exists as a function of its own because MORE THAN
 * ONE screen asks for it: the período's (`/payroll/[periodId]`) and the history's row, which
 * downloads the same .zip without opening the período. Written by hand in both, «this período's
 * payslips» would have two definitions capable of drifting apart —the order, the `Codigo:`, the
 * client's logo and letterhead— and nothing would give it away: the two files are opened separately
 * and each one looks correct.
 *
 * It receives the LINES and not an already computed rol, so a consumer does not need the engine to
 * ask for its paper. That the detail screen computes its own `rows` for the KPIs and the table opens
 * no crack: both routes go through `computeLinePayroll`, which is the module's only composition of
 * record + capture → engine, and the engine is deterministic.
 *
 * It is pure: it neither reads the database nor writes anything. Who brings the lines and who
 * downloads the file belongs to the layer above.
 */
import type { CompanyProfile } from "@/lib/company-profile";
import type { CostCenter } from "@/lib/cost-center";
import type { EntityLogo } from "@/lib/workspaces";
import { computeLinePayroll, emptyCapture } from "../employee-input";
import type { PayrollParameters } from "../engine/parameters";
import type { PayrollEmployeeLine, PayrollPeriod } from "../types";
import { buildPayslipDocument } from "./document";
import type { PayslipDocument } from "./types";

export function buildPeriodPayslips({
  period,
  lines,
  parameters,
  clientName,
  clientLogo,
  clientCompany,
  clientCostCenter,
}: {
  period: PayrollPeriod;
  /** The nómina in the order the table reads it: it is what numbers the `Codigo:`. */
  lines: readonly PayrollEmployeeLine[];
  parameters: PayrollParameters;
  clientName: string;
  clientLogo?: EntityLogo;
  clientCompany?: CompanyProfile;
  clientCostCenter?: CostCenter;
}): PayslipDocument[] {
  return lines.map((line, index) =>
    buildPayslipDocument({
      line,
      computed: computeLinePayroll(line, parameters),
      capture: line.capture ?? emptyCapture(),
      year: period.year,
      monthIndex: period.monthIndex,
      clientName,
      ...(clientLogo ? { clientLogo } : {}),
      ...(clientCompany ? { clientCompany } : {}),
      ...(clientCostCenter ? { clientCostCenter } : {}),
      // `Codigo:` is the POSITION in the nómina, 1…N, not the record's `id`: the book's column `A` is
      // a running counter that skips the area headers.
      position: index + 1,
    }),
  );
}
