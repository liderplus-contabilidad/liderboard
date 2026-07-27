"use client";

import { CalendarRange, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { cn } from "@/lib/cn";

export interface YearTabsProps {
  /** Years of the ACTIVE center, ascending — never a year it does not hold. */
  years: number[];
  activeYear: number | undefined;
  /** Softens the delete confirmation when the year is empty. */
  activeHasData: boolean;
  /** Absent in the consolidated view, which owns no year of its own to delete. */
  onDelete?: (year: number) => void;
  onSelect: (year: number) => void;
  onAdd: (year: number) => void;
}

/** The next free year after the newest one, so "Añadir año" needs no typing. */
function nextYear(years: number[]): number {
  const newest = years.reduce((max, year) => Math.max(max, year), 0);
  return newest > 0 ? newest + 1 : new Date().getFullYear();
}

/** An uploaded workbook merges into the year it DECLARES, not into whichever tab is open. */
export function YearTabs({
  years,
  activeYear,
  activeHasData,
  onSelect,
  onAdd,
  onDelete,
}: YearTabsProps) {
  const [pendingDelete, setPendingDelete] = useState<number | null>(null);

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-border bg-surface px-3.5 py-3">
      <span className="mr-1 inline-flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.6px] text-faintest">
        <CalendarRange size={15} />
        Año
      </span>

      {years.map((year) => {
        const isActive = year === activeYear;
        return (
          <button
            key={year}
            type="button"
            aria-pressed={isActive}
            onClick={() => onSelect(year)}
            className={cn(
              "rounded-lg border px-3 py-1.5 text-[12.5px] font-semibold tabular-nums transition-colors",
              isActive
                ? "border-brand bg-brand-soft text-brand"
                : "border-border bg-surface text-muted hover:bg-canvas",
            )}
          >
            {year}
          </button>
        );
      })}

      <Button
        size="sm"
        variant="secondary"
        icon={<Plus size={14} />}
        className="border-dashed"
        onClick={() => onAdd(nextYear(years))}
      >
        Añadir año
      </Button>

      <span className="flex-1" />
      <span className="text-[11.5px] text-faint">
        Cada año se llena y edita por separado · el Excel se fusiona en su año
      </span>

      {onDelete && activeYear !== undefined && (
        <Button
          size="sm"
          variant="secondary"
          icon={<Trash2 size={13} />}
          className="text-negative"
          onClick={() => setPendingDelete(activeYear)}
        >
          Eliminar {activeYear}
        </Button>
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        variant="destructive"
        title={`¿Eliminar el año ${pendingDelete}?`}
        description={
          activeHasData
            ? "Se borrarán los 12 meses de ese año en esta sucursal, incluidos los datos cargados desde Excel y los que hayas escrito a mano. No se puede deshacer."
            : "Ese año está vacío. Se quitará del selector."
        }
        confirmLabel="Eliminar"
        onConfirm={() => {
          if (pendingDelete !== null) {
            onDelete?.(pendingDelete);
          }
          setPendingDelete(null);
        }}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}
