import { TrendingDown, TrendingUp } from "lucide-react";
import { cn } from "@/lib/cn";

export interface StatTileProps {
  label: string;
  /** Already formatted; `null` renders the em dash of a period with no coverage. */
  value: string | null;
  hint?: string;
  /**
   * Marks the tile as a result whose sign matters. The sign is ALWAYS drawn with an icon and
   * the signed value too — `positive`/`negative` are color alone, and color alone is not a
   * reading for everyone.
   */
  sign?: "positivo" | "negativo";
}

/**
 * A total is a number, not a chart. "How much was the Utilidad this period" answered with a
 * one-bar plot gives the reader an axis, a grid and a legend to decode a single figure.
 */
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
