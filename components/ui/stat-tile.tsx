import { TrendingDown, TrendingUp } from "lucide-react";
import { cn } from "@/lib/cn";

export interface StatTileProps {
  label: string;
  /** Already formatted; `null` renders the em dash of a period with no coverage. */
  value: string | null;
  hint?: string;
  /** ALWAYS drawn with an icon and the signed value too: color alone is not a reading. */
  sign?: "positivo" | "negativo";
}

/** A total is a number, not a chart: a one-bar plot is an axis and a legend for one figure. */
export function StatTile({ label, value, hint, sign }: StatTileProps) {
  const Icon = sign === "negativo" ? TrendingDown : TrendingUp;

  return (
    <div className="min-w-0 flex-1 rounded-[13px] border border-border bg-surface px-4 py-3">
      <p className="truncate text-[11.5px] font-semibold uppercase tracking-[0.4px] text-faint">
        {label}
      </p>
      <p
        className={cn(
          "mt-1 flex items-center gap-1.5 text-[21px] font-semibold tabular-nums",
          sign === "positivo" && "text-positive",
          sign === "negativo" && "text-negative",
          !sign && "text-ink",
        )}
      >
        {sign && <Icon size={18} strokeWidth={2.2} aria-hidden />}
        <span className="truncate">{value ?? "—"}</span>
        {sign && <span className="sr-only">{sign === "negativo" ? "pérdida" : "utilidad"}</span>}
      </p>
      {hint && <p className="mt-0.5 truncate text-[11.5px] text-muted">{hint}</p>}
    </div>
  );
}
