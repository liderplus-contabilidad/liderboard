"use client";

import { useRef, useState } from "react";
import { format, parseISO } from "date-fns";
import { CalendarDays, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DayCalendar } from "@/components/ui/day-calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatDayMonthYear } from "@/lib/date";
import { cn } from "@/lib/cn";
import { dueDatePatch, validDate, validPeriod } from "@/lib/schedule/model";
import type { TaskValues } from "@/lib/operations/types";

export function TaskDateField({
  value,
  today,
  label,
  onCommit,
  id,
  disabled = false,
  appearance = "field",
  overdue = false,
}: {
  value: Pick<TaskValues, "dueOn" | "period">;
  today: string;
  label: string;
  onCommit: (patch: Partial<TaskValues>) => Promise<void>;
  id?: string;
  disabled?: boolean;
  appearance?: "field" | "card";
  overdue?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [container, setContainer] = useState<HTMLElement | null>(null);
  const selected = value.dueOn && validDate(value.dueOn) ? parseISO(value.dueOn) : undefined;
  const period = validPeriod(value.period) ? value.period : "";
  const save = async (date: string | null) => {
    if (busy) return;
    setBusy(true);
    try {
      await onCommit(dueDatePatch(date));
      setOpen(false);
    } catch {
      // Keep the calendar available to retry; the provider displays the save error.
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex flex-col gap-1.5">
      <Popover
        open={open}
        onOpenChange={(next) => {
          if (busy) return;
          // A native modal dialog sits above body portals; its calendar belongs inside it.
          if (next) setContainer(triggerRef.current?.closest("dialog") ?? null);
          setOpen(next);
        }}
      >
        <PopoverTrigger asChild>
          <Button
            ref={triggerRef}
            size={appearance === "card" ? "sm" : "toolbar"}
            variant="secondary"
            icon={<CalendarDays size={14} />}
            trailingIcon={<ChevronDown size={13} />}
            aria-label={label}
            id={id}
            disabled={busy || disabled}
            data-overdue={overdue}
            className={cn(
              "justify-start data-[overdue=true]:border-alert/20 data-[overdue=true]:bg-alert/5 data-[overdue=true]:text-alert",
              appearance === "card" ? "w-fit" : "w-full",
            )}
          >
            <span
              className={cn(
                "min-w-0 flex-1 truncate whitespace-nowrap text-left tabular-nums",
                value.dueOn ? "font-mono" : "font-sans",
              )}
            >
              {overdue ? "Vencida · " : ""}
              {formatDayMonthYear(value.dueOn) ??
                (appearance === "card" ? "Sin fecha" : "Elegir fecha")}
            </span>
          </Button>
        </PopoverTrigger>
        <PopoverContent
          ref={panelRef}
          container={container}
          aria-label="Elegir vencimiento"
          className="w-fit"
          onOpenAutoFocus={(event) => {
            const day =
              panelRef.current?.querySelector<HTMLButtonElement>("[data-selected-single=true]") ??
              panelRef.current?.querySelector<HTMLButtonElement>("[data-today=true]");
            if (day) {
              event.preventDefault();
              day.focus();
            }
          }}
        >
          <DayCalendar
            mode="single"
            required
            selected={selected}
            defaultMonth={selected ?? parseISO(period ? `${period}-01` : today)}
            startMonth={parseISO("1900-01-01")}
            endMonth={parseISO("2100-12-01")}
            today={parseISO(today)}
            disabled={busy}
            onSelect={(date) => {
              if (date) void save(format(date, "yyyy-MM-dd"));
            }}
          />
          <p className="px-3 pb-3 text-[12px] text-muted">
            El período se ajusta al mes de la fecha.
          </p>
          <div className="flex items-center justify-between border-t border-border-soft p-2">
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => void save(today)}>
              Hoy
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={busy || !value.dueOn}
              onClick={() => void save(null)}
            >
              Quitar fecha
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
