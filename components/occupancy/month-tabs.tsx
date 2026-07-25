"use client";

import { CalendarRange, Moon } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/cn";
import { MONTHS_SHORT_ES } from "@/lib/date";
import { parseCurrency } from "@/lib/format";
import type { OccupancyDataset } from "@/lib/occupancy/types";

export interface MonthTabsProps {
  dataset: OccupancyDataset;
  activeIndex: number;
  /** "year" while the annual grid is showing; the month stays selected underneath it. */
  scope: "month" | "year";
  onSelect: (index: number) => void;
  onSelectScope: (scope: "month" | "year") => void;
  /** Absent in the consolidated view: the sucursales' declared nights are not summable. */
  onSaveNights?: (nights: number | null) => void;
}

/** A month is "filled" once it came from a file or has any room sold. */
function hasData(dataset: OccupancyDataset, index: number): boolean {
  const month = dataset.months[index];
  return Boolean(month?.fromFile) || Boolean(month?.inputs.sold.some((value) => value !== 0));
}

/**
 * The MES selector plus the month's declared "Nº de noches". The nights figure is kept
 * because the source workbooks carry it, but it is informational: the grid is always sized
 * by the real calendar (the files get this wrong — JUNIO declares 31).
 */
export function MonthTabs({
  dataset,
  activeIndex,
  scope,
  onSelect,
  onSelectScope,
  onSaveNights,
}: MonthTabsProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const nights = dataset.months[activeIndex]?.nights ?? null;

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <span className="mr-0.5 text-[10.5px] font-semibold uppercase tracking-[0.6px] text-faintest">
        Mes
      </span>

      {MONTHS_SHORT_ES.map((label, index) => {
        const isActive = scope === "month" && index === activeIndex;
        const filled = hasData(dataset, index);
        return (
          <button
            key={label}
            type="button"
            aria-pressed={isActive}
            onClick={() => onSelect(index)}
            className={cn(
              "rounded-lg border px-2.5 py-1.5 text-[12.5px] font-semibold transition-colors",
              isActive
                ? "border-brand bg-brand-soft text-brand"
                : filled
                  ? "border-border bg-surface text-ink-soft hover:bg-canvas"
                  : "border-border bg-surface text-faintest hover:bg-canvas",
            )}
          >
            {label}
          </button>
        );
      })}

      <button
        type="button"
        aria-pressed={scope === "year"}
        onClick={() => onSelectScope(scope === "year" ? "month" : "year")}
        className={cn(
          // Set apart from the months: it is a different question, not a thirteenth month.
          "ml-1.5 inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[12.5px] font-semibold transition-colors",
          scope === "year"
            ? "border-brand bg-brand-soft text-brand"
            : "border-dashed border-border bg-surface text-muted hover:bg-canvas",
        )}
      >
        <CalendarRange size={14} />
        Año
      </button>

      <span className="flex-1" />

      <label className="inline-flex items-center gap-2 whitespace-nowrap text-[11.5px] font-semibold text-faint">
        <Moon size={14} />
        Nº de noches
        <input
          disabled={!onSaveNights}
          inputMode="numeric"
          value={draft ?? (nights === null ? "" : String(nights))}
          onFocus={(e) => {
            setDraft(nights === null ? "" : String(nights));
            e.target.select();
          }}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={(e) => {
            onSaveNights?.(parseCurrency(e.target.value));
            setDraft(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.currentTarget.blur();
            } else if (e.key === "Escape") {
              setDraft(null);
              e.currentTarget.blur();
            }
          }}
          className="w-[58px] rounded-lg border border-border bg-surface px-2.5 py-1.5 text-right text-[13px] font-semibold tabular-nums text-ink outline-none focus:border-brand disabled:text-faintest"
        />
      </label>
    </div>
  );
}
