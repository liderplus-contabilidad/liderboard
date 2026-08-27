/**
 * A período's detail screen: pure derivations over its stored nómina. As `PayrollRosterSummary`
 * already does for «Empleados»/«Áreas», none of this is persisted next to the período — a total
 * stored separately could go stale and then the KPI card would say one thing and the table below
 * another.
 */
import { matchesSearch } from "@/lib/workspaces";
import type { PayrollEmployeeComputation } from "./engine/types";
import type { PayrollEmployeeLine } from "./types";

/**
 * Reconciled: what was paid was declared and matches the net pay the engine COMPUTES. With a
 * difference: it was declared and does not match. Unreconciled: nobody has declared what was paid yet
 * — neither of the other two, and the label must not pretend otherwise.
 *
 * The `difference` the engine already produced (`CA = AP − BZ`) is classified instead of subtracting
 * again: the engine is the only place where what «squaring» means is decided, including the collapse
 * of the sub-cent noise, and a second subtraction here could drift from its own — and it did drift,
 * because this compared what the file said while the engine compared what was typed.
 */
export type EmployeeReconciliationStatus = "conciliado" | "diferencia" | "sin-conciliar";

export function reconciliationStatusOf(
  difference: PayrollEmployeeComputation["difference"],
): EmployeeReconciliationStatus {
  if (difference === null) {
    return "sin-conciliar";
  }
  return difference === 0 ? "conciliado" : "diferencia";
}

/**
 * How each reconciliation state renders: the `Badge`'s tone and its label.
 *
 * It lives next to `reconciliationStatusOf` and not in a component because TWO screens read it —the
 * nómina's row and the detail's header— and a label that disagreed between them would raise doubts
 * about the figure, not the label. The variants are token names, not React, so the pure layer can name
 * them without dragging the presentation one in.
 */
export const RECONCILIATION_BADGE: Record<
  EmployeeReconciliationStatus,
  { variant: "positive" | "warning" | "outline"; label: string }
> = {
  conciliado: { variant: "positive", label: "Conciliado" },
  diferencia: { variant: "warning", label: "Con diferencia" },
  "sin-conciliar": { variant: "outline", label: "Sin conciliar" },
};

export interface PayrollReconciliationCounts {
  reconciled: number;
  withDifference: number;
}

/**
 * The breakdown of the «Empleados» card: how many of the nómina are reconciled and how many are in
 * difference. The rest (with no declared `PAGADO`) enter neither of the two counts — counting them in
 * either would be a label lying by omission.
 */
export function computeReconciliationCounts(
  computations: readonly PayrollEmployeeComputation[],
): PayrollReconciliationCounts {
  let reconciled = 0;
  let withDifference = 0;
  for (const computation of computations) {
    const status = reconciliationStatusOf(computation.difference);
    if (status === "conciliado") {
      reconciled += 1;
    } else if (status === "diferencia") {
      withDifference += 1;
    }
  }
  return { reconciled, withDifference };
}

export interface PayrollPeriodFinancials {
  gross: number;
  deductions: number;
  net: number;
  cost: number;
}

/**
 * The KPI card's four totals, ALWAYS summed from the rol the engine computes for each line.
 * `undefined` only with an EMPTY nómina: a período with no employees has no totals, and that is not
 * the same as a nómina with figures at zero.
 *
 * The cut used to be «no employee brings `figures`», that is, «the file did not arrive». That state no
 * longer exists: the engine derives the complete rol from the record —the unified salary comes out of
 * the base salary and the days, and what is not captured is really worth zero (see `toEngineInput`)—,
 * so a nómina just copied from the previous month shows its four KPIs from the first render, which is
 * the module's main use case.
 *
 * It receives computations and not lines so an upload's preview can total what the file brings BEFORE
 * it exists in the database and has an `id`/`periodId`, with the same definition of «the four totals»
 * the KPI card will read later.
 */
export function computePeriodFinancials(
  computations: readonly PayrollEmployeeComputation[],
): PayrollPeriodFinancials | undefined {
  if (computations.length === 0) {
    return undefined;
  }

  return computations.reduce<PayrollPeriodFinancials>(
    (totals, computation) => ({
      gross: totals.gross + computation.grossIncome,
      deductions: totals.deductions + computation.totalDeductions,
      net: totals.net + computation.netPay,
      cost: totals.cost + computation.employerCost,
    }),
    { gross: 0, deductions: 0, net: 0, cost: 0 },
  );
}

/** The employee table's search box: it compares the name, ignoring case and accents — the same rule
 *  the client selector and the período search box already use. */
export function matchesEmployeeSearch(
  line: Pick<PayrollEmployeeLine, "name">,
  query: string,
): boolean {
  return matchesSearch(line.name, query);
}
