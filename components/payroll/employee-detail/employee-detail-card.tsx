import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/cn";
import {
  RECONCILIATION_BADGE,
  type EmployeeReconciliationStatus,
} from "@/lib/payroll/period-detail";

/**
 * El mismo mapa que `period-detail/employee-row.tsx` declara para la tabla del período. Está
 * repetido porque aquel no lo exporta y su carpeta está fuera de esta ronda: en cuanto se pueda
 * tocar, el sitio de este mapa es `lib/payroll/period-detail.ts`, junto a
 * `employeeReconciliationStatus` — dos rótulos del mismo estado en dos pantallas es exactamente la
 * clase de discrepancia que ningún test de cifras detecta.
 */
interface EmployeeDetailCardProps {
  /** El estado de conciliación del EMPLEADO (líquido contra pagado), no el del período. */
  status: EmployeeReconciliationStatus;
  /** El ordinal del empleado dentro de la nómina — el «No.» del comprobante impreso. */
  number: number;
  children: ReactNode;
}

/**
 * La tarjeta única que contiene TODO el rol de un empleado: fichas de identidad, campos del
 * período, las dos tablas de conceptos y los totales.
 *
 * Es una sola caja y no cuatro porque lo que hay dentro es UN documento —el comprobante que el
 * empleado firma—, y partirlo en tarjetas sueltas lo lee como cuatro informes que casualmente
 * hablan de la misma persona. La cabecera declara de quién es el papel: el distintivo de
 * conciliación a la izquierda y su número de orden a la derecha, igual que el comprobante impreso.
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

/** El relleno de una sección de la tarjeta — 20 px a los lados y abajo. Se exporta para que quien
 *  componga la pantalla no tenga que adivinarlo ni repetirlo: dentro de una tarjeta única, el
 *  margen entre bloques es responsabilidad de la tarjeta, no de cada bloque. */
export function EmployeeDetailSection({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cn("px-5 pb-5", className)}>{children}</div>;
}
