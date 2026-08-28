import type { PayrollEmployeeLine } from "@/lib/payroll/types";

interface EmployeeIdentityCardsProps {
  /** The name the user gave the client — NOT the razón social of the file, which this module never
   *  compares against anything (the same rule as PyG and Ocupaciones).
   *
   *  The COMPANY DATA does not go here, and that is deliberate: it was tried —razón social, location
   *  and phone numbers under the name— and this card went from four lines to eight to repeat
   *  something that is not used on screen. The letterhead exists for the paper, so it lives where it
   *  prints: the payslip in PDF and the período's Excel. */
  clientName: string;
  /** The employee's cost center. `null` while the record does not declare it: it is not «GENERAL», it
   *  is «there is none». */
  costCenter: string | null;
  employee: PayrollEmployeeLine;
}

/**
 * The rol's two identity cards: whose nómina it is and whose salary it is. They go together and side
 * by side because the accountant's payslip prints them that way — a rol is read by identifying the
 * two parties before any figure.
 *
 * The data goes in RUNNING TEXT with its prefix inside («C.C. 1714097084»), not in label/value pairs:
 * they are three lines of a card, not a two-column table, and a micro-uppercase label over each
 * datum would weigh more than the datum.
 *
 * The ÁREA is painted on the employer's side and not the employee's: it is the block of the rol
 * (ADMINISTRACION, HOSPEDAJE, COCINA…) under which the company groups the cost, and what makes it
 * readable is reading it next to the cost center.
 */
export function EmployeeIdentityCards({
  clientName,
  costCenter,
  employee,
}: EmployeeIdentityCardsProps) {
  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(320px,1fr))] gap-4 p-5">
      <div className="rounded-[11px] border border-border px-[18px] py-4">
        <p className="truncate text-[14px] font-bold text-brand">{clientName}</p>
        <div className="mt-1.5 text-[12px] leading-[1.7] text-muted">
          <p>Empleador · nómina mensual</p>
          <p className="truncate">Área: {employee.area}</p>
          <p className="truncate">Centro de costo: {costCenter ? costCenter : "—"}</p>
        </div>
      </div>

      {/* The avatar goes on the RIGHT: on this card the first thing read is the name, and an initial
          in front of it displaces it without adding anything the name does not already say. */}
      <div className="flex items-start gap-3.5 rounded-[11px] border border-border px-[18px] py-4">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] font-bold text-brand">{employee.name}</p>
          <div className="mt-1.5 text-[12px] leading-[1.7] text-muted">
            <p className="truncate">C.C. {employee.idCard}</p>
            <p className="truncate">{employee.role}</p>
            <p className="truncate">Cód. sectorial {employee.sectorCode}</p>
          </div>
        </div>
        <InitialAvatar name={employee.name} />
      </div>
    </div>
  );
}

/** The employee's initial. An empty name should never arrive, but if it does a box with «?» is worth
 *  more than a broken box. */
function InitialAvatar({ name }: { name: string }) {
  const initial = name.trim().charAt(0).toUpperCase() || "?";

  return (
    <span
      aria-hidden
      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-chip text-[16px] font-bold text-brand"
    >
      {initial}
    </span>
  );
}
