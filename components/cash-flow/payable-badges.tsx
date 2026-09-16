import { Badge } from "@/components/ui/badge";
import { agingLabel, type Aging } from "@/lib/cash-flow/aging";
import { PRIORITY_LABELS } from "@/lib/cash-flow/filters";
import type { Payable } from "@/lib/cash-flow/types";
import { cn } from "@/lib/cn";

/** The aging as a pill: red once late, neutral while still to come — a state, not an alarm. */
export function AgingBadge({ aging, settled }: { aging: Aging; settled?: boolean }) {
  if (settled) {
    return <Badge variant="positive">Liquidada</Badge>;
  }
  return (
    <Badge variant={aging.side === "overdue" ? "negative" : "outline"}>{agingLabel(aging)}</Badge>
  );
}

/** The mark of payment: amber for urgente, brand for pendiente, nothing when unmarked. */
export function PriorityBadge({ priority }: { priority: Payable["priority"] }) {
  if (!priority) {
    return <span className="text-[12px] text-faint">—</span>;
  }
  return (
    <Badge variant={priority === "urgent" ? "warning" : "soft"}>{PRIORITY_LABELS[priority]}</Badge>
  );
}

/** The «CASH» label of the `PROVEEDOR` sheets — beside the priority, never instead of it. */
export function CashBadge() {
  return <Badge variant="positive">Cash</Badge>;
}

/**
 * The approval as four dots — observación · 1ª revisión · revisión final · notificación — the
 * `REPORTE CXP`'s four working columns read at a glance. Filled where something was written.
 */
export function ApprovalDots({
  payable,
  filled = false,
  size = 7,
}: {
  payable?: Payable;
  /** The legend's four, all on. */
  filled?: boolean;
  size?: number;
}) {
  const steps = [
    { label: "Observación", on: filled || (payable?.observation.trim().length ?? 0) > 0 },
    { label: "Primera revisión", on: filled || (payable?.approved ?? null) !== null },
    { label: "Revisión final", on: filled || Boolean(payable?.finalReview) },
    { label: "Notificación de pago", on: filled || Boolean(payable?.notified) },
  ];
  return (
    <span
      className="inline-flex items-center gap-1"
      aria-label={steps.map((step) => `${step.label}: ${step.on ? "sí" : "no"}`).join(" · ")}
    >
      {steps.map((step) => (
        <span
          key={step.label}
          title={step.label}
          style={{ width: size, height: size }}
          className={cn("rounded-full", step.on ? "bg-brand" : "bg-zero")}
        />
      ))}
    </span>
  );
}
