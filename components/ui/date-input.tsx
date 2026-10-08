"use client";

import { DateField } from "@/components/ui/date-field";
import { formatDayMonthYear } from "@/lib/date";
import { formatDateDraft, parseDateInput } from "@/lib/date-input";
import { cn } from "@/lib/cn";

/** Keyboard entry and the existing calendar share one date; the caller keeps invalid drafts. */
export function DateInput({
  value,
  onChange,
  onBlur,
  ariaLabel,
  ariaDescribedBy,
  invalid = false,
}: {
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  ariaLabel: string;
  ariaDescribedBy?: string;
  invalid?: boolean;
}) {
  return (
    <span
      className={cn(
        "flex h-[38px] items-center gap-1 rounded-[9px] border bg-surface px-[9px] text-[13px]",
        invalid
          ? "border-negative focus-within:border-negative"
          : "border-border focus-within:border-brand",
      )}
    >
      <input
        type="text"
        inputMode="numeric"
        autoComplete="off"
        maxLength={10}
        aria-label={ariaLabel}
        aria-invalid={invalid || undefined}
        aria-describedby={ariaDescribedBy}
        value={value}
        placeholder="dd/mm/aaaa"
        onChange={(event) => {
          const input = event.currentTarget;
          const raw = input.value;
          const caret = input.selectionStart ?? raw.length;
          const formatted = formatDateDraft(raw);
          if (formatted !== raw) {
            // Keep middle edits at the same digit; assigning before React's update also keeps
            // the selection stable when formatting produces the same controlled value.
            const digitsBeforeCaret = raw.slice(0, caret).replace(/\D/g, "").length;
            let nextCaret = 0;
            let digits = 0;
            while (nextCaret < formatted.length && digits < digitsBeforeCaret) {
              if (/\d/.test(formatted[nextCaret])) digits += 1;
              nextCaret += 1;
            }
            input.value = formatted;
            const position = caret === raw.length ? formatted.length : nextCaret;
            input.setSelectionRange(position, position);
          }
          onChange(formatted);
        }}
        onKeyDown={(event) => {
          const input = event.currentTarget;
          const start = input.selectionStart;
          if (start === null || start !== input.selectionEnd) return;
          // A separator is formatting, so deleting beside it also removes the adjacent digit.
          if (event.key === "Backspace" && start > 1 && value[start - 1] === "/") {
            input.setSelectionRange(start - 2, start);
          } else if (event.key === "Delete" && value[start] === "/") {
            input.setSelectionRange(start, Math.min(start + 2, value.length));
          }
        }}
        onBlur={() => {
          const iso = parseDateInput(value);
          if (iso) onChange(formatDayMonthYear(iso)!);
          onBlur?.();
        }}
        className="min-w-0 flex-1 bg-transparent font-mono text-ink tabular-nums outline-none placeholder:text-faint"
      />
      <DateField
        value={parseDateInput(value)}
        onChange={(iso) => onChange(formatDayMonthYear(iso) ?? "")}
        nullable
        variant="icon"
        ariaLabel={`Abrir calendario de ${ariaLabel.toLowerCase()}`}
      />
    </span>
  );
}
