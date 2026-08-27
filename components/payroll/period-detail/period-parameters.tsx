import { formatCurrency, formatPercent } from "@/lib/format";
import { DEFAULT_PAYROLL_PARAMETERS as PARAMS } from "@/lib/payroll/engine/parameters";

/**
 * The four parameters of §3, read from the SAME table the engine computes with. That the strip reads
 * them from there and not from a constant of its own is what stops the screen showing one SBU while
 * the engine uses another: there were two declarations of these figures and they would have drifted
 * apart the January the SBU rises by decree.
 *
 * Read-only because they are STATUTORY, not a preference of the app. The day each período stores its
 * own, this strip will read the período's and this line will be the only thing that changes.
 */
const PARAMETERS: readonly { label: string; value: string }[] = [
  { label: "SBU", value: formatCurrency(PARAMS.unifiedBasicSalary, { cents: true }) },
  { label: "Aporte personal IESS", value: formatPercent(PARAMS.iessEmployeeRate * 100, 2) },
  { label: "Aporte patronal", value: formatPercent(PARAMS.iessEmployerRate * 100, 2) },
  { label: "Fondo de reserva", value: formatPercent(PARAMS.reserveFundRate * 100, 2) },
];

/** «Parámetros del período»: the four fixed values under which the table's figures are read — not a
 *  filter, not an edit. */
export function PeriodParameters() {
  return (
    <div className="mb-4 rounded-[13px] border border-border bg-surface px-5 py-4">
      <p className="text-[10.5px] font-semibold uppercase tracking-[0.5px] text-faint">
        Parámetros del período
      </p>
      <div className="mt-2.5 grid grid-cols-4 gap-4">
        {PARAMETERS.map((parameter) => (
          <div key={parameter.label} className="min-w-0">
            <p className="truncate text-[11.5px] text-faint">{parameter.label}</p>
            <p className="mt-0.5 font-mono text-[14px] font-semibold tabular-nums text-ink">
              {parameter.value}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
