"use client";

import { Building2 } from "lucide-react";
import { Dropdown, DropdownOption, DropdownPanel, DropdownTrigger } from "@/components/ui/dropdown";
import { InfoTip } from "@/components/ui/info-tip";
import { cn } from "@/lib/cn";
import type { CenterView } from "./pyg-data-provider";

export interface CenterFilterProps {
  /** Every real view — centers and No-center — EXCLUDING the synthetic Consolidated, which is
   * never a checkbox of its own (see the "All" shortcut below). */
  views: CenterView[];
  selected: readonly string[];
  onToggle: (id: string) => void;
  /** "All (Consolidated)": clears the selection rather than marking every view. */
  onSelectAll: () => void;
  /**
   * Within the CONSOLIDATED AMONG CLIENTS, each checkbox represents a (client · center) — its label
   * already indicates whose it is — and marking RESTRICTS the sum instead of comparing it against
   * a total that doesn't change. It's the same list and the same control; what changes is what the
   * shortcut and the note promise.
   */
  consolidated?: boolean;
}

// Groups consecutive views by client, preserving their order as provided.
function groupViews(views: readonly CenterView[]): { label: string | null; views: CenterView[] }[] {
  const groups: { label: string | null; views: CenterView[] }[] = [];
  for (const view of views) {
    const label = view.group ?? null;
    const last = groups[groups.length - 1];
    if (last && last.label === label) {
      last.views.push(view);
    } else {
      groups.push({ label, views: [view] });
    }
  }
  return groups;
}

/**
 * "Centro de costo" filter: one checkbox per real view of the workspace, plus a highlighted
 * "Todos (Consolidado)" shortcut standing in for "nothing marked". Marking every view one by one
 * is a different, valid choice (it compares them instead of summing them), so the shortcut never
 * ticks itself off automatically — it is its own row, active only when the selection is empty.
 *
 * Renders nothing at all in single mode: with one lone statement there is no center to compare.
 */
export function CenterFilter({
  views,
  selected,
  onToggle,
  onSelectAll,
  consolidated = false,
}: CenterFilterProps) {
  if (views.length === 0) {
    return null;
  }
  const picked = new Set(selected);

  return (
    <Dropdown>
      <DropdownTrigger active={picked.size > 0} icon={<Building2 size={15} />}>
        {picked.size > 0 ? `Centro · ${picked.size}` : "Centro de costo"}
      </DropdownTrigger>
      <DropdownPanel width={288}>
        <div className="-mx-1 mb-1">
          <button
            type="button"
            onClick={onSelectAll}
            className={cn(
              "flex w-full items-center rounded-lg px-2 py-1.5 text-left text-[12.5px] transition-colors",
              picked.size === 0
                ? "bg-brand-soft font-medium text-brand"
                : "text-ink hover:bg-canvas",
            )}
          >
            {consolidated ? `Todos los centros (${views.length})` : "Todos (Consolidado)"}
          </button>
        </div>
        <div className="-mx-1 max-h-72 overflow-auto border-t border-border-soft pt-1.5">
          {groupViews(views).map((group, index) => (
            <div key={group.label ?? "todos"} className={cn(index > 0 && "mt-1.5")}>
              {group.label !== null && (
                <div className="px-2 pb-1 pt-0.5 text-[10.5px] font-semibold uppercase tracking-[0.5px] text-faintest">
                  {group.label}
                </div>
              )}
              {group.views.map((view) => (
                <DropdownOption
                  key={view.id}
                  selected={picked.has(view.id)}
                  onToggle={() => onToggle(view.id)}
                >
                  <span className="inline-flex items-center gap-2">
                    <span
                      className="h-2 w-2 shrink-0 rounded-[2px]"
                      style={{ backgroundColor: view.color ?? "var(--color-faintest)" }}
                    />
                    {/* Bajo el encabezado de su cliente, repetirlo en cada fila sería ruido. */}
                    {group.label === null ? view.name : (view.shortName ?? view.name)}
                  </span>
                </DropdownOption>
              ))}
            </div>
          ))}
        </div>
        <div className="mt-1.5 flex justify-end border-t border-border-soft pt-[9px]">
          <InfoTip label="¿Cómo funcionan los centros de costo?" align="right">
            {consolidated ? (
              <>
                Cada casilla es el centro de un cliente. Marcar varios SUMA solo esos centros y nada
                más; no marcar ninguno suma todo lo que dejó «Cliente». Un cliente sin centros de
                costo no aparece aquí y queda fuera mientras filtres por centro.
              </>
            ) : (
              <>
                El Consolidado suma todos los centros mensuales, "Sin centro de costo" incluido — es
                un centro más, editable en vista mensual. Marcar varios los compara; no marcar
                ninguno equivale al Consolidado.
              </>
            )}
          </InfoTip>
        </div>
      </DropdownPanel>
    </Dropdown>
  );
}
