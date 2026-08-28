"use client";

import { CalendarDays, CalendarRange, SlidersHorizontal, Tags } from "lucide-react";
import type { ReactNode } from "react";
import {
  Dropdown,
  DropdownChoice,
  DropdownNote,
  DropdownOption,
  DropdownPanel,
  DropdownTrigger,
} from "@/components/ui/dropdown";
import { ChipBar, FilterChip } from "@/components/ui/filter-chip";
import { Toolbar, ToolbarLabel } from "@/components/ui/toolbar";
import { MONTHS_FULL_ES, MONTHS_SHORT_ES } from "@/lib/date";
import { activeMarkCount } from "@/lib/sales/filters";
import { useSalesData } from "./sales-data-provider";

/**
 * «Ventas por servicio»' selection surface: **Año · Mes · Servicio**, the active marks, and the
 * page's actions on the right.
 *
 * It is ONE bar and not a title card plus a filter card: the title was already written by the
 * dashboard's header, and saying it twice made the reader look for a difference between the two.
 * What is left is what only this bar can say — what is marked and what can be done with it.
 *
 * The three marks admit several values. The year allows comparing series by month, and with no marks
 * it resolves to the most recent one; «Todos los años» marks them all instead of emptying, unlike the
 * months and the services, which follow the «no mark is all of them» rule.
 */
export function SalesToolbar({ actions }: { actions?: ReactNode }) {
  const {
    universe,
    filters,
    toggleYear,
    selectAllYears,
    toggleMonth,
    clearMonths,
    toggleService,
    clearServices,
  } = useSalesData();
  const marked = new Set(filters.months);
  const markedYears = new Set(filters.years);
  const markedServices = new Set(filters.services);
  const serviceName = (code: string) =>
    universe.services.find((service) => service.code === code)?.name ?? code;

  return (
    // EDGE TO EDGE and not a card: it is the same bar PyG hangs under its tabs —`Toolbar` inside a
    // `border-b`— and it reads as a continuation of the header instead of a control floating over
    // the page. A rounded card here looked like one enormous button.
    <div className="border-b border-border bg-surface">
      <Toolbar>
        {universe.years.length > 0 && (
          <>
            <ToolbarLabel icon={<SlidersHorizontal size={15} />}>Filtros</ToolbarLabel>

            <Dropdown>
              <DropdownTrigger active icon={<CalendarDays size={15} />}>
                {`Año · ${filters.years.join(", ") || "—"}`}
              </DropdownTrigger>
              <DropdownPanel width={230}>
                {universe.years.length > 1 && (
                  <div className="-mx-1 mb-1">
                    {/* It POPULATES the list, it does not empty it: here «no mark» means «the most
                        recent», so the shortcut has to mark them all for real. */}
                    <DropdownChoice
                      selected={markedYears.size === universe.years.length}
                      onSelect={selectAllYears}
                    >
                      Todos los años
                    </DropdownChoice>
                  </div>
                )}
                <div className="-mx-1 max-h-72 overflow-auto border-t border-border-soft pt-1.5">
                  {[...universe.years]
                    .sort((a, b) => b - a)
                    .map((year) => (
                      <DropdownOption
                        key={year}
                        selected={markedYears.has(year)}
                        onToggle={() => toggleYear(year)}
                      >
                        <span className="font-mono tabular-nums">{year}</span>
                      </DropdownOption>
                    ))}
                </div>
                {/* What marking several does is not obvious and is said here, which is where it is
                    decided. */}
                <DropdownNote>
                  Marca varios para comparar: cada año se dibuja como una serie sobre los mismos
                  meses.
                </DropdownNote>
              </DropdownPanel>
            </Dropdown>

            {universe.months.length > 0 && (
              <Dropdown>
                <DropdownTrigger active={marked.size > 0} icon={<CalendarRange size={15} />}>
                  {marked.size > 0
                    ? `Mes · ${filters.months.map((month) => MONTHS_SHORT_ES[month]).join(", ")}`
                    : "Mes"}
                </DropdownTrigger>
                <DropdownPanel width={230}>
                  <div className="-mx-1 mb-1">
                    <DropdownChoice selected={marked.size === 0} onSelect={clearMonths}>
                      Todos los meses cargados
                    </DropdownChoice>
                  </div>
                  <div className="-mx-1 max-h-72 overflow-auto border-t border-border-soft pt-1.5">
                    {universe.months.map((month) => (
                      <DropdownOption
                        key={month}
                        selected={marked.has(month)}
                        onToggle={() => toggleMonth(month)}
                      >
                        {MONTHS_FULL_ES[month]}
                      </DropdownOption>
                    ))}
                  </div>
                  {/* Only the months that arrived are listed: a mark that draws nothing when set
                      teaches you not to press the ones next to it. */}
                  <DropdownNote>Solo los meses con archivo cargado.</DropdownNote>
                </DropdownPanel>
              </Dropdown>
            )}

            {/* With ONE service in the catalogue there is nothing to choose: marking it would draw
                exactly what is already on screen. Same rule by which «Centro de costo» does not
                render in single-statement mode. */}
            {universe.services.length > 1 && (
              <Dropdown>
                <DropdownTrigger active={markedServices.size > 0} icon={<Tags size={15} />}>
                  {markedServices.size === 0
                    ? "Servicio"
                    : markedServices.size === 1
                      ? `Servicio · ${serviceName(filters.services[0])}`
                      : `Servicio · ${markedServices.size} de ${universe.services.length}`}
                </DropdownTrigger>
                <DropdownPanel width={300}>
                  <div className="-mx-1 mb-1">
                    <DropdownChoice selected={markedServices.size === 0} onSelect={clearServices}>
                      Todos los servicios
                    </DropdownChoice>
                  </div>
                  <div className="-mx-1 max-h-72 overflow-auto border-t border-border-soft pt-1.5">
                    {universe.services.map((service) => (
                      <DropdownOption
                        key={service.code}
                        selected={markedServices.has(service.code)}
                        onToggle={() => toggleService(service.code)}
                      >
                        {service.name}
                      </DropdownOption>
                    ))}
                  </div>
                  {/* Marking narrows EVERYTHING —the tiles and the three cards—, which is not
                      obvious and is said where it is decided. */}
                  <DropdownNote>
                    Acota toda la pantalla: cuánto vendió, quién lo paga y cómo evoluciona.
                  </DropdownNote>
                </DropdownPanel>
              </Dropdown>
            )}
          </>
        )}

        {actions && <div className="ml-auto flex shrink-0 items-center gap-2.5">{actions}</div>}
      </Toolbar>

      {activeMarkCount(filters) > 0 && (
        <ChipBar
          onClearAll={() => {
            clearMonths();
            clearServices();
          }}
          className="border-t border-border-soft bg-surface-sunken px-7 py-2.5"
        >
          {filters.months.map((month) => (
            <FilterChip
              key={month}
              label={MONTHS_FULL_ES[month]}
              onRemove={() => toggleMonth(month)}
            />
          ))}
          {filters.services.map((code) => (
            <FilterChip key={code} label={serviceName(code)} onRemove={() => toggleService(code)} />
          ))}
        </ChipBar>
      )}
    </div>
  );
}
