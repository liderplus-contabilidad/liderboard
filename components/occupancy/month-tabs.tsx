"use client";

import { CalendarRange, Moon } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/cn";
import { MONTHS_SHORT_ES } from "@/lib/date";
import { parseCurrency } from "@/lib/format";
import type { Frequency } from "@/lib/period";
import type { OccupancyDataset } from "@/lib/occupancy/types";

export interface MonthTabsProps {
  dataset: OccupancyDataset;
  activeIndex: number;
  /** "year" while the annual grid is showing; the month stays selected underneath it. */
  scope: "month" | "year";
  /** Which granularity the annual grid is drawn at, so its button reads as pressed. */
  frequency: Frequency;
  onSelect: (index: number) => void;
  onSelectScope: (scope: "month" | "year") => void;
  onSelectFrequency: (frequency: Frequency) => void;
  /** Absent in the consolidated view: the sucursales' declared nights are not summable. */
  onSaveNights?: (nights: number | null) => void;
}

/**
 * The three ways to read the whole year, coarsest last. They sit apart from the months because
 * they answer a different question — «el año entero, en qué tramos» — not «qué mes edito».
 */
const YEAR_VIEWS: { frequency: Frequency; label: string }[] = [
  { frequency: "trimestral", label: "Trim." },
  { frequency: "semestral", label: "Sem." },
  { frequency: "mensual", label: "Año" },
];

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
  frequency,
  onSelect,
  onSelectScope,
  onSelectFrequency,
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

      {YEAR_VIEWS.map((view, position) => {
        const isActive = scope === "year" && frequency === view.frequency;
        return (
          <button
            key={view.frequency}
            type="button"
            aria-pressed={isActive}
            // Pressing the granularity you are already on is the way back to the days.
            onClick={() => (isActive ? onSelectScope("month") : onSelectFrequency(view.frequency))}
            className={cn(
              // Set apart from the months: a different question, not a thirteenth month.
              "inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[12.5px] font-semibold transition-colors",
              position === 0 && "ml-1.5",
              isActive
                ? "border-brand bg-brand-soft text-brand"
                : "border-dashed border-border bg-surface text-muted hover:bg-canvas",
            )}
          >
            {position === 0 && <CalendarRange size={14} />}
            {view.label}
          </button>
        );
      })}

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
