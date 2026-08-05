"use client";

import { Download, Eye } from "lucide-react";
import { memo } from "react";
import { GridRow } from "@/components/data-table/data-grid";
import { Cell } from "@/components/data-table/grid-cells";
import { Badge } from "@/components/ui/badge";
import { formatAmount, formatNumber, pluralize } from "@/lib/format";
import { periodKindLabel, periodLongLabel } from "@/lib/payroll/periods";
import type { PayrollPeriod } from "@/lib/payroll/types";

const STATUS_LABEL: Record<PayrollPeriod["status"], string> = {
  captura: "En captura",
  cerrado: "Cerrado",
};

/** Un período sin totales no tiene qué mostrar ni qué descargar: el control se apaga con un
 * motivo visible en vez de quedar ahí sin explicación. */
const NO_DATA_REASON = "El período todavía no tiene datos cargados";

const ROW_ACTION_CLASS =
  "rounded-[7px] p-1.5 text-faint transition-colors hover:bg-canvas hover:text-brand disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-faint";

interface PayrollPeriodRowProps {
  period: PayrollPeriod;
}

function PayrollPeriodRowComponent({ period }: PayrollPeriodRowProps) {
  const { totals } = period;
  const hasData = totals !== undefined;

  return (
    <GridRow>
      <Cell>
        <span className="flex flex-col gap-0.5">
          <span className="font-semibold uppercase tracking-[0.2px] text-ink">
            {periodLongLabel(period.year, period.monthIndex)}
          </span>
          <span className="text-[11.5px] text-faint">
            {hasData ? `Nómina mensual · ${pluralize(totals.areas, "área")}` : "Sin empleados"}
          </span>
        </span>
      </Cell>
      <Cell>{periodKindLabel(period.kind)}</Cell>
      <Cell numeric className="font-mono">
        {formatNumber(totals?.employees ?? 0)}
      </Cell>
      <Cell numeric tone={hasData ? "default" : "muted"} className="font-mono">
        {hasData ? formatAmount(totals.net) : "–"}
      </Cell>
      <Cell numeric tone={hasData ? "default" : "muted"} className="font-mono">
        {hasData ? formatAmount(totals.cost) : "–"}
      </Cell>
      <Cell>
        <Badge variant={period.status === "cerrado" ? "positive" : "warning"}>
          {STATUS_LABEL[period.status]}
        </Badge>
      </Cell>
      <Cell align="right">
        <span className="flex items-center justify-end gap-1">
          <button
            type="button"
            disabled={!hasData}
            title={hasData ? "Ver período" : NO_DATA_REASON}
            aria-label={hasData ? "Ver período" : NO_DATA_REASON}
            className={ROW_ACTION_CLASS}
          >
            <Eye size={15} />
          </button>
          <button
            type="button"
            disabled={!hasData}
            title={hasData ? "Descargar rol de pagos" : NO_DATA_REASON}
            aria-label={hasData ? "Descargar rol de pagos" : NO_DATA_REASON}
            className={ROW_ACTION_CLASS}
          >
            <Download size={15} />
          </button>
        </span>
      </Cell>
    </GridRow>
  );
}

export const PayrollPeriodRow = memo(PayrollPeriodRowComponent);
