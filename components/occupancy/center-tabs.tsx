"use client";

import { Building2, Layers, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { cn } from "@/lib/cn";
import { CONSOLIDATED_CENTER_ID, type CenterRow } from "@/lib/occupancy/types";

export interface CenterTabsProps {
  centers: CenterRow[];
  activeCenterId: string | undefined;
  hasConsolidated: boolean;
  yearsByCenter: Record<string, number[]>;
  onSelect: (centerId: string) => void;
  onDelete: (centerId: string) => void;
}

export function CenterTabs({
  centers,
  activeCenterId,
  hasConsolidated,
  yearsByCenter,
  onSelect,
  onDelete,
}: CenterTabsProps) {
  const [pendingDelete, setPendingDelete] = useState<CenterRow | null>(null);

  if (centers.length < 2) {
    return null;
  }

  const active = centers.find((center) => center.id === activeCenterId);
  const doomedYears = pendingDelete ? (yearsByCenter[pendingDelete.id] ?? []) : [];

  return (
    <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-border bg-surface px-3.5 py-3">
      <span className="mr-1 inline-flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.6px] text-faintest">
        <Building2 size={15} />
        Sucursal
      </span>

      {hasConsolidated && (
        <button
          type="button"
          aria-pressed={activeCenterId === CONSOLIDATED_CENTER_ID}
          onClick={() => onSelect(CONSOLIDATED_CENTER_ID)}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[12.5px] font-semibold transition-colors",
            activeCenterId === CONSOLIDATED_CENTER_ID
              ? "border-brand bg-brand-soft text-brand"
              : "border-border bg-surface text-muted hover:bg-canvas",
          )}
        >
          <Layers size={14} />
          Consolidado
        </button>
      )}

      {centers.map((center) => {
        const isActive = center.id === activeCenterId;
        return (
          <button
            key={center.id}
            type="button"
            aria-pressed={isActive}
            onClick={() => onSelect(center.id)}
            className={cn(
              "rounded-lg border px-3 py-1.5 text-[12.5px] font-semibold transition-colors",
              isActive
                ? "border-brand bg-brand-soft text-brand"
                : "border-border bg-surface text-muted hover:bg-canvas",
            )}
          >
            {center.name}
          </button>
        );
      })}

      <span className="flex-1" />
      <span className="text-[11.5px] text-faint">
        {activeCenterId === CONSOLIDATED_CENTER_ID
          ? "Suma de todas las sucursales · calculado, no editable"
          : "Un Excel por sucursal y año · el archivo se fusiona en la suya"}
      </span>

      {active && (
        <Button
          size="sm"
          variant="secondary"
          icon={<Trash2 size={13} />}
          className="text-negative"
          onClick={() => setPendingDelete(active)}
        >
          Eliminar {active.name}
        </Button>
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        variant="destructive"
        title={`¿Eliminar la sucursal «${pendingDelete?.name}»?`}
        description={`Se borrarán sus ${doomedYears.length} ${
          doomedYears.length === 1 ? "año" : "años"
        } (${doomedYears.join(", ")}), incluidos los datos cargados desde Excel y los que hayas escrito a mano. Las demás sucursales no se tocan. No se puede deshacer.`}
        confirmLabel="Eliminar"
        onConfirm={() => {
          if (pendingDelete) {
            onDelete(pendingDelete.id);
          }
          setPendingDelete(null);
        }}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}
