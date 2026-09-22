"use client";

import { CalendarDays, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Dropdown, DropdownFooter, DropdownPanel, useDropdown } from "@/components/ui/dropdown";
import { todayISO } from "@/lib/calendar";
import { cn } from "@/lib/cn";
import { formatDayMonthYear } from "@/lib/date";

type DateFieldVariant = "field" | "cell" | "dark";

/**
 * A date the reader picks on the app's own `Calendar`, wherever a form or a table asked for one:
 * the one replacement for every `<input type="date">`, whose picker was the browser's and whose box
 * never matched the control beside it.
 *
 * The trigger prints the date the way the app writes a civil date (`formatDayMonthYear`, dd/mm/aaaa)
 * and wears the box of its neighbours — `field` is `FieldBox`'s border and padding under a
 * `FormField`, `cell` the inline input of an editable row, `dark` the white-on-brand of a bulk bar.
 * A nullable date (`onChange(null)` allowed) offers «Quitar» in the panel's footer and prints
 * `placeholder` while empty; a required one offers only «Hoy».
 */
export function DateField({
  value,
  onChange,
  nullable = false,
  placeholder = "Sin fecha",
  disabled = false,
  variant = "field",
  ariaLabel,
  className,
}: {
  value: string | null;
  onChange: (iso: string | null) => void;
  nullable?: boolean;
  placeholder?: string;
  disabled?: boolean;
  variant?: DateFieldVariant;
  ariaLabel: string;
  className?: string;
}) {
  return (
    <Dropdown className={cn(variant !== "dark" && "block", className)}>
      <DateTrigger
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        variant={variant}
        ariaLabel={ariaLabel}
      />
      <DropdownPanel>
        <DatePanel value={value} nullable={nullable} onChange={onChange} />
      </DropdownPanel>
    </Dropdown>
  );
}

const TRIGGERS: Record<DateFieldVariant, string> = {
  field:
    "w-full rounded-lg border border-border bg-surface px-[9px] py-2 text-[13px] text-ink focus-visible:border-brand",
  cell: "w-full rounded-lg border border-border bg-surface px-[9px] py-1.5 text-[13px] text-ink focus-visible:border-brand",
  dark: "rounded-[7px] px-1.5 py-1 text-[12px] font-semibold text-white hover:bg-white/10",
};

function DateTrigger({
  value,
  placeholder,
  disabled,
  variant,
  ariaLabel,
}: {
  value: string | null;
  placeholder: string;
  disabled: boolean;
  variant: DateFieldVariant;
  ariaLabel: string;
}) {
  const { open, setOpen, triggerRef } = useDropdown();
  const label = formatDayMonthYear(value);

  return (
    <button
      ref={triggerRef}
      type="button"
      aria-haspopup="dialog"
      aria-expanded={open}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => setOpen(!open)}
      className={cn(
        "inline-flex items-center gap-2 text-left font-sans tabular-nums outline-none transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        TRIGGERS[variant],
        open && variant !== "dark" && "border-brand",
        open && variant === "dark" && "bg-white/10",
      )}
    >
      <CalendarDays
        size={14}
        className={cn("shrink-0", variant === "dark" ? "text-white/70" : "text-faint")}
      />
      <span
        className={cn("flex-1", !label && (variant === "dark" ? "text-white/60" : "text-faint"))}
      >
        {label ?? placeholder}
      </span>
    </button>
  );
}

function DatePanel({
  value,
  nullable,
  onChange,
}: {
  value: string | null;
  nullable: boolean;
  onChange: (iso: string | null) => void;
}) {
  const { setOpen } = useDropdown();
  const today = todayISO();
  const pick = (iso: string | null) => {
    onChange(iso);
    setOpen(false);
  };

  return (
    <>
      {/* Keyed by the value so a pick from outside re-seeds the month on screen. */}
      <Calendar key={value ?? "none"} value={value} today={today} onChange={pick} />
      <DropdownFooter>
        <Button variant="ghost" size="sm" disabled={value === today} onClick={() => pick(today)}>
          Hoy
        </Button>
        {nullable && (
          <Button
            variant="ghost"
            size="sm"
            icon={<X size={13} />}
            disabled={value === null}
            onClick={() => pick(null)}
          >
            Quitar
          </Button>
        )}
      </DropdownFooter>
    </>
  );
}
