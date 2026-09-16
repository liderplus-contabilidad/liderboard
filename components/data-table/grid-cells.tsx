import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/cn";

type Align = "left" | "right";
type Sticky = "left" | "right";
type Tone = "default" | "positive" | "negative" | "muted" | "auto";

interface HeadCellProps {
  children?: ReactNode;
  align?: Align;
  /** Pin the column while the grid scrolls horizontally. */
  sticky?: Sticky;
  /** `min-width` in px. */
  width?: number;
  className?: string;
}

/** A `<th>` styled as an uppercase column label. */
export function HeadCell({ children, align = "left", sticky, width, className }: HeadCellProps) {
  return (
    <th
      style={{ minWidth: width }}
      className={cn(
        "border-b border-border bg-surface-header px-3.5 py-2.5 text-[11px] font-semibold uppercase tracking-[0.4px] text-faint",
        align === "right" ? "text-right tabular-nums" : "text-left",
        sticky === "left" && "sticky left-0 z-20 border-r border-border",
        sticky === "right" && "sticky right-0 z-20 border-l border-border text-brand",
        className,
      )}
    >
      {children}
    </th>
  );
}

const TONE_CLASS: Record<Exclude<Tone, "auto">, string> = {
  default: "text-ink",
  positive: "text-positive",
  negative: "text-negative",
  muted: "text-zero",
};

function resolveTone(tone: Tone, value?: number): Exclude<Tone, "auto"> {
  if (tone !== "auto") {
    return tone;
  }
  if (value === undefined) {
    return "default";
  }
  if (value === 0) {
    return "muted";
  }
  return value < 0 ? "negative" : "default";
}

interface CellProps {
  children?: ReactNode;
  align?: Align;
  /** Right-align + tabular figures. */
  numeric?: boolean;
  sticky?: Sticky;
  /** Emphasized total styling (semibold, brand — or red when negative). */
  strong?: boolean;
  /** Text color. `auto` derives it from the sign of `value`. */
  tone?: Tone;
  value?: number;
  /** Row/weekend background (ignored on sticky cells, which need a solid fill). */
  background?: string;
  /** A group row's label spanning several columns. */
  colSpan?: number;
  className?: string;
}

/** A `<td>` for the grid body. */
export function Cell({
  children,
  align = "left",
  numeric,
  sticky,
  strong,
  tone = "default",
  value,
  background,
  colSpan,
  className,
}: CellProps) {
  const resolved = resolveTone(tone, value);
  const style: CSSProperties | undefined =
    background && !sticky ? { backgroundColor: background } : undefined;

  return (
    <td
      style={style}
      colSpan={colSpan}
      className={cn(
        "border-b border-border-soft px-3.5 py-2 text-[12.5px]",
        numeric || align === "right" ? "text-right tabular-nums" : "text-left",
        strong
          ? cn("font-semibold", resolved === "negative" ? "text-negative" : "text-brand")
          : cn("font-normal", TONE_CLASS[resolved]),
        sticky === "left" && "sticky left-0 z-10 border-r border-border bg-surface",
        sticky === "right" && "sticky right-0 z-10 border-l border-border bg-surface-header",
        className,
      )}
    >
      {children}
    </td>
  );
}
