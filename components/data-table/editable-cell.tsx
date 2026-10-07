"use client";

import { cn } from "@/lib/cn";

interface EditableCellProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  align?: "left" | "right";
  ariaLabel?: string;
  className?: string;
}

/** A `<td>` whose full area is an inline input — transparent until focused. */
export function EditableCell({
  value,
  onChange,
  placeholder = "–",
  align = "right",
  ariaLabel = "Editar celda",
  className,
}: EditableCellProps) {
  return (
    <td className={cn("border-b border-l border-border-soft border-l-border-faint p-0", className)}>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-label={ariaLabel}
        className={cn(
          "w-full border border-transparent bg-transparent px-2.5 py-2 text-[12.5px] text-ink outline-none transition-colors placeholder:text-faint focus:border-brand focus:bg-surface",
          align === "right" ? "text-right font-mono tabular-nums" : "text-left font-sans",
        )}
      />
    </td>
  );
}
