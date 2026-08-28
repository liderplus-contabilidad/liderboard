"use client";

import { Layers, SlidersHorizontal } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { Dropdown, DropdownChoice, DropdownPanel, DropdownTrigger } from "@/components/ui/dropdown";
import { Toolbar, ToolbarLabel } from "@/components/ui/toolbar";
import { cn } from "@/lib/cn";
import { periodSlots } from "@/lib/profit-loss/filters";
import { deepestLevel, matchExpandLevel } from "@/lib/profit-loss/filter";
import type { AccountRow } from "@/lib/profit-loss/types";
import { AccountFilter } from "./account-filter";

import { ActiveFilterChips } from "./active-filter-chips";
import { CenterFilter } from "./center-filter";
import { ClientFilter } from "./client-filter";
import { FrequencyFilter } from "./frequency-filter";
import { PeriodFilter } from "./period-filter";
import { PresetFilter } from "./preset-filter";
import { YearFilter } from "./year-filter";
import { usePygData } from "./pyg-data-provider";

/**
 * PyG's filter row. It is the ONLY place PyG selects data — there is no separate "Comparar" box —
 * and the same row (and the same marks) reaches Datos, Gráficos and Análisis alike.
 *
 * It reads in THREE SEGMENTS separated by a rule, because seven controls in a run and all alike do
 * not say which goes with which. On the left, what NARROWS who is compared (Cliente · Cuenta · Nivel ·
 * Centro); in the middle, TIME, which is three controls of the same axis —«Año» and «Periodo» pick
 * which span and «Ver por» with what grain— and used to be split at the two ends of the row; and on
 * the right «Predeterminados», which narrows nothing but REPLACES the whole reading.
 *
 * The three segments are of the same material —34 px dropdowns— and that includes «Ver por», which
 * was the only one with another shape. The one button that is not a dropdown is the presets one, and
 * it is not because it opens a window instead of a panel.
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
    toggleClient,
    clearClients,
    clientOptions,
    togglePeriod,
    clearPeriods,
    toggleYear,
    clearYears,
    removeYear,
    isConsolidated,
    loadedYears,
    dataset,
    views,
    collapsed,
    setExpandLevel,
  } = usePygData();
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

        <ClientFilter
          clients={clientOptions}
          selected={filters.clientIds}
          onToggle={toggleClient}
          onSelectAll={clearClients}
        />
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
          consolidated={isConsolidated}
        />
        <div className="flex items-center gap-2.5 border-l border-border-soft pl-3">
          <YearFilter
            years={loadedYears}
            selected={filters.years}
            onToggle={toggleYear}
            onSelectAll={clearYears}
            // The consolidado's years belong to the clients that compose it: they are deleted there.
            {...(isConsolidated ? {} : { onDelete: removeYear })}
          />
          <PeriodFilter
            periods={periods}
            selected={filters.periods}
            onToggle={togglePeriod}
            onClear={clearPeriods}
          />
          <FrequencyFilter value={frequency} allowed={allowed} onChange={setFrequency} />
        </div>

        {/* It puts itself against the right edge: it renders nothing at all when the open chart of
            accounts admits no view, and a loose rule there would be the remains of a control that is
            not present. */}
        <PresetFilter />
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
              <DropdownChoice selected={active === "all"} onSelect={() => onSelect("all")}>
                Todos los niveles
              </DropdownChoice>
              {levels.map((level) => (
                <DropdownChoice
                  key={level}
                  selected={active === level}
                  onSelect={() => onSelect(level)}
                >
                  {`Nivel ${level}`}
                </DropdownChoice>
              ))}
            </div>
          </>
        )}
      </DropdownPanel>
    </Dropdown>
  );
}
