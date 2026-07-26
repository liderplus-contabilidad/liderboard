"use client";

import { Building2, CalendarRange, Gauge, SlidersHorizontal } from "lucide-react";
import { ChipBar, FilterChip } from "@/components/ui/filter-chip";
import {
  Dropdown,
  DropdownFooter,
  DropdownOption,
  DropdownPanel,
  DropdownTrigger,
} from "@/components/ui/dropdown";
import { Toolbar, ToolbarLabel } from "@/components/ui/toolbar";
import { MONTHS_SHORT_ES } from "@/lib/date";
import { colorForEntity } from "@/lib/charts/palette";
import { describeSelection, isPeriodMarked, periodLabel } from "@/lib/occupancy/filters";
import { periodFullLabel, periodLabels, type Frequency } from "@/lib/period";
import { METRICS } from "@/lib/occupancy/analytics/types";
import { occupancySeriesId } from "@/lib/occupancy/analytics/types";
import { cn } from "@/lib/cn";
import { useOccupancyData } from "./occupancy-data-provider";

const PERIOD_CELL =
  "rounded-lg border border-border bg-surface px-2 py-1.5 text-[12.5px] font-semibold text-muted transition-colors hover:bg-canvas";
const PERIOD_CELL_ON = "border-brand bg-brand-soft text-brand";

/**
 * The quarter/semester shortcuts. They are NOT a second kind of mark: each one just marks its
 * own months, so the chips, the sanitation and the engine keep seeing months and nothing else.
 */
const SHORTCUTS: { frequency: Frequency; index: number; label: string; name: string }[] = [
  ...periodLabels("trimestral").map((label, index) => ({
    frequency: "trimestral" as const,
    index,
    label,
    name: periodFullLabel("trimestral", index),
  })),
  ...periodLabels("semestral").map((label, index) => ({
    frequency: "semestral" as const,
    index,
    label,
    name: periodFullLabel("semestral", index),
  })),
];

/**
 * Ocupaciones' filter row: Métrica · Sucursal · Año · Periodo, with the active-mark chips below.
 * The comparison is never declared — marking two sucursales, two years or two months is itself
 * what produces it.
 *
 * «Ver por» is deliberately NOT here: it only swaps the axis of the series card, and every
 * control in this bar feeds every card on the tab. It lives in that card's own header.
 *
 * The métrica is the one single-choice control here: ocupación is a %, ADR is money and PAX is
 * a count, so a card holding two of them at once would need a second Y axis.
 */
