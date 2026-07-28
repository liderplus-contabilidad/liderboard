"use client";

import { Building2 } from "lucide-react";
import { Dropdown, DropdownOption, DropdownPanel, DropdownTrigger } from "@/components/ui/dropdown";
import { InfoTip } from "@/components/ui/info-tip";
import { cn } from "@/lib/cn";
import type { CenterView } from "./pyg-data-provider";

export interface CenterFilterProps {
  /** Every real view — centers and Sin-centro — EXCLUDING the synthetic Consolidado, which is
   * never a checkbox of its own (see the "Todos" shortcut below). */
  views: CenterView[];
  selected: readonly string[];
  onToggle: (id: string) => void;
  /** "Todos (Consolidado)": clears the selection rather than marking every view. */
  onSelectAll: () => void;
}

/**
 * "Centro de costo" filter: one checkbox per real view of the workspace, plus a highlighted
 * "Todos (Consolidado)" shortcut standing in for "nothing marked". Marking every view one by one
 * is a different, valid choice (it compares them instead of summing them), so the shortcut never
 * ticks itself off automatically — it is its own row, active only when the selection is empty.
 *
 * Renders nothing at all in single mode: with one lone statement there is no center to compare.
 */
export function CenterFilter({ views, selected, onToggle, onSelectAll }: CenterFilterProps) {
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
            Todos (Consolidado)
          </button>
        </div>
        <div className="-mx-1 max-h-72 overflow-auto border-t border-border-soft pt-1.5">
          {views.map((view) => (
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
                {view.name}
              </span>
            </DropdownOption>
          ))}
        </div>
        <div className="mt-1.5 flex justify-end border-t border-border-soft pt-[9px]">
          <InfoTip label="¿Cómo funcionan los centros de costo?" align="right">
            El Consolidado suma todos los centros mensuales, "Sin centro de costo" incluido — es un
            centro más, editable en vista mensual. Marcar varios los compara; no marcar ninguno
            equivale al Consolidado.
          </InfoTip>
        </div>
      </DropdownPanel>
    </Dropdown>
  );
}
