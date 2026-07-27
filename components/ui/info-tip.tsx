"use client";

import { Info } from "lucide-react";
import { type ReactNode, useState } from "react";
import { cn } from "@/lib/cn";

/**
 * A small info button that reveals a dark tooltip on hover or click. `title` renders a bold
 * heading with an icon above the body; `align` picks which edge the panel hangs from — "right"
 * (default) for triggers near the right edge of a bar, "left" for triggers near the left.
 */
export function InfoTip({
  label,
  title,
  align = "right",
  width = 288,
  children,
}: {
  label: string;
  title?: string;
  align?: "left" | "right";
  width?: number;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div
      className="relative flex"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="flex h-[34px] w-[34px] items-center justify-center rounded-[9px] border border-border bg-surface text-faint transition-colors hover:text-muted"
      >
        <Info size={16} />
      </button>
      {open && (
        <div
          role="tooltip"
          style={{ width }}
          className={cn(
            "absolute top-[calc(100%+8px)] z-30 rounded-[10px] bg-ink px-[13px] py-[11px] text-[12px] leading-normal text-white/85 shadow-[0_14px_36px_rgba(15,23,42,0.28)]",
            align === "right" ? "right-0" : "left-0",
          )}
        >
          {title && (
            <div className="mb-1 flex items-center gap-1.5 font-semibold text-white">
              <Info size={13} />
              {title}
            </div>
          )}
          {children}
        </div>
      )}
    </div>
  );
}
