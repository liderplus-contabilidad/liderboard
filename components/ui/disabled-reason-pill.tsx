import { Info } from "lucide-react";
import type { ReactNode } from "react";

/**
 * The "why is this switched off" pill that sits beside a disabled control — a control switched
 * off with no visible reason forces the reader to point at it to find out what's missing. Born as
 * `ExcelActions`' upload pill (see README/CLAUDE.md); shared here so any module's own disabled
 * action reads the same way instead of falling back to a tooltip nobody hovers over.
 */
export function DisabledReasonPill({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex h-[34px] items-center gap-2 rounded-full border border-border bg-surface px-3.5 text-[12.5px] font-medium text-muted">
      <Info size={14} className="shrink-0 text-faint" />
      {children}
    </span>
  );
}
