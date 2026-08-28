import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/cn";
import {
  RECONCILIATION_BADGE,
  type EmployeeReconciliationStatus,
} from "@/lib/payroll/period-detail";

/**
 * The same map `period-detail/employee-row.tsx` declares for the período's table. It is duplicated
 * because that one does not export it and its folder is outside this round: as soon as it can be
 * touched, this map's place is `lib/payroll/period-detail.ts`, next to
 * `employeeReconciliationStatus` — two labels for the same state on two screens is exactly the kind
 * of discrepancy no test of figures detects.
 */
interface EmployeeDetailCardProps {
  /** The EMPLOYEE's reconciliation status (net against paid), not the período's. */
  status: EmployeeReconciliationStatus;
  /** The employee's ordinal within the nómina — the printed payslip's «No.». */
  number: number;
  children: ReactNode;
}

/**
 * The single card that holds an employee's WHOLE rol: identity cards, período fields, the two
 * concept tables and the totals.
 *
 * It is one box and not four because what is inside is ONE document —the payslip the employee signs—
 * and splitting it into loose cards reads as four reports that happen to talk about the same person.
 * The header declares whose the paper is: the reconciliation badge on the left and its order number
 * on the right, just like the printed payslip.
 */
export function EmployeeDetailCard({ status, number, children }: EmployeeDetailCardProps) {
  const badge = RECONCILIATION_BADGE[status];

  return (
    <div className="overflow-hidden rounded-[13px] border border-border bg-surface">
      <div className="flex items-center gap-3 border-b border-border-soft px-5 py-3.5">
        <Badge variant={badge.variant}>{badge.label}</Badge>
        <span className="ml-auto font-mono text-[12.5px] font-semibold tabular-nums text-muted">
          No. {number}
        </span>
      </div>

      {children}
    </div>
  );
}

/** The padding of one section of the card — 20 px at the sides and below. It is exported so whoever
 *  composes the screen need not guess it or repeat it: inside a single card, the margin between
 *  blocks is the card's responsibility, not each block's. */
export function EmployeeDetailSection({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cn("px-5 pb-5", className)}>{children}</div>;
}
