import { formatCurrency, formatPercent } from "@/lib/format";
import {
  PAYROLL_EMPLOYER_IESS_RATE,
  PAYROLL_PERSONAL_IESS_RATE,
  PAYROLL_RESERVE_FUND_RATE,
  PAYROLL_SBU,
} from "@/lib/payroll/constants";

/** Ver `lib/payroll/constants.ts`: son la lectura literal de las fórmulas del Excel del contador,
 *  no una convención de la app — de ahí que la tira sea de solo lectura. */
const PARAMETERS: readonly { label: string; value: string }[] = [
  { label: "SBU", value: formatCurrency(PAYROLL_SBU, { cents: true }) },
  { label: "Aporte personal IESS", value: formatPercent(PAYROLL_PERSONAL_IESS_RATE * 100, 2) },
  { label: "Aporte patronal", value: formatPercent(PAYROLL_EMPLOYER_IESS_RATE * 100, 2) },
  { label: "Fondo de reserva", value: formatPercent(PAYROLL_RESERVE_FUND_RATE * 100, 2) },
];

/** «Parámetros del período»: los cuatro valores fijos bajo los que se leen las cifras de la
 *  tabla — no un filtro, no una edición. */
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
