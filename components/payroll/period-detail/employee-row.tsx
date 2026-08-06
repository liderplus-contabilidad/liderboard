"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { memo, useCallback } from "react";
import { GridRow } from "@/components/data-table/data-grid";
import { Cell } from "@/components/data-table/grid-cells";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/format";
import type { PayrollEmployeeComputation } from "@/lib/payroll/engine/types";
import { RECONCILIATION_BADGE, reconciliationStatusOf } from "@/lib/payroll/period-detail";
import type { PayrollEmployeeLine } from "@/lib/payroll/types";

/**
 * Una línea con su rol ya calculado. Van EMPAREJADOS y no en dos listas paralelas —ni en un mapa
 * por `id`— porque así el tipo garantiza que toda fila pintada tiene su cómputo: con un mapa,
 * una clave ausente obligaría a saltarse la fila en silencio o a un `!`.
 *
 * El cómputo llega por prop y no se hace aquí: la pantalla lo calcula UNA vez para toda la nómina
 * y lo reparte, así los KPIs de arriba leen exactamente las mismas cifras que la tabla.
 */
export interface EmployeeRowData {
  line: PayrollEmployeeLine;
  computed: PayrollEmployeeComputation;
}

type EmployeeRowProps = EmployeeRowData;

/**
 * Una fila de la nómina, que abre el detalle del empleado.
 *
 * La navegación va DOS veces a propósito y no es duplicación: el `<Link>` del nombre es la
 * afordancia real —toma foco, se anuncia, se abre en otra pestaña con ⌘-clic—, y el `onClick`
 * de la fila solo ensancha el blanco para el ratón, porque un `<tr>` no es focusable ni
 * anuncia nada. Quitar el enlace dejaría la fila inalcanzable con teclado.
 */
function EmployeeRowComponent({ line, computed }: EmployeeRowProps) {
  const router = useRouter();
  const badge = RECONCILIATION_BADGE[reconciliationStatusOf(computed.difference)];
  const href = `/payroll/${line.periodId}/${line.id}`;

  const open = useCallback(() => router.push(href), [router, href]);

  return (
    <GridRow onClick={open}>
      <Cell>
        <span className="flex flex-col gap-0.5">
          <Link href={href} className="font-semibold text-ink transition-colors hover:text-brand">
            {line.name}
          </Link>
          <span className="text-[11.5px] text-faint">
            {line.role} · {line.area}
          </span>
        </span>
      </Cell>
      <Cell className="font-mono">{line.idCard}</Cell>
      <Cell numeric className="font-mono">
        {formatCurrency(computed.grossIncome, { cents: true })}
      </Cell>
      <Cell numeric className="font-mono">
        {formatCurrency(computed.totalDeductions, { cents: true })}
      </Cell>
      <Cell numeric className="font-mono">
        {formatCurrency(computed.netPay, { cents: true })}
      </Cell>
      <Cell>
        <Badge variant={badge.variant}>{badge.label}</Badge>
      </Cell>
    </GridRow>
  );
}

export const EmployeeRow = memo(EmployeeRowComponent);
