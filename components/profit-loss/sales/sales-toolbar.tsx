"use client";

import {
  Boxes,
  CalendarDays,
  CalendarRange,
  ShieldPlus,
  SlidersHorizontal,
  Tags,
  UserRound,
} from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import {
  Dropdown,
  DropdownChoice,
  DropdownNote,
  DropdownOption,
  DropdownPanel,
  DropdownTrigger,
} from "@/components/ui/dropdown";
import { ChipBar, FilterChip } from "@/components/ui/filter-chip";
import { SearchInput } from "@/components/ui/search-input";
import { Toolbar, ToolbarLabel } from "@/components/ui/toolbar";
import { MONTHS_FULL_ES } from "@/lib/date";
import {
  activeMarkCount,
  monthMarkLabel,
  yearMarkLabel,
  type SalesAxis,
  type SalesChoice,
} from "@/lib/sales/filters";
import { useSalesData } from "./sales-data-provider";

/**
 * «Ventas por servicio»' selection surface: Año · Mes · Seguro · Tipo de servicio → Artículo ·
 * Vendedor, the active marks, and the page's actions on the right. A mark whose universe has one
 * value or none is NOT drawn, rather than drawn disabled.
 */
export function SalesToolbar({ actions }: { actions?: ReactNode }) {
  const {
    universe,
    filters,
    toggleYear,
    selectAllYears,
    toggleMonth,
    clearMonths,
    toggleChoice,
    clearAllMarks,
  } = useSalesData();
  const marked = new Set(filters.months);
  const markedYears = new Set(filters.years);

  /** A chip's text: the universe's label, never the raw id (for an article, a bare code). */
  const labelOf = (axis: SalesAxis, id: string) =>
    universe[axis].find((choice) => choice.id === id)?.label ?? id;

  return (
    // EDGE TO EDGE and not a card: it is the same bar PyG hangs under its tabs —`Toolbar` inside a
    // `border-b`— and it reads as a continuation of the header instead of a control floating over
    // the page.
    <div className="border-b border-border bg-surface">
      <Toolbar>
        {universe.years.length > 0 && (
          <>
            <ToolbarLabel icon={<SlidersHorizontal size={15} />}>Filtros</ToolbarLabel>

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
                  Marca varios para comparar: cada año se dibuja como una serie sobre los mismos
                  meses.
                </DropdownNote>
              </DropdownPanel>
            </Dropdown>

            {universe.months.length > 1 && (
              <Dropdown>
                <DropdownTrigger active={marked.size > 0} icon={<CalendarRange size={15} />}>
                  {marked.size > 0
                    ? `Mes · ${monthMarkLabel(filters.months, universe.months)}`
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

            <AxisDropdown
              axis="seguros"
              label="Seguro"
              plural="seguros"
              icon={<ShieldPlus size={15} />}
              note="Acota toda la pantalla: cuánto se vendió, de qué y quién lo vende."
            />

            <AxisDropdown
              axis="tipos"
              label="Tipo de servicio"
              plural="tipos"
              icon={<Tags size={15} />}
              note="Además de acotar la pantalla, decide qué artículos lista el filtro de al lado."
            />

            <AxisDropdown
              axis="articles"
              label="Artículo"
              plural="artículos"
              icon={<Boxes size={15} />}
              width={420}
              search
              note="La lista sale de los tipos de servicio marcados. Si dos artículos se llaman igual, llevan su código detrás para distinguirlos."
            />

            <AxisDropdown
              axis="vendors"
              label="Vendedor"
              plural="vendedores"
              icon={<UserRound size={15} />}
              width={340}
              search
              note="Ojo: la mayor parte de la facturación no trae vendedor en el archivo, y la tarjeta dice cuánto es."
            />
          </>
        )}

        {actions && <div className="ml-auto flex shrink-0 items-center gap-2.5">{actions}</div>}
      </Toolbar>

      {activeMarkCount(filters) > 0 && (
        <ChipBar
          onClearAll={clearAllMarks}
          className="border-t border-border-soft bg-surface-sunken px-7 py-2.5"
        >
          {filters.months.map((month) => (
            <FilterChip
              key={`mes-${month}`}
              label={MONTHS_FULL_ES[month]}
              onRemove={() => toggleMonth(month)}
            />
          ))}
          {(["seguros", "tipos", "articles", "vendors"] as const).flatMap((axis) =>
            filters[axis].map((id) => (
              <FilterChip
                key={`${axis}-${id}`}
                label={labelOf(axis, id)}
                onRemove={() => toggleChoice(axis, id)}
              />
            )),
          )}
        </ChipBar>
      )}
    </div>
  );
}

/** The four id-based marks: one component, differing in universe, wording and search box. */
function AxisDropdown({
  axis,
  label,
  plural,
  icon,
  note,
  width = 300,
  search = false,
}: {
  axis: SalesAxis;
  label: string;
  plural: string;
  icon: ReactNode;
  note: string;
  width?: number;
  search?: boolean;
}) {
  const { universe, filters, toggleChoice, clearAxis } = useSalesData();
  const [query, setQuery] = useState("");
  const choices = universe[axis];
  const markedIds = new Set(filters[axis]);

  const visible = useMemo<SalesChoice[]>(() => {
    const needle = query.trim().toLowerCase();
    if (needle === "") {
      return choices;
    }
    // Accent-insensitive: «hialuronico» has to find «HIALURÓNICO».
    const fold = (text: string) =>
      text
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .toLowerCase();
    const folded = fold(needle);
    return choices.filter((choice) => fold(choice.label).includes(folded));
  }, [choices, query]);

  // With one value or none there is nothing to choose.
  if (choices.length < 2) {
    return null;
  }

  const trigger =
    markedIds.size === 0
      ? label
      : markedIds.size === 1
        ? `${label} · ${choices.find((choice) => markedIds.has(choice.id))?.label ?? ""}`
        : `${label} · ${markedIds.size} de ${choices.length}`;

  return (
    <Dropdown>
      <DropdownTrigger active={markedIds.size > 0} icon={icon}>
        {trigger}
      </DropdownTrigger>
      <DropdownPanel width={width}>
        {search && (
          <div className="-mx-1 mb-1.5">
            <SearchInput
              size="sm"
              value={query}
              onChange={setQuery}
              placeholder={`Buscar entre ${choices.length} ${plural}…`}
            />
          </div>
        )}
        <div className="-mx-1 mb-1">
          <DropdownChoice selected={markedIds.size === 0} onSelect={() => clearAxis(axis)}>
            {`Todos los ${plural}`}
          </DropdownChoice>
        </div>
        <div className="-mx-1 max-h-72 overflow-auto border-t border-border-soft pt-1.5">
          {visible.map((choice) => (
            <DropdownOption
              key={choice.id}
              selected={markedIds.has(choice.id)}
              onToggle={() => toggleChoice(axis, choice.id)}
            >
              {choice.label}
            </DropdownOption>
          ))}
          {visible.length === 0 && (
            <p className="px-2 py-3 text-xs text-faint">Ninguno coincide con «{query.trim()}».</p>
          )}
        </div>
        <DropdownNote>{note}</DropdownNote>
      </DropdownPanel>
    </Dropdown>
  );
}
