"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { memo, useCallback } from "react";
import { GridRow } from "@/components/data-table/data-grid";
import { Cell } from "@/components/data-table/grid-cells";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/format";
import { employeeReconciliationStatus, RECONCILIATION_BADGE } from "@/lib/payroll/period-detail";
import type { PayrollEmployeeLine } from "@/lib/payroll/types";

interface EmployeeRowProps {
  line: PayrollEmployeeLine;
}

/**
 * Una fila de la nómina, que abre el detalle del empleado.
 *
 * La navegación va DOS veces a propósito y no es duplicación: el `<Link>` del nombre es la
 * afordancia real —toma foco, se anuncia, se abre en otra pestaña con ⌘-clic—, y el `onClick`
 * de la fila solo ensancha el blanco para el ratón, porque un `<tr>` no es focusable ni
 * anuncia nada. Quitar el enlace dejaría la fila inalcanzable con teclado.
 */
function EmployeeRowComponent({ line }: EmployeeRowProps) {
  const router = useRouter();
  const figures = line.figures;
  const badge = RECONCILIATION_BADGE[employeeReconciliationStatus(line)];
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
      <Cell numeric tone={figures ? "default" : "muted"} className="font-mono">
        {figures ? formatCurrency(figures.gross, { cents: true }) : "–"}
      </Cell>
      <Cell numeric tone={figures ? "default" : "muted"} className="font-mono">
        {figures ? formatCurrency(figures.deductions, { cents: true }) : "–"}
      </Cell>
      <Cell numeric tone={figures ? "default" : "muted"} className="font-mono">
        {figures ? formatCurrency(figures.net, { cents: true }) : "–"}
      </Cell>
      <Cell>
        <Badge variant={badge.variant}>{badge.label}</Badge>
      </Cell>
    </GridRow>
  );
}

export const EmployeeRow = memo(EmployeeRowComponent);
