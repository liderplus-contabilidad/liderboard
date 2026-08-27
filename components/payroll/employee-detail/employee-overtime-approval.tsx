"use client";

import { NumericInput } from "@/components/ui/numeric-input";
import { formatCurrency } from "@/lib/format";
import type { PayrollEmployeeComputation } from "@/lib/payroll/engine/types";
import type { PayrollMonthlyCapture } from "@/lib/payroll/types";

interface EmployeeOvertimeApprovalProps {
  approvedOvertime: PayrollMonthlyCapture["approvedOvertime"];
  computed: PayrollEmployeeComputation;
  onApprovedOvertimeChange: (value: number | null) => void;
  readOnly?: boolean;
}

/**
 * The only adjustment this month admits: how much of the overtime worked is recognised.
 *
 * The card is called «Horas extras» and not «Ajustes del mes» because it only carries one thing now —
 * the two décimo provision checkboxes moved to the employee record, which is where a choice of the
 * employee lives. With the title naming the subject, the field's label can stay «Importe aprobado»
 * without repeating it.
 *
 * **The field is an AMOUNT in dollars, not a number of hours**, and that is said by the `$` mark stuck
 * to the field before any text — the same convention as the cells of the concept table, where an `h`
 * marks hours and a `$` an amount. The hours are typed there; here what they add up to is trimmed.
 * Without that mark, «Importe aprobado de horas extras» with a placeholder «Todas» reads as a number
 * of hours, and the feminine plural footnote reinforced it.
 */
export function EmployeeOvertimeApproval({
  approvedOvertime,
  computed,
  onApprovedOvertimeChange,
  readOnly = false,
}: EmployeeOvertimeApprovalProps) {
  const worked = computed.overtimePay50 + computed.overtimePay100 + computed.overtimePay25;

  return (
    <div className="w-[380px] overflow-hidden rounded-[11px] border border-border">
      <div className="border-b border-border-soft bg-surface-muted px-5 py-2.5">
        <span className="text-[10px] font-bold uppercase tracking-[0.6px] text-faint">
          Horas extras
        </span>
      </div>

      <div className="px-5 py-3.5">
        <div className="flex items-center gap-3">
          <span className="min-w-0 flex-1 text-[12px] text-muted">Importe aprobado</span>
          <span className="flex w-[132px] shrink-0 items-center rounded-lg border border-chip-border bg-surface px-2.5 py-2 font-mono text-[12.5px] tabular-nums transition-colors focus-within:border-brand">
            <NumericInput
              value={approvedOvertime}
              onCommit={onApprovedOvertimeChange}
              nullable
              disabled={readOnly}
              ariaLabel="Importe aprobado de horas extras, en dólares"
              placeholder="Todo"
              className="text-[12.5px]"
            />
            <span className="ml-1.5 shrink-0 text-[11px] text-faint">$</span>
          </span>
        </div>
        <p className="mt-1.5 text-[11px] leading-relaxed text-faint">
          {worked === 0
            ? "En dólares, no en horas. Este mes no hay horas extras trabajadas."
            : `En dólares, no en horas. Se trabajaron ${formatCurrency(worked, { cents: true })}: en blanco se reconoce todo, 0 no reconoce nada.`}
        </p>
      </div>
    </div>
  );
}
