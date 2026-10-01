import type { AttentionState } from "@/lib/schedule/attention";

const styles = {
  prepare: "border-brand/40 bg-brand text-surface",
  soon: "border-warning/50 bg-warning/15 text-warning",
  late: "border-alert/50 bg-alert text-surface",
};
const labels = { prepare: "Por preparar", soon: "Por vencer", late: "Vencida" };

export function TaskAttentionBadge({ state }: { state: AttentionState | null }) {
  if (!state) return null;
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold ${styles[state]}`}
    >
      {labels[state]}
    </span>
  );
}