export function OccupancyToolbar() {
  const {
    datasets,
    centers,
    allYears,
    filters,
    setMetric,
    toggleCenterMark,
    toggleYearMark,
    toggleMonthMark,
    togglePeriodMark,
    toggleDayMark,
    clearCenterMarks,
    clearYearMarks,
    clearMonthMarks,
    clearDayMarks,
    clearAllMarks,
  } = useOccupancyData();

  if (datasets.length === 0) {
    return null;
  }

  const metric = METRICS.find((candidate) => candidate.id === filters.metric) ?? METRICS[0];
  const markedCenterNames = filters.centerIds.map(
    (id) => centers.find((center) => center.id === id)?.name ?? id,
  );
  const colorOrder = datasets.map((dataset) =>
    occupancySeriesId({ centerId: dataset.centerId, year: dataset.year }),
  );
  const chips: { key: string; label: string; dotColor?: string; onRemove: () => void }[] = [
    ...filters.centerIds.map((id) => ({
      key: `center:${id}`,
      label: centers.find((center) => center.id === id)?.name ?? id,
      // The dot is the color that sucursal actually carries in the charts, whichever year.
      dotColor: colorForEntity(
        colorOrder.find((entry) => entry.startsWith(`${id}|`)) ?? id,
        colorOrder,
      ),
      onRemove: () => toggleCenterMark(id),
    })),
    ...filters.years.map((year) => ({
      key: `year:${year}`,
      label: String(year),
      onRemove: () => toggleYearMark(year),
    })),
    ...filters.months.map((month) => ({
      key: `month:${month}`,
      label: MONTHS_SHORT_ES[month],
      onRemove: () => toggleMonthMark(month),
    })),
    ...filters.days.map((day) => ({
      // "día 5", not "5 ene": with two months marked the same day mark applies to both.
      key: `day:${day}`,
      label: `día ${day + 1}`,
      onRemove: () => toggleDayMark(day),
    })),
  ];

  return (
    <div className="shrink-0 border-b border-border bg-surface">
      <Toolbar>
        <ToolbarLabel icon={<SlidersHorizontal size={14} />}>Filtros</ToolbarLabel>

        <Dropdown>
          <DropdownTrigger icon={<Gauge size={15} />} active>
            {metric.label}
          </DropdownTrigger>
          <DropdownPanel width={260}>
            {METRICS.map((option) => (
              <DropdownOption
                key={option.id}
                selected={option.id === filters.metric}
                onToggle={() => setMetric(option.id)}
              >
                {option.label}
                <span className="ml-1.5 text-[11px] text-faint">{option.hint}</span>
              </DropdownOption>
            ))}
          </DropdownPanel>
        </Dropdown>

        <Dropdown>
          <DropdownTrigger icon={<Building2 size={15} />} active={filters.centerIds.length > 0}>
            {filters.centerIds.length > 0
              ? `Sucursal · ${filters.centerIds.length}`
              : "Todas las sucursales"}
          </DropdownTrigger>
          <DropdownPanel width={260}>
            {centers.map((center) => (
              <DropdownOption
                key={center.id}
                selected={filters.centerIds.includes(center.id)}
                onToggle={() => toggleCenterMark(center.id)}
              >
                {center.name}
              </DropdownOption>
            ))}
            <DropdownFooter>
              <button
                type="button"
                onClick={clearCenterMarks}
                className="text-[12px] font-semibold text-muted hover:text-ink"
              >
                Quitar selección
              </button>
            </DropdownFooter>
          </DropdownPanel>
        </Dropdown>

        <Dropdown>
          <DropdownTrigger icon={<CalendarRange size={15} />} active={filters.years.length > 0}>
            {filters.years.length > 0 ? filters.years.join(" · ") : "Todos los años"}
          </DropdownTrigger>
          <DropdownPanel width={200}>
            {allYears.map((year) => (
              <DropdownOption
                key={year}
                selected={filters.years.includes(year)}
                onToggle={() => toggleYearMark(year)}
              >
                {year}
              </DropdownOption>
            ))}
            <DropdownFooter>
              <button
                type="button"
                onClick={clearYearMarks}
                className="text-[12px] font-semibold text-muted hover:text-ink"
              >
                Quitar selección
              </button>
              <span className="text-[11px] text-faint">Marca dos para compararlos</span>
            </DropdownFooter>
          </DropdownPanel>
        </Dropdown>

        <Dropdown>
          <DropdownTrigger active={filters.months.length > 0 || filters.days.length > 0}>
            {periodLabel(filters.months, filters.days)}
          </DropdownTrigger>
          <DropdownPanel width={300}>
            <p className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.5px] text-faintest">
              1 · Atajos
            </p>
            <div className="flex gap-1">
              {SHORTCUTS.map(({ frequency, index, label, name }) => (
                <button
                  key={label}
                  type="button"
                  // «T1» is unreadable on its own: the full name is what hover and a screen
                  // reader get, so the button can stay narrow enough to fit six in a row.
                  title={name}
                  aria-label={name}
                  aria-pressed={isPeriodMarked(filters, frequency, index)}
                  onClick={() => togglePeriodMark(frequency, index)}
                  className={cn(
                    PERIOD_CELL,
                    "flex-1 px-0 tabular-nums",
                    // The semesters start a group of their own: S1 is not a fifth quarter.
                    frequency === "semestral" && index === 0 && "ml-2",
                    isPeriodMarked(filters, frequency, index) && PERIOD_CELL_ON,
                  )}
                >
                  {label}
                </button>
              ))}
            </div>

            <p className="mb-1.5 mt-3 text-[10.5px] font-semibold uppercase tracking-[0.5px] text-faintest">
              2 · Mes
            </p>
            <div className="grid grid-cols-4 gap-1">
              {MONTHS_SHORT_ES.map((label, month) => (
                <button
                  key={label}
                  type="button"
                  aria-pressed={filters.months.includes(month)}
                  onClick={() => toggleMonthMark(month)}
                  className={cn(PERIOD_CELL, filters.months.includes(month) && PERIOD_CELL_ON)}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="mb-1.5 mt-3 flex items-baseline justify-between gap-2">
              <p className="text-[10.5px] font-semibold uppercase tracking-[0.5px] text-faintest">
                3 · Día del mes
              </p>
              <p className="text-[10.5px] text-faint">
                {filters.months.length === 0
                  ? "elige un mes arriba"
                  : "opcional · compara ese día entre años"}
              </p>
            </div>
            <div className="grid grid-cols-8 gap-1">
              {Array.from({ length: 31 }, (_, day) => (
                <button
                  key={day}
                  type="button"
                  disabled={filters.months.length === 0}
                  aria-pressed={filters.days.includes(day)}
                  onClick={() => toggleDayMark(day)}
                  className={cn(
                    PERIOD_CELL,
                    "px-0 tabular-nums disabled:cursor-not-allowed disabled:border-border-faint disabled:bg-surface disabled:text-faintest disabled:hover:bg-surface",
                    filters.days.includes(day) && PERIOD_CELL_ON,
                  )}
                >
                  {day + 1}
                </button>
              ))}
            </div>

            <DropdownFooter>
              <button
                type="button"
                onClick={() => {
                  clearDayMarks();
                  clearMonthMarks();
                }}
                className="text-[12px] font-semibold text-muted hover:text-ink"
              >
                Quitar selección
              </button>
              {filters.days.length > 0 && (
                <span className="text-[11px] text-faint">
                  El eje pasa a esos días de cada mes marcado
                </span>
              )}
            </DropdownFooter>
          </DropdownPanel>
        </Dropdown>
      </Toolbar>

      <p className="px-7 pb-2 text-[11.5px] text-muted">
        <span className="font-semibold uppercase tracking-[0.4px] text-faintest">Mostrando</span>{" "}
        {describeSelection(filters, markedCenterNames)}
      </p>

      {chips.length > 0 && (
        <ChipBar onClearAll={clearAllMarks} className="px-7 pb-3">
          {chips.map((chip) => (
            <FilterChip
              key={chip.key}
              label={chip.label}
              dotColor={chip.dotColor}
              onRemove={chip.onRemove}
            />
          ))}
        </ChipBar>
      )}
    </div>
  );
}
