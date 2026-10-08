import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

interface DataGridProps {
  children: ReactNode;
  /** Force a horizontal scroll threshold (px). Columns below it stay pinned. */
  minWidth?: number;
  className?: string;
  /** Constrain the scroll viewport without changing the table's layout. */
  containerClassName?: string;
}

/** Scroll container + `<table>` shell. Compose `<thead>`/`<tbody>` (or `GridRow`) inside. */
export function DataGrid({ children, minWidth, className, containerClassName }: DataGridProps) {
  return (
    <div
      className={cn(
        "overflow-x-auto rounded-xl border border-border bg-surface",
        containerClassName,
      )}
    >
      <table className={cn("w-full border-collapse", className)} style={{ minWidth }}>
        {children}
      </table>
    </div>
  );
}

interface GridRowProps {
  children: ReactNode;
  /** Tints the row (subtotal / group rows). */
  muted?: boolean;
  /**
   * Makes the whole row clickable — mouse convenience only.
   *
   * It is NOT the row's accessible affordance and must never be the only way in: a `<tr>` takes
   * no focus and announces nothing, so a row that navigates has to carry a real `<Link>` inside
   * (on its title cell) for keyboard, screen readers and open-in-new-tab. This handler just
   * widens the target for a pointer.
   */
  onClick?: () => void;
  className?: string;
}

export function GridRow({ children, muted, onClick, className }: GridRowProps) {
  return (
    <tr
      onClick={onClick}
      className={cn(
        muted && "bg-surface-muted",
        onClick && "cursor-pointer transition-colors hover:bg-surface-muted",
        className,
      )}
    >
      {children}
    </tr>
  );
}
