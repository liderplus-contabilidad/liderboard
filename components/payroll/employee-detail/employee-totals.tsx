import { cn } from "@/lib/cn";
import { formatCurrency } from "@/lib/format";
import type { PayrollEmployeeComputation } from "@/lib/payroll/engine/types";

interface EmployeeTotalsProps {
  /** The four figures are READ from here, never recomposed: `netPay` is not `grossIncome −
   *  totalDeductions` computed on screen, it is the `AP` column the engine already derived. A second
   *  subtraction here could drift from its own by a cent and nobody would notice. */
  computed: PayrollEmployeeComputation;
}

/**
 * The close of the rol, right-aligned under the two tables: what comes in, what goes out, what the
 * employee receives and what it costs the company.
 *
 * The net pay goes in a large size and in `brand` because it is the only figure on the screen anyone
 * transfers: the other three are the path to it. The total employer cost sits below and muted — it is
 * the employer's reading, not the rol's, and it competes with the net pay if it weighs the same.
 *
 * The deductions total is NOT painted red: `negative` is the SIGN of a value and these figures are all
 * positive. What is subtracted is said by the label, not by the colour.
 *
 * It carries no fill and no margin of its own: it lives INSIDE the rol's single card, and a white box
 * over another white box only adds a border. The radius is that of the identity cards —the other boxes
 * nested in that same card—, not that of a standalone card.
 */
export function EmployeeTotals({ computed }: EmployeeTotalsProps) {
  return (
    <div className="ml-auto w-[360px] overflow-hidden rounded-[11px] border border-border">
      <TotalLine label="Total ingresos" value={computed.grossIncome} />
      <TotalLine label="Total egresos" value={computed.totalDeductions} />

      <div className="flex items-center justify-between gap-4 border-y border-border bg-surface-muted px-5 py-3.5">
        <span className="text-[11.5px] font-semibold uppercase tracking-[0.5px] text-ink">
          Líquido a recibir
        </span>
        <span className="truncate font-mono text-[24px] font-bold tabular-nums text-brand">
          {formatCurrency(computed.netPay, { cents: true })}
        </span>
      </div>

      <TotalLine label="Costo total empresa" value={computed.employerCost} muted />
    </div>
  );
}

function TotalLine({ label, value, muted }: { label: string; value: number; muted?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 px-5 py-2.5">
      <span
        className={cn(
          "truncate text-[11.5px] font-semibold uppercase tracking-[0.5px]",
          muted ? "text-faint" : "text-muted",
        )}
      >
        {label}
      </span>
      <span
        className={cn(
          "truncate font-mono text-[14px] font-semibold tabular-nums",
          muted ? "text-muted" : "text-ink",
        )}
      >
        {formatCurrency(value, { cents: true })}
      </span>
    </div>
  );
}
