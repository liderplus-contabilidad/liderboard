"use client";

import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/cn";
import { attentionCounts } from "@/lib/schedule/attention";
import { useOperations } from "./operations-provider";

export function ScheduleDueBadge({ collapsed }: { collapsed: boolean }) {
  const { tasks, today, loading } = useOperations();
  const counts = useMemo(() => attentionCounts(tasks, today), [tasks, today]);
  if (loading || !counts.total) return null;
  const description = `${counts.total} tareas requieren atención: ${counts.late} vencidas, ${counts.soon} próximas a vencer y ${counts.prepare} por preparar`;
  return (
    <span data-attention-badge>
      <Badge
        variant="count"
        title={description}
        className={cn(
          counts.total > 999 ? "size-8" : collapsed && counts.total < 100 ? "size-5" : "size-6",
          collapsed && "absolute -right-1 -top-1",
          counts.late
            ? "bg-alert text-surface"
            : counts.soon
              ? "bg-warning text-ink"
              : "bg-brand text-surface",
        )}
      >
        <span aria-hidden="true">{counts.total}</span>
        <span className="sr-only">{description}</span>
      </Badge>
    </span>
  );
}
