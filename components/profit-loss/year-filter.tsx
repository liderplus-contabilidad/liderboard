"use client";

import { CalendarDays, Trash2 } from "lucide-react";
import { useState } from "react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Dropdown, DropdownOption, DropdownPanel, DropdownTrigger } from "@/components/ui/dropdown";
import { InfoTip } from "@/components/ui/info-tip";
import { cn } from "@/lib/cn";
import { yearMarkLabel } from "@/lib/period";

export interface YearFilterProps {
  /** Every year the workspace holds; rendered NEWEST FIRST. */
  years: readonly number[];
  /**
   * The years ON SCREEN (`visibleYears`), not the raw marks: with nothing marked the resolved year
   * is what the checkboxes show and what the trigger names, and what a toggle adds to.
   */
  selected: readonly number[];
  onToggle: (year: number) => void;
  /** «Todos los años»: MARKS every year for real — an empty selection means «the most recent». */
  onSelectAll: () => void;
  /**
   * The same shortcut pressed while every year is already marked: back to the most recent one in
   * ONE render. Without it the way back from «Todos» is one toggle per year, and each one relays
   * the whole table.
   */
  onClear: () => void;
  /** Deletes a year and resolves with how many adjustments went with it. Without it, years are
   * marked but not deleted — the case of the cross-client consolidado, whose years belong to
   * others. */
  onDelete?: (year: number) => Promise<number>;
}

/**
 * "Año" filter: one checkbox per loaded year, plus a «Todos los años» shortcut that marks them all.
 * It is the one mark of this bar where «nothing marked» is NOT «all of them» but the MOST RECENT
 * year (`resolveVisibleYears`) — the declared exception Ventas and Costo de personal already make,
 * because Datos speaks in columns that carry their year and three exercises side by side is a
 * table nobody opens on. So the trigger always names what is on screen (`Año · 2026`), the
 * shortcut has to POPULATE the list instead of emptying it, and the checkboxes show the resolved
 * list, which is what a toggle adds to or removes from.
 *
 * Exactly one year on screen makes Datos editable, which is now the case on opening; several are
 * laid side by side read-only. They are NOT summed: adding two exercises together is not a figure
 * anyone asked for, so they are laid out one block after another instead.
 *
 * This is also where a year is DELETED. It goes here rather than in a control of its own because
 * the bar is the module's only selection surface, and the year the user wants to remove is the
 * one they are already pointing at.
 */
export function YearFilter({
  years,
  selected,
  onToggle,
  onSelectAll,
  onClear,
  onDelete,
}: YearFilterProps) {
  const [confirming, setConfirming] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  if (years.length === 0) {
    return null;
  }
  const picked = new Set(selected);
  const newestFirst = [...years].sort((a, b) => b - a);
  const allPicked = years.every((year) => picked.has(year));

  return (
    <>
      <Dropdown>
        {/* Always «active», as Ventas' is: there is always a year on screen, and the trigger reads
            as the selection it is rather than as an empty filter. */}
        <DropdownTrigger active icon={<CalendarDays size={15} />}>
          {`Año · ${yearMarkLabel(selected, years)}`}
        </DropdownTrigger>
        <DropdownPanel width={248}>
          <div className="-mx-1 mb-1">
            <button
              type="button"
              aria-pressed={allPicked}
              onClick={allPicked ? onClear : onSelectAll}
              className={cn(
                "flex w-full items-center rounded-lg px-2 py-1.5 text-left text-[12.5px] transition-colors",
                allPicked ? "bg-brand-soft font-medium text-brand" : "text-ink hover:bg-canvas",
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
              Sin marcar nada se muestra el año más reciente, abierto para editar. Marcar varios los
              muestra uno junto al otro, en solo lectura: dos ejercicios no se suman.
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
