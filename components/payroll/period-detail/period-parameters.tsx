import { formatCurrency, formatPercent } from "@/lib/format";
import { DEFAULT_PAYROLL_PARAMETERS as PARAMS } from "@/lib/payroll/engine/parameters";

/**
 * Los cuatro parámetros de §3, leídos de la MISMA tabla con la que el motor calcula. Que la tira
 * los lea de ahí y no de una constante propia es lo que impide que la pantalla enseñe un SBU y el
 * motor use otro: había dos declaraciones de estas cifras y se habrían separado el enero en que el
 * SBU suba por decreto.
 *
 * De solo lectura porque son de LEY, no una preferencia de la app. El día en que cada período
 * guarde los suyos, esta tira leerá los del período y esta línea será lo único que cambie.
 */
const PARAMETERS: readonly { label: string; value: string }[] = [
  { label: "SBU", value: formatCurrency(PARAMS.unifiedBasicSalary, { cents: true }) },
  { label: "Aporte personal IESS", value: formatPercent(PARAMS.iessEmployeeRate * 100, 2) },
  { label: "Aporte patronal", value: formatPercent(PARAMS.iessEmployerRate * 100, 2) },
  { label: "Fondo de reserva", value: formatPercent(PARAMS.reserveFundRate * 100, 2) },
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
