import { formatCurrency, formatNumber } from "@/lib/format";
import type {
  PayrollPeriodFinancials,
  PayrollReconciliationCounts,
} from "@/lib/payroll/period-detail";

interface PeriodKpiCardProps {
  employeeCount: number;
  reconciliation: PayrollReconciliationCounts;
  /** `undefined` mientras el período no reciba su archivo — cada tile lee la raya en vez de $0. */
  financials: PayrollPeriodFinancials | undefined;
}

/**
 * Los cinco KPIs del período en UNA sola tarjeta (a diferencia del historial, donde cada tile es
 * su propia caja) — divididos por hairlines en vez de repetir el borde de cada uno.
 */
export function PeriodKpiCard({ employeeCount, reconciliation, financials }: PeriodKpiCardProps) {
  return (
    <div className="mb-4 grid grid-cols-5 divide-x divide-border rounded-[13px] border border-border bg-surface">
      <EmployeesKpiCell total={employeeCount} reconciliation={reconciliation} />
      <FigureKpiCell label="Ingresos y otros" value={financials?.gross} />
      <FigureKpiCell label="Deducciones" value={financials?.deductions} />
      <FigureKpiCell label="Líquido a pagar" value={financials?.net} />
      <FigureKpiCell label="Costo total empresa" value={financials?.cost} />
    </div>
  );
}

function FigureKpiCell({ label, value }: { label: string; value: number | undefined }) {
  return (
    <div className="min-w-0 px-5 py-4">
      <p className="truncate text-[11.5px] font-semibold uppercase tracking-[0.4px] text-faint">
        {label}
      </p>
      <p className="mt-1 truncate font-mono text-[21px] font-semibold tabular-nums text-ink">
        {value === undefined ? "—" : formatCurrency(value, { cents: true })}
      </p>
    </div>
  );
}

function EmployeesKpiCell({
  total,
  reconciliation,
}: {
  total: number;
  reconciliation: PayrollReconciliationCounts;
}) {
  return (
    <div className="flex min-w-0 items-center gap-3 px-5 py-4">
      <EmployeeDonut
        total={total}
        reconciled={reconciliation.reconciled}
        withDifference={reconciliation.withDifference}
      />
      <div className="min-w-0">
        <p className="truncate text-[11.5px] font-semibold uppercase tracking-[0.4px] text-faint">
          Empleados
        </p>
        <p className="mt-1 font-mono text-[21px] font-semibold tabular-nums text-ink">
          {formatNumber(total)}
        </p>
        <p className="mt-0.5 truncate text-[11px] text-muted">
          <span className="font-semibold text-positive">{reconciliation.reconciled}</span>{" "}
          conciliados ·{" "}
          <span className="font-semibold text-warning">{reconciliation.withDifference}</span> con
          diferencia
        </p>
      </div>
    </div>
  );
}

const DONUT_SIZE = 46;
const DONUT_STROKE = 6;

/**
 * El donut de «Empleados»: SVG inline sobre los tokens `@theme` (nada de ECharts para un par de
 * arcos, nada de hex). Un anillo base `--color-border` bajo dos arcos — conciliados en
 * `--color-positive`, con diferencia en `--color-warning` — dejando el resto (sin conciliar) leído
 * en el anillo base: la nómina puede tener empleados que no son ninguna de las dos cosas todavía.
 */
function EmployeeDonut({
  total,
  reconciled,
  withDifference,
}: {
  total: number;
  reconciled: number;
  withDifference: number;
}) {
  const radius = (DONUT_SIZE - DONUT_STROKE) / 2;
  const circumference = 2 * Math.PI * radius;
  const reconciledLength = total > 0 ? (reconciled / total) * circumference : 0;
  const differenceLength = total > 0 ? (withDifference / total) * circumference : 0;
  const center = DONUT_SIZE / 2;

  const label =
    total === 0
      ? "Sin empleados registrados"
      : `${reconciled} de ${total} empleados conciliados, ${withDifference} con diferencia`;

  return (
    <svg
      width={DONUT_SIZE}
      height={DONUT_SIZE}
      viewBox={`0 0 ${DONUT_SIZE} ${DONUT_SIZE}`}
      className="shrink-0"
      aria-label={label}
    >
      <circle
        cx={center}
        cy={center}
        r={radius}
        fill="none"
        stroke="var(--color-border)"
        strokeWidth={DONUT_STROKE}
      />
      {reconciledLength > 0 && (
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="var(--color-positive)"
          strokeWidth={DONUT_STROKE}
          strokeDasharray={`${reconciledLength} ${circumference - reconciledLength}`}
          strokeLinecap="round"
          transform={`rotate(-90 ${center} ${center})`}
        />
      )}
      {differenceLength > 0 && (
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="var(--color-warning)"
          strokeWidth={DONUT_STROKE}
          strokeDasharray={`${differenceLength} ${circumference - differenceLength}`}
          strokeDashoffset={-reconciledLength}
          strokeLinecap="round"
          transform={`rotate(-90 ${center} ${center})`}
        />
      )}
    </svg>
  );
}
