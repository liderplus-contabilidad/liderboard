"use client";

import { Layers, SlidersHorizontal } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { Dropdown, DropdownPanel, DropdownTrigger } from "@/components/ui/dropdown";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Toolbar, ToolbarLabel } from "@/components/ui/toolbar";
import { cn } from "@/lib/cn";
import { FREQUENCY_ORDER, frequencyLabel } from "@/lib/period";
import { periodSlots } from "@/lib/profit-loss/filters";
import { deepestLevel, matchExpandLevel } from "@/lib/profit-loss/filter";
import type { AccountRow, Frequency } from "@/lib/profit-loss/types";
import { AccountFilter } from "./account-filter";
import { ActiveFilterChips } from "./active-filter-chips";
import { CenterFilter } from "./center-filter";
import { PeriodFilter } from "./period-filter";
import { YearFilter } from "./year-filter";
import { usePygData } from "./pyg-data-provider";

const GRANULARITIES: { value: Frequency; label: string }[] = FREQUENCY_ORDER.map((value) => ({
  value,
  label: frequencyLabel(value),
}));

/**
 * PyG's filter row: Cuenta contable · Nivel · Centro de costo · Año · Periodo, with "Ver por" pinned
 * to the right and the active-filter chip strip below. It is the ONLY place PyG selects data —
 * there is no separate "Comparar" box — and the same row (and the same marks) reaches Datos,
 * Gráficos and Análisis alike.
 */
export function PygToolbar() {
  const {
    activeClientId,
    frequency,
    allowed,
    setFrequency,
    deepestLevel: deepest,
    accountOptions,
    filters,
    toggleCode,
    clearCodes,
    toggleCenter,
    clearCenters,
    togglePeriod,
    clearPeriods,
    toggleYear,
    clearYears,
    removeYear,
    loadedYears,
    dataset,
    views,
    collapsed,
    setExpandLevel,
  } = usePygData();
  const granularityOptions = GRANULARITIES.map((option) => ({
    ...option,
    disabled: !allowed.includes(option.value),
  }));

  const centerOptions = views.filter((view) => view.role !== "consolidado");
  const periods = dataset ? periodSlots(frequency) : [];

  // With no client there is nothing to filter, and every dropdown would open on an empty list.
  // `inert` is what says so properly: the controls stay in place (the bar does not reflow when
  // the first client arrives) but leave the focus order and the accessibility tree entirely.
  const idle = activeClientId === null;

  return (
    <div className="shrink-0 border-b border-border bg-surface">
      <Toolbar inert={idle} className={cn(idle && "opacity-50")}>
        <ToolbarLabel icon={<SlidersHorizontal size={15} />}>Filtros</ToolbarLabel>

        <AccountFilter
          accounts={accountOptions}
          selected={new Set(filters.codes)}
          onToggle={toggleCode}
          onClear={clearCodes}
        />
        <NivelFilter
          deepest={deepest}
          accounts={dataset?.accounts}
          collapsed={collapsed}
          onSelect={setExpandLevel}
        />
        <CenterFilter
          views={centerOptions}
          selected={filters.centerIds}
          onToggle={toggleCenter}
          onSelectAll={clearCenters}
        />
        <YearFilter
          years={loadedYears}
          selected={filters.years}
          onToggle={toggleYear}
          onSelectAll={clearYears}
          onDelete={removeYear}
        />
        <PeriodFilter
          periods={periods}
          selected={filters.periods}
          onToggle={togglePeriod}
          onClear={clearPeriods}
        />

        <div className="ml-auto flex items-center gap-2.5">
          <ToolbarLabel>Ver por</ToolbarLabel>
          <SegmentedControl
            variant="track"
            className="bg-border-faint"
            ariaLabel="Frecuencia"
            options={granularityOptions}
            value={frequency}
            onChange={setFrequency}
          />
        </div>
      </Toolbar>

      <ActiveFilterChips />
    </div>
  );
}

/**
 * "Nivel" — the single depth control for the Datos tree. Picking "Nivel N" collapses the
 * accordion down to N (rows keep their chevrons for ad-hoc drill-down); "Todos los niveles"
 * fully expands it. Options run 1..(deepest-1) off the deepest movement account across ALL
 * files in the workspace; "Todos" absorbs the fully-expanded (deepest) state — a redundant
 * "Nivel deepest" (leaves have nothing to collapse). With no data (or a flat file) the panel
 * shows an empty state instead of levels. It never produces a chip: it changes how the Datos
 * tree folds, not what data any tab draws.
 */
function NivelFilter({
  deepest,
  accounts,
  collapsed,
  onSelect,
}: {
  deepest: number;
  accounts: AccountRow[] | undefined;
  collapsed: ReadonlySet<string>;
  onSelect: (level: number | "all") => void;
}) {
  const levels = deepest >= 2 ? Array.from({ length: deepest - 1 }, (_, i) => i + 1) : [];
  // Which level the current collapse state represents for THIS view: an empty set is always
  // fully expanded ("Todos"), regardless of how the active view's depth compares to the
  // workspace-deepest; otherwise match against the active view's own tree, or `null` (custom)
  // when the user has toggled rows by hand into a state no preset produces.
  const active: number | "all" | null =
    collapsed.size === 0
      ? "all"
      : accounts
        ? matchExpandLevel(accounts, collapsed, deepestLevel(accounts))
        : null;

  return (
    <Dropdown>
      <DropdownTrigger icon={<Layers size={15} />} active={typeof active === "number"}>
        {typeof active === "number" ? `Nivel ${active}` : "Nivel"}
      </DropdownTrigger>
      <DropdownPanel width={216}>
        {levels.length === 0 ? (
          <EmptyState icon={<Layers size={22} />} className="py-4">
            {deepest === 0
              ? "Carga un Excel de Pérdidas y Ganancias para filtrar por nivel."
              : "El archivo cargado no tiene subniveles de cuenta."}
          </EmptyState>
        ) : (
          <>
            <div className="px-1.5 pb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.5px] text-faintest">
              Mostrar hasta nivel
            </div>
            <div className="-mx-1">
              <NivelOption
                label="Todos los niveles"
                active={active === "all"}
                onClick={() => onSelect("all")}
              />
              {levels.map((level) => (
                <NivelOption
                  key={level}
                  label={`Nivel ${level}`}
                  active={active === level}
                  onClick={() => onSelect(level)}
                />
              ))}
            </div>
          </>
        )}
      </DropdownPanel>
    </Dropdown>
  );
}

function NivelOption({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center rounded-lg px-2 py-1.5 text-left text-[12.5px] transition-colors",
        active ? "bg-brand-soft font-medium text-brand" : "text-ink hover:bg-canvas",
      )}
    >
      {label}
    </button>
  );
}
