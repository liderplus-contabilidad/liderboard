"use client";

import { CalendarDays, CalendarRange } from "lucide-react";
import {
  Dropdown,
  DropdownChoice,
  DropdownNote,
  DropdownOption,
  DropdownPanel,
  DropdownTrigger,
} from "@/components/ui/dropdown";
import { ChipBar, FilterChip } from "@/components/ui/filter-chip";
import { MONTHS_FULL_ES, MONTHS_SHORT_ES } from "@/lib/date";
import { activeMarkCount } from "@/lib/sales/filters";
import { useSalesData } from "./sales-data-provider";

/**
 * Superficie de selección de «Ventas por servicio»: **Año · Mes** y marcas activas. Usa las mismas
 * primitivas que otras barras de la app para consistencia. No incluye «Cuenta contable» ni «Centro
 * de costo» porque no aplican a facturas, evitando que sea una pestaña más de PyG.
 *
 * Ambos admiten varias marcas. El año permite comparar series por meses, y sin marcas selecciona
 * el más reciente. «Todos los años» marca todos en lugar de vaciar, a diferencia de los meses, que
 * siguen la regla de «ninguna marca es todas».
 */
export function SalesToolbar() {
  const { universe, filters, toggleYear, selectAllYears, toggleMonth, clearMonths } =
    useSalesData();
  const marked = new Set(filters.months);
  const markedYears = new Set(filters.years);

  if (universe.years.length === 0) {
    return null;
  }

  return (
    <div className="rounded-[13px] border border-border bg-surface">
      <div className="flex flex-wrap items-center gap-2.5 px-[18px] py-3">
        <span className="text-[10.5px] font-semibold uppercase tracking-[0.5px] text-faint">
          Filtros
        </span>

        <Dropdown>
          <DropdownTrigger active icon={<CalendarDays size={15} />}>
            {`Año · ${filters.years.join(", ") || "—"}`}
          </DropdownTrigger>
          <DropdownPanel width={230}>
            {universe.years.length > 1 && (
              <div className="-mx-1 mb-1">
                {/* PUEBLA la lista, no la vacía: aquí «ninguna marca» significa «el más reciente»,
                    así que el atajo tiene que marcarlos todos de verdad. */}
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
            {/* Lo que hace marcar varios no es obvio y se dice aquí, que es donde se decide. */}
            <DropdownNote>
              Marca varios para comparar: cada año se dibuja como una serie sobre los mismos meses.
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
              {/* Solo se listan los meses que llegaron: una marca que no dibuja nada al ponerla
                  enseña a no pulsar las de al lado. */}
              <DropdownNote>Solo los meses con archivo cargado.</DropdownNote>
            </DropdownPanel>
          </Dropdown>
        )}
      </div>

      {activeMarkCount(filters) > 0 && (
        <ChipBar
          onClearAll={clearMonths}
          className="border-t border-border-soft bg-surface-sunken px-[18px] py-2.5"
        >
          {filters.months.map((month) => (
            <FilterChip
              key={month}
              label={MONTHS_FULL_ES[month]}
              onRemove={() => toggleMonth(month)}
            />
          ))}
        </ChipBar>
      )}
    </div>
  );
}
