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
 * El único ajuste que este mes admite: cuánto de las horas extras trabajadas se reconoce.
 *
 * La tarjeta se llama «Horas extras» y no «Ajustes del mes» porque ya solo lleva una cosa — las
 * dos casillas de provisión de décimos se fueron a la ficha, que es donde vive una elección del
 * empleado. Con el título nombrando el asunto, el rótulo del campo puede quedarse en «Importe
 * aprobado» sin repetirlo.
 *
 * **El campo es un IMPORTE en dólares, no un número de horas**, y eso lo dice la marca `$` pegada
 * al campo antes que ningún texto — la misma convención que las celdas de la tabla de conceptos,
 * donde una `h` marca las horas y un `$` el importe. Las horas se teclean allí; aquí se recorta lo
 * que suman. Sin esa marca, «Importe aprobado de horas extras» con un placeholder «Todas» se lee
 * como una cantidad de horas, y el pie en femenino plural lo reforzaba.
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
