"use client";

import { CalendarDays, CalendarRange, Users } from "lucide-react";
import { ChipBar, FilterChip } from "@/components/ui/filter-chip";
import { Dropdown, DropdownOption, DropdownPanel, DropdownTrigger } from "@/components/ui/dropdown";
import { cn } from "@/lib/cn";
import { MONTHS_FULL_ES, MONTHS_SHORT_ES } from "@/lib/date";
import { activeMarkCount, type SalariesFilters } from "@/lib/payroll/salaries/filters";
import type { SalariesUniverse } from "@/lib/payroll/salaries/filters";

export interface SalariesToolbarProps {
  universe: SalariesUniverse;
  filters: SalariesFilters;
  onToggleArea: (area: string) => void;
  onToggleYear: (year: number) => void;
  onToggleMonth: (monthIndex: number) => void;
  onClearAreas: () => void;
  onClearYears: () => void;
  onClearMonths: () => void;
  onClearAll: () => void;
}

/**
 * Sueldos por Áreas' ONLY selection surface: Área · Año · Mes, and below it the strip of active
 * marks.
 *
 * The three follow the same rule as the rest of the app —no mark is the same as all of them, and the
 * «Todas/Todos» shortcut empties the list instead of marking everything— and none of them declares
 * the table's MODE: that marking exactly one area gives the per-employee detail is read off the marks
 * (`resolveAreaMode`), not off a separate control that could contradict them.
 */
export function SalariesToolbar({
  universe,
  filters,
  onToggleArea,
  onToggleYear,
  onToggleMonth,
  onClearAreas,
  onClearYears,
  onClearMonths,
  onClearAll,
}: SalariesToolbarProps) {
  const areas = new Set(filters.areas);
  const years = new Set(filters.years);
  const months = new Set(filters.months);

  return (
    <div className="rounded-[13px] border border-border bg-surface">
      <div className="flex flex-wrap items-center gap-2.5 px-[18px] py-3">
        <span className="text-[10.5px] font-semibold uppercase tracking-[0.5px] text-faint">
          Filtros
        </span>

        {universe.areas.length > 0 && (
          <Dropdown>
            <DropdownTrigger active={areas.size > 0} icon={<Users size={15} />}>
              {areas.size === 1
                ? `Área · ${filters.areas[0]}`
                : areas.size > 1
                  ? `Área · ${areas.size}`
                  : "Área"}
            </DropdownTrigger>
            <DropdownPanel width={260}>
              <AllOption
                label="Todas las áreas"
                active={areas.size === 0}
                onSelect={onClearAreas}
              />
              <div className="-mx-1 max-h-72 overflow-auto border-t border-border-soft pt-1.5">
                {universe.areas.map((area) => (
                  <DropdownOption
                    key={area}
                    selected={areas.has(area)}
                    onToggle={() => onToggleArea(area)}
                  >
                    {area}
                  </DropdownOption>
                ))}
              </div>
              {/* What the screen does on marking a single one is not obvious and is said here, which
                  is where it is decided, instead of letting the user find out by accident. */}
              <p className="mt-1.5 border-t border-border-soft px-1 pt-1.5 text-[11px] leading-snug text-faint">
                Marca una sola para ver sus empleados uno por uno.
              </p>
            </DropdownPanel>
          </Dropdown>
        )}

        {universe.years.length > 0 && (
          <Dropdown>
            <DropdownTrigger active={years.size > 0} icon={<CalendarDays size={15} />}>
              {years.size > 0
                ? `Año · ${[...filters.years].sort((a, b) => b - a).join(", ")}`
                : "Año"}
            </DropdownTrigger>
            <DropdownPanel width={200}>
              <AllOption label="Todos los años" active={years.size === 0} onSelect={onClearYears} />
              <div className="-mx-1 max-h-72 overflow-auto border-t border-border-soft pt-1.5">
                {[...universe.years]
                  .sort((a, b) => b - a)
                  .map((year) => (
                    <DropdownOption
                      key={year}
                      selected={years.has(year)}
                      onToggle={() => onToggleYear(year)}
                    >
                      <span className="font-mono tabular-nums">{year}</span>
                    </DropdownOption>
                  ))}
              </div>
            </DropdownPanel>
          </Dropdown>
        )}

        {universe.months.length > 0 && (
          <Dropdown>
            <DropdownTrigger active={months.size > 0} icon={<CalendarRange size={15} />}>
              {months.size > 0
                ? `Mes · ${filters.months.map((month) => MONTHS_SHORT_ES[month]).join(", ")}`
                : "Mes"}
            </DropdownTrigger>
            <DropdownPanel width={200}>
              <AllOption
                label="Todos los meses"
                active={months.size === 0}
                onSelect={onClearMonths}
              />
              <div className="-mx-1 max-h-72 overflow-auto border-t border-border-soft pt-1.5">
                {universe.months.map((month) => (
                  <DropdownOption
                    key={month}
                    selected={months.has(month)}
                    onToggle={() => onToggleMonth(month)}
                  >
                    {MONTHS_FULL_ES[month]}
                  </DropdownOption>
                ))}
              </div>
            </DropdownPanel>
          </Dropdown>
        )}
      </div>

      {activeMarkCount(filters) > 0 && (
        <ChipBar
          onClearAll={onClearAll}
          className="border-t border-border-soft bg-surface-sunken px-[18px] py-2.5"
        >
          {filters.areas.map((area) => (
            <FilterChip key={`area-${area}`} label={area} onRemove={() => onToggleArea(area)} />
          ))}
          {filters.years.map((year) => (
            <FilterChip
              key={`year-${year}`}
              label={String(year)}
              onRemove={() => onToggleYear(year)}
            />
          ))}
          {filters.months.map((month) => (
            <FilterChip
              key={`month-${month}`}
              label={MONTHS_FULL_ES[month]}
              onRemove={() => onToggleMonth(month)}
            />
          ))}
        </ChipBar>
      )}
    </div>
  );
}

/** The «all» shortcut: it empties the list, which is how this app writes «no filter». */
function AllOption({
  label,
  active,
  onSelect,
}: {
  label: string;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <div className="-mx-1 mb-1">
      <button
        type="button"
        onClick={onSelect}
        className={cn(
          "flex w-full items-center rounded-lg px-2 py-1.5 text-left text-[12.5px] transition-colors",
          active ? "bg-brand-soft font-medium text-brand" : "text-ink hover:bg-canvas",
        )}
      >
        {label}
      </button>
    </div>
  );
}
