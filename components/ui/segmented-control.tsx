"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

interface SegmentOption<T extends string> {
  value: T;
  /** What the segment says — or, with `icon`, what it is called: the label then becomes the
   *  accessible name and the hover title, so a glyph never leaves the option unnamed. */
  label: string;
  /** Drawn INSTEAD of the label, for options whose shape says it faster than a word (bar · pie). */
  icon?: ReactNode;
  /** Renders the segment non-interactive (e.g. frequency below the file's base). */
  disabled?: boolean;
}

type SegmentedVariant = "bar" | "pills" | "track";

interface SegmentedControlProps<T extends string> {
  options: SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /**
   * `bar` = connected mode toggle; `pills` = detached square level pills;
   * `track` = rounded pills inside a track. The `track` background is left to
   * the caller (`className`, e.g. `bg-border-faint`) so it fits any surface.
   */
  variant?: SegmentedVariant;
  ariaLabel?: string;
  className?: string;
}

const CONTAINERS: Record<SegmentedVariant, string> = {
  bar: "inline-flex overflow-hidden rounded-lg border border-border",
  pills: "inline-flex gap-1.5",
  track: "inline-flex rounded-[9px] border border-border p-[3px]",
};

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  variant = "bar",
  ariaLabel,
  className,
}: SegmentedControlProps<T>) {
  return (
    <div aria-label={ariaLabel} className={cn(CONTAINERS[variant], className)}>
      {options.map((option, index) => {
        const active = option.value === value;

        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            aria-label={option.icon ? option.label : undefined}
            title={option.icon ? option.label : undefined}
            disabled={option.disabled}
            onClick={() => onChange(option.value)}
            className={cn(
              "font-semibold transition-colors",
              option.disabled && "cursor-not-allowed opacity-40",
              variant === "bar" &&
                cn(
                  // A glyph keeps the bar's height and gets the width its box needs, no more.
                  option.icon ? "flex items-center px-2.5 py-[6px]" : "px-3 py-[7px] text-xs",
                  index < options.length - 1 && "border-r border-border",
                  active ? "bg-brand text-white" : "bg-surface text-muted hover:bg-canvas",
                ),
              variant === "pills" &&
                cn(
                  "flex h-7 w-7 items-center justify-center rounded-[7px] border text-xs",
                  active
                    ? "border-brand bg-brand text-white"
                    : "border-border bg-surface text-muted hover:border-faint",
                ),
              variant === "track" &&
                cn(
                  "rounded-[7px] px-3 py-1.5 text-xs",
                  active ? "bg-brand text-white" : "text-muted hover:text-brand",
                ),
            )}
          >
            {option.icon ?? option.label}
          </button>
        );
      })}
    </div>
  );
}
