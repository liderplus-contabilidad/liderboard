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
import { MONTHS_FULL_ES } from "@/lib/date";
import { PERSONNEL_GROUPS, PERSONNEL_SECTIONS } from "@/lib/personnel-cost/accounts";
import {
  activeMarkCount,
  describeGroupScope,
  groupAxis,
  monthMarkLabel,
  withGroupsCleared,
  yearMarkLabel,
} from "@/lib/personnel-cost/filters";
import { usePersonnelCostData } from "./personnel-cost-data-provider";

/**
 * The module's ONE selection surface: **Año · Mes · Grupo**, the active marks, and the actions on the
 * right.
 *
 * It hangs under the tab bar and serves the tab that is open (`tab`). «Año» is Gráficos' alone:
 * Datos takes its year from the strip of exercises above the bar and hides the chip, so no tab shows
 * two selectors of the same thing; Mes and Grupo are the same marks on both tabs, read through each
 * tab's own universe. A control read by every card lives here, where it leaves a chip; a control read
 * by ONE card lives in that card's header — which is where «Ocultar filas en cero» sits, because only
 * the grid has rows to hide.
 */
export function PersonnelCostToolbar({
  actions,
  tab,
}: {
  actions?: ReactNode;
  /**
   * Which tab the bar is serving. Datos hides «Año»: there the year is the strip's, and a chip that
   * said «2026» over a table the strip had opened on 2025 would be two answers to one question. Its
   * Mes and Grupo read the OPEN year's universe — a typed year offers all twelve months and no
   * groups — while Gráficos' read the marked years'.
   */
  tab: "graficos" | "datos";
}) {
  const data = usePersonnelCostData();
  const { toggleYear, selectAllYears, clearMonths, toggleGroup, toggleSection, clearGroups } = data;
  const hideYears = tab === "datos";
  const universe = hideYears ? data.datosUniverse : data.universe;
  const toggleMonth = hideYears ? data.toggleDatosMonth : data.toggleMonth;
  const groupsAvailable = hideYears ? data.datosGroupsAvailable : data.groupsAvailable;
  // A group mark where there are no groups is not shown as a chip either: the control that means
  // nothing is not drawn, and neither is the mark it would have left.
  const filters = (() => {
    const scoped = hideYears ? data.datosFilters : data.filters;
    return groupsAvailable ? scoped : withGroupsCleared(scoped);
  })();
  const markCount = activeMarkCount(filters);

  const markedYears = new Set(filters.years);
  const markedMonths = new Set(filters.months);
  const markedGroups = new Set(filters.groups);
  const markedSections = new Set(filters.sections);
  // Which column of «Grupo» is in use: the other one is drawn LOCKED until this one is cleared, because
  // a section is its groups and marking on both would be marking the same thing twice.
  const axis = groupAxis(filters);
  const groupName = (id: string) => PERSONNEL_GROUPS.find((group) => group.id === id)?.label ?? id;
  const sectionName = (id: string) =>
    PERSONNEL_SECTIONS.find((section) => section.id === id)?.label ?? id;

  return (
    // EDGE TO EDGE and not a card: it is the same bar PyG hangs under its tabs, so it reads as a
    // continuation of the header instead of a control floating over the page.
    <div className="border-b border-border bg-surface">
      <Toolbar>
        {universe.years.length > 0 && (
          <>
            <ToolbarLabel icon={<SlidersHorizontal size={15} />}>Filtros</ToolbarLabel>

            {!hideYears && (
              <Dropdown>
                <DropdownTrigger active icon={<CalendarDays size={15} />}>
                  {`Año · ${yearMarkLabel(filters.years, universe.years)}`}
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
                    Marca varios para comparar: cada ejercicio suma su propio bloque de columnas
                    sobre los mismos meses.
                  </DropdownNote>
                </DropdownPanel>
              </Dropdown>
            )}

            {universe.months.length > 0 && (
              <Dropdown>
                <DropdownTrigger active={markedMonths.size > 0} icon={<CalendarRange size={15} />}>
                  {markedMonths.size > 0
                    ? `Mes · ${monthMarkLabel(filters.months, universe.months)}`
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

            {/* Un tramo de ejercicios TIPEADOS no tiene grupos, así que aquí no se dibuja nada: es la
                misma regla con la que este bar oculta «Mes» cuando no hay meses que acotar. */}
            {groupsAvailable && (
              <Dropdown>
                <DropdownTrigger active={axis !== null} icon={<Layers size={15} />}>
                  {(() => {
                    // `describeGroupScope` is the one wording of the narrowing; it is `null` for
                    // «all», which here includes both sections marked.
                    const scope = describeGroupScope(filters);
                    return scope === null ? "Grupo" : `Grupo · ${scope}`;
                  })()}
                </DropdownTrigger>
                <DropdownPanel width={400}>
                  <div className="-mx-1 mb-1">
                    <DropdownChoice selected={axis === null} onSelect={clearGroups}>
                      Todos los grupos
                    </DropdownChoice>
                  </div>
                  {/* Two columns, one per axis of the same narrowing. Marking in one LOCKS the other
                      —dimmed, not hidden— because Planta IS Afiliados + No afiliados: the row exists
                      and what is missing is clearing the column in use. */}
                  <div className="-mx-1 grid grid-cols-2 gap-x-3 border-t border-border-soft pt-1.5">
                    <div>
                      <p className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-[0.5px] text-faint">
                        Grupo
                      </p>
                      {PERSONNEL_GROUPS.map((group) => (
                        <DropdownOption
                          key={group.id}
                          selected={markedGroups.has(group.id) && axis === "group"}
                          disabled={axis === "section"}
                          onToggle={() => toggleGroup(group.id)}
                        >
                          {group.label}
                        </DropdownOption>
                      ))}
                    </div>
                    <div className="border-l border-border-soft pl-3">
                      <p className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-[0.5px] text-faint">
                        Sección
                      </p>
                      {PERSONNEL_SECTIONS.map((section) => (
                        <DropdownOption
                          key={section.id}
                          selected={markedSections.has(section.id)}
                          disabled={axis === "group"}
                          onToggle={() => toggleSection(section.id)}
                        >
                          {section.label}
                        </DropdownOption>
                      ))}
                    </div>
                  </div>
                  <DropdownNote>
                    Acota toda la pantalla: la tabla, los indicadores y las cuatro lecturas. Una
                    sección es sus grupos, así que marcar en una columna bloquea la otra.
                  </DropdownNote>
                </DropdownPanel>
              </Dropdown>
            )}
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
          {/* Set by section, one chip per section — never its two halves. */}
          {axis === "section"
            ? filters.sections.map((id) => (
                <FilterChip key={id} label={sectionName(id)} onRemove={() => toggleSection(id)} />
              ))
            : filters.groups.map((id) => (
                <FilterChip key={id} label={groupName(id)} onRemove={() => toggleGroup(id)} />
              ))}
        </ChipBar>
      )}
    </div>
  );
}
