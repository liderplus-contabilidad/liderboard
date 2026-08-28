"use client";

import { Trash2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DiscardedRow } from "@/components/ui/discarded-row";
import { pluralize } from "@/lib/format";
import { periodLongLabel } from "@/lib/payroll/periods";
import type { PayrollPeriod } from "@/lib/payroll/types";

/**
 * Confirms deleting a período by COUNTING what it discards — the same shape
 * `DeletePayrollClientDialog` uses for a client: «su nómina» is exactly the phrase one confirms
 * without reading, and an irreversible action deserves the figure instead of the abstraction.
 */
export function DeletePeriodDialog({
  period,
  employeeCount,
  busy,
  onConfirm,
  onCancel,
}: {
  period: PayrollPeriod;
  employeeCount: number;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-ink/40 p-6">
      <div className="w-full max-w-[480px] rounded-[13px] border border-border bg-surface p-5 shadow-[0_24px_60px_rgba(15,23,42,0.24)]">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-[9px] bg-negative/10">
            <Trash2 size={17} className="text-negative" />
          </span>
          <div className="min-w-0">
            <h2 className="text-[15px] font-bold tracking-[-0.2px] text-ink">
              Eliminar {periodLongLabel(period.year, period.monthIndex)}
            </h2>
            <p className="mt-0.5 text-[12.5px] text-faint">Esta acción no se puede deshacer.</p>
          </div>
        </div>

        <div className="mt-4 overflow-hidden rounded-[9px] border border-border">
          <div className="border-b border-border bg-surface-muted px-3.5 py-2 text-[10.5px] font-semibold uppercase tracking-[0.5px] text-faint">
            Se descarta de este período
          </div>
          <ul className="divide-y divide-border-soft">
            <DiscardedRow icon={<Users size={15} />} label="Su nómina">
              {employeeCount > 0
                ? pluralize(employeeCount, "empleado")
                : "no tiene ningún empleado registrado"}
              .
            </DiscardedRow>
          </ul>
        </div>

        <div className="mt-5 flex items-center justify-end gap-2.5">
          <Button variant="secondary" size="sm" disabled={busy} onClick={onCancel}>
            Cancelar
          </Button>
          <Button variant="danger-solid" size="sm" disabled={busy} onClick={onConfirm}>
            Eliminar período
          </Button>
        </div>
      </div>
    </div>
  );
}
