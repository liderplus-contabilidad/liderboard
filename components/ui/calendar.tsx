"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import {
  monthGrid,
  monthOf,
  monthTitle,
  shiftMonth,
  WEEKDAYS_SHORT_ES,
  type YearMonth,
} from "@/lib/calendar";

/**
 * The app's month grid: a header that pages month by month, the weekday row and six weeks of
 * cells. It picks ONE day and knows nothing about where it is mounted — a popover under a bar
 * control (Cuentas por Pagar's «Corte»), a form field — so the same calendar reads the same
 * everywhere the native `<input type="date">` used to paint the browser's own.
 *
 * The month on screen is local state seeded by `value`: paging is browsing, not choosing, and a
 * pick that lands in another month re-seeds it through `key` or a remount, never through an
 * effect.
 */
export function Calendar({
  value,
  today,
  onChange,
}: {
  /** ISO `yyyy-mm-dd`, the marked day; `null` marks none. */
  value: string | null;
  /** ISO `yyyy-mm-dd`, ringed so the reader always sees where «hoy» is. */
  today: string;
  onChange: (iso: string) => void;
}) {
  const [month, setMonth] = useState<YearMonth>(() => monthOf(value ?? today));
  const weeks = monthGrid(month);

  return (
    <div className="w-[252px] select-none">
      <div className="mb-2 flex items-center justify-between">
        <Button
          variant="ghost"
          size="sm"
          iconOnly
          aria-label="Mes anterior"
          icon={<ChevronLeft size={15} />}
          onClick={() => setMonth((m) => shiftMonth(m, -1))}
        />
        <span className="text-[12.5px] font-semibold text-ink">{monthTitle(month)}</span>
        <Button
          variant="ghost"
          size="sm"
          iconOnly
          aria-label="Mes siguiente"
          icon={<ChevronRight size={15} />}
          onClick={() => setMonth((m) => shiftMonth(m, 1))}
        />
      </div>

      <div className="grid grid-cols-7">
        {WEEKDAYS_SHORT_ES.map((weekday, index) => (
          <span
            key={index}
            className="h-7 text-center text-[10.5px] font-semibold uppercase leading-7 tracking-[0.5px] text-faint"
          >
            {weekday}
          </span>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-y-0.5">
        {weeks.flat().map((cell) => {
          const selected = cell.iso === value;
          const isToday = cell.iso === today;
          return (
            <button
              key={cell.iso}
              type="button"
              aria-pressed={selected}
              aria-label={cell.iso}
              onClick={() => onChange(cell.iso)}
              className={cn(
                "mx-auto flex h-8 w-8 items-center justify-center rounded-[9px] font-mono text-[12.5px] tabular-nums transition-colors",
                selected
                  ? "bg-brand font-semibold text-white"
                  : cell.inMonth
                    ? "text-ink hover:bg-canvas"
                    : "text-faintest hover:bg-canvas",
                isToday && !selected && "ring-1 ring-inset ring-brand text-brand font-semibold",
              )}
            >
              {cell.day}
            </button>
          );
        })}
      </div>
    </div>
  );
}
