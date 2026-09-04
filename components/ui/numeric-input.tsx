"use client";

import type { KeyboardEvent } from "react";
import { useCallback, useState } from "react";
import { cn } from "@/lib/cn";
import { formatAmount, formatCurrency, formatNumber, parseCurrency } from "@/lib/format";

interface NumericInputProps {
  /** `null` is painted EMPTY, never as zero — the distinction `PAGADO` needs so an unreconciled
   *  período does not claim nothing was paid. */
  value: number | null;
  /** Only called when the value CHANGES. It emits `null` only with `nullable`. */
  onCommit: (value: number | null) => void;
  /**
   * `amount` = always two decimals and NO symbol («1,234.00»), for a column that already names its
   * unit — it is what gets compared against a spreadsheet cell by cell; `currency` = the same, with
   * the symbol («$1,234.00»), for a column whose header names a CONCEPT and not a unit; `plain` = a
   * grouped number with no padding («30»), for a quantity.
   */
  format?: "amount" | "currency" | "plain";
  /** With `true`, emptying the field emits `null`; without it, emptying reverts to the previous value
   *  instead of inventing a zero. */
  nullable?: boolean;
  disabled?: boolean;
  ariaLabel: string;
  placeholder?: string;
  align?: "left" | "right";
  className?: string;
}

/**
 * An amount or quantity input with a local DRAFT: while it has focus it writes over its own text and
 * only commits on leaving or with Enter, so a re-render from above —the rol's engine derives twenty
 * columns with every keystroke— cannot snatch the cursor away. Escape discards the draft.
 *
 * The text is seeded with the formatters of `@/lib/format`, which is what makes the value do the full
 * round trip: `formatAmount(1234.5)` → «1,234.50» → `parseCurrency` → `1234.5`. Text that does not
 * parse is NOT committed: reverting is more honest than writing a zero nobody typed.
 *
 * It is the same mechanic as Ocupaciones' daily cell, extracted here because the payroll detail needs
 * it in two different forms —a record field and a table cell— and a second copy could drift from the
 * first on what it considers «empty».
 */
export function NumericInput({
  value,
  onCommit,
  format = "amount",
  nullable = false,
  disabled = false,
  ariaLabel,
  placeholder = "–",
  align = "right",
  className,
}: NumericInputProps) {
  const [draft, setDraft] = useState<string | null>(null);

  // The seed has to round-trip through `parseCurrency`, which is why every branch here writes a shape
  // that parser accepts — the symbol included.
  const seed =
    value === null
      ? ""
      : format === "amount"
        ? formatAmount(value)
        : format === "currency"
          ? formatCurrency(value, { cents: true })
          : formatNumber(value);

  const commit = useCallback(
    (text: string) => {
      setDraft(null);
      const trimmed = text.trim();
      if (trimmed === "") {
        if (nullable && value !== null) {
          onCommit(null);
        }
        return;
      }
      const parsed = parseCurrency(trimmed);
      if (parsed !== null && parsed !== value) {
        onCommit(parsed);
      }
    },
    [nullable, onCommit, value],
  );

  const handleKeyDown = useCallback((event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.currentTarget.blur();
      return;
    }
    if (event.key === "Escape") {
      setDraft(null);
      event.currentTarget.blur();
    }
  }, []);

  return (
    <input
      inputMode="decimal"
      value={draft ?? seed}
      disabled={disabled}
      aria-label={ariaLabel}
      placeholder={placeholder}
      onChange={(event) => setDraft(event.target.value)}
      onFocus={(event) => event.target.select()}
      onBlur={(event) => commit(event.target.value)}
      onKeyDown={handleKeyDown}
      className={cn(
        "w-full bg-transparent font-mono text-ink outline-none transition-colors placeholder:text-faint disabled:cursor-not-allowed disabled:text-muted",
        align === "right" ? "text-right tabular-nums" : "text-left tabular-nums",
        className,
      )}
    />
  );
}
