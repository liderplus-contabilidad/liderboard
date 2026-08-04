"use client";

import { CalendarDays, Trash2 } from "lucide-react";
import { useState } from "react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Dropdown, DropdownOption, DropdownPanel, DropdownTrigger } from "@/components/ui/dropdown";
import { InfoTip } from "@/components/ui/info-tip";
import { cn } from "@/lib/cn";

export interface YearFilterProps {
  /** Every year the workspace holds; rendered NEWEST FIRST. */
  years: readonly number[];
  selected: readonly number[];
  onToggle: (year: number) => void;
  /** "Todos los años": clears the selection rather than marking every year. */
  onSelectAll: () => void;
  /** Deletes a year and resolves with how many adjustments went with it. Sin él, los años se
   * marcan pero no se borran — el caso del consolidado entre clientes, cuyos años son de otros. */
  onDelete?: (year: number) => Promise<number>;
}

/**
 * "Año" filter: one checkbox per loaded year, plus a "Todos los años" shortcut standing in for
 * "nothing marked". It reads like the center filter on purpose — marking exactly one resolves
 * that year and makes Datos editable, marking none or several lays them side by side read-only.
 *
 * Unlike centers, several marked years are NOT summed: adding two exercises together is not a
 * figure anyone asked for, so they are laid out one block after another instead.
 *
 * This is also where a year is DELETED. It goes here rather than in a control of its own because
 * the bar is the module's only selection surface, and the year the user wants to remove is the
 * one they are already pointing at.
 */
export function YearFilter({ years, selected, onToggle, onSelectAll, onDelete }: YearFilterProps) {
  const [confirming, setConfirming] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  if (years.length === 0) {
    return null;
  }
  const picked = new Set(selected);
  const newestFirst = [...years].sort((a, b) => b - a);

  return (
    <>
      <Dropdown>
        <DropdownTrigger active={picked.size > 0} icon={<CalendarDays size={15} />}>
          {picked.size > 0 ? `Año · ${[...picked].sort((a, b) => b - a).join(", ")}` : "Año"}
        </DropdownTrigger>
        <DropdownPanel width={248}>
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
              Todos los años
            </button>
          </div>
          <div className="-mx-1 max-h-72 overflow-auto border-t border-border-soft pt-1.5">
            {newestFirst.map((year) => (
              <div key={year} className="group/year flex items-center">
                <span className="min-w-0 flex-1">
                  <DropdownOption selected={picked.has(year)} onToggle={() => onToggle(year)}>
                    <span className="font-mono tabular-nums">{year}</span>
                  </DropdownOption>
                </span>
                {onDelete && (
                  <button
                    type="button"
                    aria-label={`Borrar ${year}`}
                    onClick={() => setConfirming(year)}
                    className="mr-1 shrink-0 rounded p-1 text-faintest transition-colors hover:text-negative group-hover/year:text-faint"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            ))}
          </div>
          <div className="mt-1.5 flex justify-end border-t border-border-soft pt-[9px]">
            <InfoTip label="¿Cómo funcionan los años?" align="right">
              Marcar un solo año lo abre para editar. Marcar varios —o ninguno— los muestra uno
              junto al otro, en solo lectura: dos ejercicios no se suman.
              {onDelete && " Borrar un año descarta también sus ajustes y comentarios."}
            </InfoTip>
          </div>
        </DropdownPanel>
      </Dropdown>

      <ConfirmDialog
        open={confirming !== null}
        variant="destructive"
        busy={busy}
        title={`Borrar ${confirming ?? ""}`}
        description={
          `Se borran los datos de ${confirming ?? ""} y todos sus ajustes y comentarios. ` +
          `Los demás años quedan intactos. ¿Continuar?`
        }
        confirmLabel="Borrar el año"
        cancelLabel="Cancelar"
        onConfirm={() => {
          if (confirming === null || !onDelete) {
            return;
          }
          setBusy(true);
          void onDelete(confirming).finally(() => {
            setBusy(false);
            setConfirming(null);
          });
        }}
        onCancel={() => setConfirming(null)}
      />
    </>
  );
}
