import { cn } from "@/lib/cn";
import { formatCurrency } from "@/lib/format";
import type { PayrollEmployeeComputation } from "@/lib/payroll/engine/types";

interface EmployeeTotalsProps {
  /** Las cuatro cifras se LEEN de aquí, nunca se recomponen: `netPay` no es `grossIncome −
   *  totalDeductions` calculado en pantalla, es la columna `AP` que el motor ya derivó. Una segunda
   *  resta aquí podría separarse de la suya al centavo y nadie lo notaría. */
  computed: PayrollEmployeeComputation;
}

/**
 * El cierre del rol, alineado a la derecha bajo las dos tablas: lo que entra, lo que sale, lo que
 * el empleado recibe y lo que le cuesta a la empresa.
 *
 * El líquido va en cuerpo grande y en `brand` porque es la única cifra de la pantalla que alguien
 * transfiere: las otras tres son el camino hasta ella. El costo total empresa queda debajo y
 * apagado — es la lectura del empleador, no la del rol, y compite con el líquido si pesa igual.
 *
 * El total de egresos NO se pinta en rojo: `negative` es el SIGNO de un valor y estas cifras son
 * todas positivas. Lo que se resta lo dice el rótulo, no el color.
 *
 * No trae fondo propio ni margen: vive DENTRO de la tarjeta única del rol, y una caja blanca sobre
 * otra caja blanca solo añade un borde. El radio es el de las fichas de identidad —las otras cajas
 * anidadas de esa misma tarjeta—, no el de una tarjeta suelta.
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
