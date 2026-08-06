"use client";

import { CalendarDays } from "lucide-react";
import { Dropdown, DropdownOption, DropdownPanel, DropdownTrigger } from "@/components/ui/dropdown";
import { cn } from "@/lib/cn";

export interface PayrollYearFilterProps {
  /** Every year the cliente holds; rendered NEWEST FIRST. */
  years: readonly number[];
  selected: readonly number[];
  onToggle: (year: number) => void;
  /** "Todos los años": clears the selection rather than marking every year. */
  onSelectAll: () => void;
}

/**
 * "Año" filter for Historial de nómina: one checkbox per año with a período, plus a "Todos los
 * años" shortcut standing in for "nothing marked" — the same rule `profit-loss/year-filter.tsx`
 * follows. It drops that file's borrado action on purpose: a año here is not a record of its own
 * to delete, only a group of períodos, and there is no "borrar el año" gesture in this module.
 */
export function PayrollYearFilter({
  years,
  selected,
  onToggle,
  onSelectAll,
}: PayrollYearFilterProps) {
  if (years.length === 0) {
    return null;
  }
  const picked = new Set(selected);
  const newestFirst = [...years].sort((a, b) => b - a);

  return (
    <Dropdown>
      <DropdownTrigger active={picked.size > 0} icon={<CalendarDays size={15} />}>
        {picked.size > 0 ? `Año · ${[...picked].sort((a, b) => b - a).join(", ")}` : "Año"}
      </DropdownTrigger>
      <DropdownPanel width={200}>
        <div className="-mx-1 mb-1">
          <button
            type="button"
            onClick={onSelectAll}
            className={cn(
              "flex w-full items-center rounded-lg px-2 py-1.5 text-left text-[12.5px] transition-colors",
              picked.size === 0
                ? "bg-brand-soft font-medium text-brand"
                : "text-ink hover:bg-canvas",
            )}
          >
            Todos los años
          </button>
        </div>
        <div className="-mx-1 max-h-72 overflow-auto border-t border-border-soft pt-1.5">
          {newestFirst.map((year) => (
            <DropdownOption key={year} selected={picked.has(year)} onToggle={() => onToggle(year)}>
              <span className="font-mono tabular-nums">{year}</span>
            </DropdownOption>
          ))}
        </div>
      </DropdownPanel>
    </Dropdown>
  );
}
