"use client";

import { Building2, CalendarDays, ChevronDown, SlidersHorizontal } from "lucide-react";
import { useState } from "react";
import { ChipBar, FilterChip } from "@/components/ui/filter-chip";
import {
  Dropdown,
  DropdownFooter,
  DropdownOption,
  DropdownPanel,
  DropdownTrigger,
} from "@/components/ui/dropdown";
import { Select } from "@/components/ui/select";
import { Toolbar, ToolbarLabel } from "@/components/ui/toolbar";
import { MONTHS_FULL_ES } from "@/lib/date";
import { colorForEntity } from "@/lib/charts/palette";
import {
  describeSelection,
  isWholeYearRange,
  periodLabel,
  pickLabel,
  rangeLabel,
  type PeriodMode,
} from "@/lib/occupancy/filters";
import { pickId } from "@/lib/occupancy/analytics/scope";
import { daysInMonth } from "@/lib/occupancy/derive";
import type { DateRef } from "@/lib/occupancy/analytics/types";
import { cn } from "@/lib/cn";
import { centerLogoOf } from "@/lib/logos";
import { useOccupancyData } from "./occupancy-data-provider";

/** Named, not implied: the reader has to know whether they asked for a total or a comparison. */
const PERIOD_MODES: { mode: PeriodMode; label: string }[] = [
  { mode: "rango", label: "Rango de fechas" },
  { mode: "comparar", label: "Comparar" },
];

const DAY_CELL =
  "rounded-md border border-border bg-surface py-1 text-[11.5px] font-semibold tabular-nums text-muted transition-colors hover:bg-canvas";
const DAY_CELL_ON = "border-brand bg-brand-soft text-brand";

/**
 * The day, picked from a grid that OPENS like a select instead of sitting in the panel: the month laid
 * out as squares is what makes the 20th one click away instead of a scrolled list, but two of these
 * open at once made the panel taller than the screen.
 *
 * `closeOnPick` is the difference between the two uses: an end of a span is ONE day, so picking it is
 * done; the comparison takes several days of the same month, so it stays open.
 */
function DaySelect({
  text,
  month,
  isOn,
  onPick,
  closeOnPick,
  wholeMonth,
}: {
  text: string;
  month: { year: number; monthIndex: number };
  isOn: (day: number) => boolean;
  onPick: (day: number) => void;
  closeOnPick: boolean;
  /** Present in the comparison tab: adds the month itself as one more column. */
  wholeMonth?: { active: boolean; onPick: () => void };
}) {
  const [open, setOpen] = useState(false);
  const days = daysInMonth(month.year, month.monthIndex);

  return (
    <span className="relative shrink-0">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className={cn(
          "inline-flex h-[34px] items-center justify-between gap-1.5 rounded-lg border bg-surface px-2.5 text-[13px] font-semibold tabular-nums transition-colors",
          open ? "border-brand text-brand" : "border-border text-ink hover:bg-canvas",
        )}
      >
        {text}
        <ChevronDown size={14} className={cn("text-faint", open && "rotate-180 text-brand")} />
      </button>

      {open && (
        <>
          {/* El mismo telón que usa `Dropdown`: pulsar fuera cierra, sin cerrar el panel que lo
              contiene — está dentro de su propio subárbol. */}
          <button
            type="button"
            aria-label="Cerrar los días"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-30 cursor-default"
          />
          <div className="absolute right-0 top-[38px] z-40 w-[264px] rounded-xl border border-border bg-surface p-2 shadow-[0_12px_32px_rgba(15,23,42,0.14)]">
            <div className="grid grid-cols-7 gap-1">
              {Array.from({ length: days }, (_, day) => (
                <button
                  key={day}
                  type="button"
                  aria-pressed={isOn(day)}
                  onClick={() => {
                    onPick(day);
                    if (closeOnPick) {
                      setOpen(false);
                    }
                  }}
                  className={cn(DAY_CELL, isOn(day) && DAY_CELL_ON)}
                >
                  {day + 1}
                </button>
              ))}
            </div>
            {wholeMonth && (
              <button
                type="button"
                aria-pressed={wholeMonth.active}
                onClick={wholeMonth.onPick}
                className={cn(
                  DAY_CELL,
                  "mt-1.5 w-full px-3 py-1.5 text-[12px]",
                  wholeMonth.active && DAY_CELL_ON,
                )}
              >
                Todo el mes
              </button>
            )}
          </div>
        </>
      )}
    </span>
  );
}

