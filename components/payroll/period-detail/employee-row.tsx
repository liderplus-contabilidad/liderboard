import { memo } from "react";
import { GridRow } from "@/components/data-table/data-grid";
import { Cell } from "@/components/data-table/grid-cells";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/format";
import {
  employeeReconciliationStatus,
  type EmployeeReconciliationStatus,
} from "@/lib/payroll/period-detail";
import type { PayrollEmployeeLine } from "@/lib/payroll/types";

const STATUS_BADGE: Record<
  EmployeeReconciliationStatus,
  { variant: "positive" | "warning" | "outline"; label: string }
> = {
  conciliado: { variant: "positive", label: "Conciliado" },
  diferencia: { variant: "warning", label: "Con diferencia" },
  "sin-conciliar": { variant: "outline", label: "Sin conciliar" },
};

interface EmployeeRowProps {
  line: PayrollEmployeeLine;
}

function EmployeeRowComponent({ line }: EmployeeRowProps) {
  const figures = line.figures;
  const badge = STATUS_BADGE[employeeReconciliationStatus(line)];

  return (
    <GridRow>
      <Cell>
        <span className="flex flex-col gap-0.5">
          <span className="font-semibold text-ink">{line.name}</span>
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
