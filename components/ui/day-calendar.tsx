"use client";

import { useEffect, useRef, type ComponentProps } from "react";
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { DayPicker, getDefaultClassNames, type DayButton } from "react-day-picker";
import { es } from "react-day-picker/locale";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";

/** shadcn Calendar adapted to the dashboard's tokens and Button primitive. */
export function DayCalendar({
  className,
  classNames,
  components,
  ...props
}: ComponentProps<typeof DayPicker>) {
  const defaults = getDefaultClassNames();
  return (
    <DayPicker
      showOutsideDays
      fixedWeeks
      locale={es}
      weekStartsOn={1}
      captionLayout="dropdown"
      className={cn("w-fit bg-surface p-3", className)}
      classNames={{
        root: cn("w-fit", defaults.root),
        months: cn("relative flex flex-col", defaults.months),
        month: cn("flex w-full flex-col gap-3", defaults.month),
        nav: cn("absolute inset-x-0 top-0 flex items-center justify-between", defaults.nav),
        button_previous: cn(
          "flex size-8 items-center justify-center rounded-[9px] text-muted hover:bg-canvas focus-visible:outline-2 focus-visible:outline-brand disabled:opacity-50",
          defaults.button_previous,
        ),
        button_next: cn(
          "flex size-8 items-center justify-center rounded-[9px] text-muted hover:bg-canvas focus-visible:outline-2 focus-visible:outline-brand disabled:opacity-50",
          defaults.button_next,
        ),
        month_caption: cn("flex h-8 items-center justify-center px-8", defaults.month_caption),
        dropdowns: cn("flex items-center gap-1.5", defaults.dropdowns),
        dropdown_root: cn(
          "relative rounded-[9px] border border-border bg-surface focus-within:border-brand focus-within:ring-2 focus-within:ring-brand-soft",
          defaults.dropdown_root,
        ),
        dropdown: cn("absolute inset-0 cursor-pointer bg-surface opacity-0", defaults.dropdown),
        caption_label: cn(
          "flex h-8 items-center gap-1 px-2 text-[12px] font-semibold text-ink tabular-nums",
          defaults.caption_label,
        ),
        month_grid: cn("w-full border-collapse", defaults.month_grid),
        weekdays: cn("flex", defaults.weekdays),
        weekday: cn("flex-1 text-center text-[11px] font-medium text-muted", defaults.weekday),
        week: cn("mt-1 flex w-full", defaults.week),
        day: cn("group/day relative size-8 p-0 text-center", defaults.day),
        hidden: cn("invisible", defaults.hidden),
        ...classNames,
      }}
      components={{
        Chevron: ({ orientation }) =>
          orientation === "left" ? (
            <ChevronLeft size={15} />
          ) : orientation === "right" ? (
            <ChevronRight size={15} />
          ) : (
            <ChevronDown size={13} />
          ),
        DayButton: CalendarDayButton,
        ...components,
      }}
      {...props}
    />
  );
}

function CalendarDayButton({
  className,
  day,
  modifiers,
  ...props
}: ComponentProps<typeof DayButton>) {
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (modifiers.focused) ref.current?.focus();
  }, [modifiers.focused]);
  return (
    <Button
      ref={ref}
      size="sm"
      variant="ghost"
      data-day={format(day.date, "yyyy-MM-dd")}
      data-selected-single={modifiers.selected}
      data-today={modifiers.today}
      data-outside={modifiers.outside}
      className={cn(
        "w-8 px-0 font-mono text-[12px] tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-brand data-[outside=true]:text-faint data-[today=true]:ring-1 data-[today=true]:ring-inset data-[today=true]:ring-brand data-[selected-single=true]:bg-brand data-[selected-single=true]:text-surface data-[selected-single=true]:hover:bg-brand-hover data-[selected-single=true]:hover:text-surface",
        className,
      )}
      {...props}
    />
  );
}