function MonthPicker({
  label,
  value,
  years,
  onChange,
}: {
  label: string;
  value: DateRef;
  years: readonly number[];
  onChange: (ref: DateRef) => void;
}) {
  const options = years.length > 0 ? years : [value.year];
  return (
    <span className="flex min-w-0 flex-1 flex-col gap-1">
      <span className="text-[10.5px] font-semibold uppercase tracking-[0.5px] text-faintest">
        {label}
      </span>
      <span className="flex gap-1.5">
        {/* El ancho va en un envoltorio, no en el `className` del Select: ése llega al `<select>` y el
            elemento flex es el `div` que lo envuelve, así que ahí `flex-1` no hacía nada. */}
        <span className="w-[76px] shrink-0">
          <Select
            size="sm"
            aria-label={`${label} · año`}
            className="w-full tabular-nums"
            value={String(value.year)}
            onChange={(event) => onChange({ ...value, year: Number(event.target.value) })}
            options={options.map((year) => ({ value: String(year), label: String(year) }))}
          />
        </span>
        <span className="min-w-0 flex-1">
          <Select
            size="sm"
            aria-label={`${label} · mes`}
            className="w-full"
            value={String(value.monthIndex)}
            onChange={(event) => onChange({ ...value, monthIndex: Number(event.target.value) })}
            options={MONTHS_FULL_ES.map((name, index) => ({ value: String(index), label: name }))}
          />
        </span>
      </span>
    </span>
  );
}

/**
 * The comparison is never declared — marking two sucursales is what produces one.
 *
 * Two controls: WHERE (sucursal) and WHEN (periodo). The period holds the year too, because the year
 * is part of a date now; and it holds the two ways of asking for one, named and explained:
 *
 * - «Rango de fechas»: a continuous span → the tiles give its total and the charts its evolution.
 * - «Comparar»: days AND whole months of any year → one column each, to compare them.
 *
 * Neither «Ver por» nor «Métrica» is here: they do not narrow anything, they choose how one section
 * reads. Each lives over what it governs.
 */
