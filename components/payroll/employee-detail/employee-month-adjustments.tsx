"use client";

import type { ReactNode } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { NumericInput } from "@/components/ui/numeric-input";
import { cn } from "@/lib/cn";
import { formatCurrency, formatCurrencyOrDash } from "@/lib/format";
import type { PayrollEmployeeComputation } from "@/lib/payroll/engine/types";
import type { PayrollMonthlyCapture } from "@/lib/payroll/types";

export type ProvisionFlag = "provisionsThirteenth" | "provisionsFourteenth";

interface EmployeeMonthAdjustmentsProps {
  approvedOvertime: PayrollMonthlyCapture["approvedOvertime"];
  provisionsThirteenth: boolean;
  provisionsFourteenth: boolean;
  computed: PayrollEmployeeComputation;
  onApprovedOvertimeChange: (value: number | null) => void;
  onProvisionChange: (flag: ProvisionFlag, checked: boolean) => void;
  readOnly?: boolean;
}

export function EmployeeMonthAdjustments({
  approvedOvertime,
  provisionsThirteenth,
  provisionsFourteenth,
  computed,
  onApprovedOvertimeChange,
  onProvisionChange,
  readOnly = false,
}: EmployeeMonthAdjustmentsProps) {
  const worked = computed.overtimePay50 + computed.overtimePay100 + computed.overtimePay25;

  return (
    <div className="w-[380px] overflow-hidden rounded-[11px] border border-border">
      <div className="border-b border-border-soft bg-surface-muted px-5 py-2.5">
        <span className="text-[10px] font-bold uppercase tracking-[0.6px] text-faint">
          Ajustes del mes
        </span>
      </div>

      <div className="px-5 py-3.5">
        <div className="flex items-center gap-3">
          <span className="min-w-0 flex-1 text-[12px] text-muted">
            Importe aprobado de horas extras
          </span>
          <span className="w-[132px] shrink-0 rounded-lg border border-chip-border bg-surface px-2.5 py-2 text-right font-mono text-[12.5px] tabular-nums transition-colors focus-within:border-brand">
            <NumericInput
              value={approvedOvertime}
              onCommit={onApprovedOvertimeChange}
              nullable
              disabled={readOnly}
              ariaLabel="Importe aprobado de horas extras"
              placeholder="Todas"
              className="text-[12.5px]"
            />
          </span>
        </div>
        <p className="mt-1.5 text-[11px] leading-relaxed text-faint">
          {worked === 0
            ? "Este mes no hay horas extras trabajadas. En blanco se reconocen todas."
            : `Trabajadas ${formatCurrency(worked, { cents: true })}. En blanco se reconocen todas; 0 no reconoce ninguna.`}
        </p>

        <div className="mt-3.5 border-t border-border-soft pt-3">
          <ProvisionRow
            label="Provisiona décimo tercero"
            checked={provisionsThirteenth}
            amount={computed.thirteenthProvision}
            disabled={readOnly}
            onChange={(checked) => onProvisionChange("provisionsThirteenth", checked)}
          />
          <ProvisionRow
            label="Provisiona décimo cuarto"
            checked={provisionsFourteenth}
            amount={computed.fourteenthProvision}
            disabled={readOnly}
            onChange={(checked) => onProvisionChange("provisionsFourteenth", checked)}
          />
          <p className="mt-2 text-[11px] leading-relaxed text-faint">
            Apagadas, los décimos solo se mensualizan en el rol; encendidas, se provisionan además y
            suman al costo total empresa.
          </p>
        </div>
      </div>
    </div>
  );
}

function ProvisionRow({
  label,
  checked,
  amount,
  disabled,
  onChange,
}: {
  label: string;
  checked: boolean;
  amount: number;
  disabled: boolean;
  onChange: (checked: boolean) => void;
}): ReactNode {
  return (
    <label className={cn("flex items-center gap-2.5 py-1", !disabled && "cursor-pointer")}>
      <Checkbox
        checked={checked}
        onChange={disabled ? undefined : onChange}
        size={16}
        ariaLabel={label}
      />
      <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink">{label}</span>
      <span className="shrink-0 font-mono text-[12.5px] tabular-nums text-muted">
        {formatCurrencyOrDash(amount)}
      </span>
    </label>
  );
}
