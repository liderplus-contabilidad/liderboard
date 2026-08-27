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
 * A line with its rol already computed. They travel PAIRED and not in two parallel lists —nor in a
 * map by `id`— because that way the type guarantees every painted row has its computation: with a
 * map, a missing key would force skipping the row in silence or an `!`.
 *
 * The computation arrives by prop and is not done here: the screen computes it ONCE for the whole
 * nómina and hands it out, so the KPIs above read exactly the same figures as the table.
 */
export interface EmployeeRowData {
  line: PayrollEmployeeLine;
  computed: PayrollEmployeeComputation;
}

type EmployeeRowProps = EmployeeRowData;

/**
 * A row of the nómina, which opens the employee's detail.
 *
 * The navigation is there TWICE on purpose and is not duplication: the name's `<Link>` is the real
 * affordance —it takes focus, it is announced, it opens in another tab with ⌘-click—, and the row's
 * `onClick` only widens the target for the mouse, because a `<tr>` is neither focusable nor
 * announces anything. Removing the link would leave the row unreachable by keyboard.
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
