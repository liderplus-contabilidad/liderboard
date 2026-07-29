import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

type ToolbarTone = "surface" | "sunken";

const TONES: Record<ToolbarTone, string> = {
  surface: "bg-surface",
  sunken: "border-t border-border-soft bg-surface-sunken",
};

/** A horizontal filter/action row: wraps its controls with consistent padding + gap. */
export function Toolbar({
  tone = "surface",
  inert = false,
  className,
  children,
}: {
  /** `surface` = plain white row; `sunken` = tinted row with a top hairline. */
  tone?: ToolbarTone;
  /** Takes the whole row out of the focus order and the a11y tree — for a bar whose controls
   * have nothing to act on yet. The row keeps its space, so nothing reflows when they do. */
  inert?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      inert={inert}
      className={cn("flex flex-wrap items-center gap-2.5 px-7 py-3", TONES[tone], className)}
    >
      {children}
    </div>
  );
}

/** Uppercase micro-label that heads a toolbar group ("FILTROS", "VER POR", …). */
export function ToolbarLabel({ icon, children }: { icon?: ReactNode; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2 text-[10.5px] font-semibold uppercase tracking-[0.6px] text-faint">
      {icon}
      {children}
    </span>
  );
}
