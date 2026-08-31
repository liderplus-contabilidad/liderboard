"use client";

import { CalendarDays, CalendarRange, Layers, SlidersHorizontal } from "lucide-react";
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
import { PERSONNEL_GROUPS } from "@/lib/personnel-cost/accounts";
import { usePersonnelCostData } from "./personnel-cost-data-provider";

/**
 * The module's ONE selection surface: **Año · Mes · Grupo**, the active marks, and the actions on the
 * right.
 *
 * It hangs under the tab bar and is read IDENTICALLY by the two tabs, which is what makes them two
 * views of one selection instead of two screens. A control read by every card lives here, where it
 * leaves a chip; a control read by ONE card lives in that card's header — which is where «Ocultar
 * filas en cero» sits, because only the grid has rows to hide.
 */
export function PersonnelCostToolbar({ actions }: { actions?: ReactNode }) {
  const {
    universe,
    filters,
    markCount,
    toggleYear,
    selectAllYears,
    toggleMonth,
    clearMonths,
    toggleGroup,
    clearGroups,
  } = usePersonnelCostData();

  const markedYears = new Set(filters.years);
  const markedMonths = new Set(filters.months);
  const markedGroups = new Set(filters.groups);
  const groupName = (id: string) => PERSONNEL_GROUPS.find((group) => group.id === id)?.label ?? id;

  return (
    // EDGE TO EDGE and not a card: it is the same bar PyG hangs under its tabs, so it reads as a
    // continuation of the header instead of a control floating over the page.
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
                <DropdownNote>
                  Marca varios para comparar: cada ejercicio suma su propio bloque de columnas sobre
                  los mismos meses.
                </DropdownNote>
              </DropdownPanel>
            </Dropdown>

            {universe.months.length > 0 && (
              <Dropdown>
                <DropdownTrigger active={markedMonths.size > 0} icon={<CalendarRange size={15} />}>
                  {markedMonths.size > 0
                    ? `Mes · ${filters.months.map((month) => MONTHS_SHORT_ES[month]).join(", ")}`
                    : "Mes"}
                </DropdownTrigger>
                <DropdownPanel width={230}>
                  <div className="-mx-1 mb-1">
                    <DropdownChoice selected={markedMonths.size === 0} onSelect={clearMonths}>
                      Todos los meses cargados
                    </DropdownChoice>
                  </div>
                  <div className="-mx-1 max-h-72 overflow-auto border-t border-border-soft pt-1.5">
                    {universe.months.map((month) => (
                      <DropdownOption
                        key={month}
                        selected={markedMonths.has(month)}
                        onToggle={() => toggleMonth(month)}
                      >
                        {MONTHS_FULL_ES[month]}
                      </DropdownOption>
                    ))}
                  </div>
                  {/* Only the months that arrived are listed: a mark that draws nothing when set
                      teaches you not to press the ones next to it. */}
                  <DropdownNote>
                    Solo los meses con estado de resultados cargado. Acota también las ventas que
                    dividen.
                  </DropdownNote>
                </DropdownPanel>
              </Dropdown>
            )}

            <Dropdown>
              <DropdownTrigger active={markedGroups.size > 0} icon={<Layers size={15} />}>
                {markedGroups.size === 0
                  ? "Grupo"
                  : markedGroups.size === 1
                    ? `Grupo · ${groupName(filters.groups[0])}`
                    : `Grupo · ${markedGroups.size} de ${PERSONNEL_GROUPS.length}`}
              </DropdownTrigger>
              <DropdownPanel width={260}>
                <div className="-mx-1 mb-1">
                  <DropdownChoice selected={markedGroups.size === 0} onSelect={clearGroups}>
                    Todos los grupos
                  </DropdownChoice>
                </div>
                <div className="-mx-1 border-t border-border-soft pt-1.5">
                  {PERSONNEL_GROUPS.map((group) => (
                    <DropdownOption
                      key={group.id}
                      selected={markedGroups.has(group.id)}
                      onToggle={() => toggleGroup(group.id)}
                    >
                      {group.label}
                    </DropdownOption>
                  ))}
                </div>
                <DropdownNote>
                  Acota toda la pantalla: la tabla, los indicadores y las cuatro lecturas.
                </DropdownNote>
              </DropdownPanel>
            </Dropdown>
          </>
        )}

        {actions && <div className="ml-auto flex shrink-0 items-center gap-2.5">{actions}</div>}
      </Toolbar>

      {markCount > 0 && (
        <ChipBar
          onClearAll={() => {
            clearMonths();
            clearGroups();
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
          {filters.groups.map((id) => (
            <FilterChip key={id} label={groupName(id)} onRemove={() => toggleGroup(id)} />
          ))}
        </ChipBar>
      )}
    </div>
  );
}