export function OccupancyToolbar() {
  const {
    datasets,
    centers,
    activeHotel,
    allYears,
    filters,
    toggleCenterMark,
    clearCenterMarks,
    clearAllMarks,
    setPeriodMode,
    setRangeEdge,
    clearRange,
    togglePick,
    clearPicks,
  } = useOccupancyData();
  const [draft, setDraft] = useState<DateRef | null>(null);

  if (datasets.length === 0) {
    return null;
  }

  const markedCenterNames = filters.centerIds.map(
    (id) => centers.find((center) => center.id === id)?.name ?? id,
  );
  const isRange = filters.periodMode === "rango";
  const narrowsPeriod = isRange ? !isWholeYearRange(filters.range) : filters.picks.length > 0;
  const colorOrder = centers.map((center) => center.id);
  const newDate = draft ?? filters.range.from;

  const chips: { key: string; label: string; dotColor?: string; onRemove: () => void }[] = [
    ...filters.centerIds.map((id) => ({
      key: `center:${id}`,
      label: centers.find((center) => center.id === id)?.name ?? id,
      dotColor: colorForEntity(id, colorOrder),
      onRemove: () => toggleCenterMark(id),
    })),
    // El tramo es UN chip: quitarlo es volver a todo el año, no destejer doce marcas.
    ...(isRange
      ? isWholeYearRange(filters.range)
        ? []
        : [{ key: "range", label: rangeLabel(filters.range), onRemove: clearRange }]
      : filters.picks.map((pick) => ({
          key: pickId(pick),
          label: pickLabel(pick),
          onRemove: () => togglePick(pick),
        }))),
  ];

  return (
    <div className="shrink-0 border-b border-border bg-surface">
      <Toolbar>
        <ToolbarLabel icon={<SlidersHorizontal size={14} />}>Filtros</ToolbarLabel>

        <Dropdown>
          <DropdownTrigger icon={<Building2 size={15} />} active={filters.centerIds.length > 0}>
            {filters.centerIds.length > 0
              ? `Sucursal · ${filters.centerIds.length}`
              : "Todas las sucursales"}
          </DropdownTrigger>
          <DropdownPanel width={260}>
            {centers.map((center) => {
              const logo = centerLogoOf(activeHotel?.centerLogos, center.id);
              return (
                <DropdownOption
                  key={center.id}
                  selected={filters.centerIds.includes(center.id)}
                  onToggle={() => toggleCenterMark(center.id)}
                >
                  <span className="inline-flex items-center gap-2">
                    {/* La miniatura solo donde hay logo: reservarle hueco a todas las filas
                        sangraría la lista por un espacio que casi nunca se llena. */}
                    {logo && (
                      // oxlint-disable-next-line next/no-img-element
                      <img
                        src={logo.dataUrl}
                        alt=""
                        width={logo.width}
                        height={logo.height}
                        className="size-4 shrink-0 rounded-[3px] object-contain"
                      />
                    )}
                    {center.name}
                  </span>
                </DropdownOption>
              );
            })}
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
          <DropdownTrigger icon={<CalendarDays size={15} />} active={narrowsPeriod}>
            {periodLabel(filters)}
          </DropdownTrigger>
          <DropdownPanel width={420}>
            <div className="mb-1 flex gap-1 rounded-lg bg-surface-sunken p-1">
              {PERIOD_MODES.map((option) => {
                const on = filters.periodMode === option.mode;
                return (
                  <button
                    key={option.mode}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setPeriodMode(option.mode)}
                    className={cn(
                      "flex-1 rounded-md px-2 py-1.5 text-[12.5px] font-semibold transition-colors",
                      on
                        ? "bg-surface text-brand shadow-sm"
                        : "text-muted hover:bg-surface/60 hover:text-ink",
                    )}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
            <p className="mb-3 px-0.5 text-[11px] leading-relaxed text-faint">
              {isRange
                ? "Un tramo continuo: las tarjetas dan su total y las gráficas su evolución."
                : "Elige días o meses enteros, de cualquier año: cada uno es una columna que se compara con las otras."}
            </p>

            {isRange ? (
              <>
                <div className="flex flex-col gap-2.5">
                  {(["from", "to"] as const).map((edge) => {
                    const value = filters.range[edge];
                    return (
                      <span key={edge} className="flex w-full items-end gap-1.5">
                        <MonthPicker
                          label={edge === "from" ? "Desde" : "Hasta"}
                          value={value}
                          years={allYears}
                          onChange={(ref) => setRangeEdge(edge, ref)}
                        />
                        <DaySelect
                          text={String(value.day + 1)}
                          month={value}
                          isOn={(day) => day === value.day}
                          onPick={(day) => setRangeEdge(edge, { ...value, day })}
                          closeOnPick
                        />
                      </span>
                    );
                  })}
                </div>
                {/* Escrito en palabras: dos pares de selectores no dicen el tramo que forman. */}
                <p className="mt-3 rounded-lg bg-brand-soft px-3 py-2 text-[12px] font-semibold text-brand">
                  {rangeLabel(filters.range)}
                </p>
                <DropdownFooter>
                  <button
                    type="button"
                    onClick={clearRange}
                    className="text-[12px] font-semibold text-muted hover:text-ink"
                  >
                    Todo el año
                  </button>
                  <span className="text-[11px] text-faint">Puede cruzar años</span>
                </DropdownFooter>
              </>
            ) : (
              <>
                <span className="flex w-full items-end gap-1.5">
                  <MonthPicker
                    label="Elegir de"
                    value={newDate}
                    years={allYears}
                    onChange={setDraft}
                  />
                  {/* Un clic agrega o quita, y se queda abierto: normalmente se eligen varios días del
                      mismo mes. «Todo el mes» sale de la misma rejilla, no de una pestaña aparte. */}
                  <DaySelect
                    text="Elegir días"
                    month={newDate}
                    isOn={(day) =>
                      filters.picks.some(
                        (pick) =>
                          pick.kind === "dia" &&
                          pick.year === newDate.year &&
                          pick.monthIndex === newDate.monthIndex &&
                          pick.day === day,
                      )
                    }
                    onPick={(day) => togglePick({ kind: "dia", ...newDate, day })}
                    closeOnPick={false}
                    wholeMonth={{
                      active: filters.picks.some(
                        (pick) =>
                          pick.kind === "mes" &&
                          pick.year === newDate.year &&
                          pick.monthIndex === newDate.monthIndex,
                      ),
                      onPick: () =>
                        togglePick({
                          kind: "mes",
                          year: newDate.year,
                          monthIndex: newDate.monthIndex,
                        }),
                    }}
                  />
                </span>

                {filters.picks.length > 0 ? (
                  <ul className="mt-3 flex flex-wrap gap-1.5">
                    {filters.picks.map((pick) => (
                      <li key={pickId(pick)}>
                        <FilterChip label={pickLabel(pick)} onRemove={() => togglePick(pick)} />
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-3 rounded-lg border border-dashed border-border px-3 py-2.5 text-[11.5px] text-faint">
                    Sin nada elegido: las gráficas siguen mostrando el rango. Elige dos o más —días,
                    meses o una mezcla— para compararlos.
                  </p>
                )}

                <DropdownFooter>
                  <button
                    type="button"
                    onClick={clearPicks}
                    disabled={filters.picks.length === 0}
                    className="text-[12px] font-semibold text-muted hover:text-ink disabled:text-faintest"
                  >
                    Quitar todo
                  </button>
                  <span className="text-[11px] text-faint">Una columna por periodo</span>
                </DropdownFooter>
              </>
            )}
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
