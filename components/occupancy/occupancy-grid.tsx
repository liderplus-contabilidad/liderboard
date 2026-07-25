"use client";

import { FileSpreadsheet, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import type { OccupancyGrid as Grid } from "@/lib/occupancy/derive";
import { OccupancyRow } from "./occupancy-grid-row";

export interface OccupancyGridProps {
  grid: Grid;
  /** "Enero 2026" — also what the channel actions name, so they stay short. */
  monthLabel: string;
  /** Active sucursal, appended to the title only. Absent when there is nothing to add. */
  centerLabel?: string;
  /** True in the consolidated view: it is a calculation, edited in each sucursal. */
  readOnly?: boolean;
  onSaveCell: (rowId: string, dayIndex: number, value: number) => void;
  onAddChannel: (name: string) => void;
  onRemoveChannel: (id: string) => void;
}

/**
 * The daily grid: concepts down the side, days across, "Total / prom." pinned right. The
 * concept column and the aggregate column are sticky so a 31-day month stays readable.
 *
 * Every day column looks identical on purpose. Earlier passes marked weekends — first by
 * filling the columns, then by dimming the day number — and both read as "those days are
 * different/disabled" rather than "those days are Saturday".
 */
export function OccupancyGrid({
  grid,
  monthLabel,
  centerLabel,
  readOnly = false,
  onSaveCell,
  onAddChannel,
  onRemoveChannel,
}: OccupancyGridProps) {
  const [newChannel, setNewChannel] = useState("");
  const mismatch = useMemo(() => new Set(grid.mismatch), [grid.mismatch]);

  const submitChannel = () => {
    const name = newChannel.trim();
    if (name) {
      onAddChannel(name);
      setNewChannel("");
    }
  };

  return (
    <div className="overflow-hidden rounded-[13px] border border-border bg-surface">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-surface-header px-[18px] py-3">
        <div className="flex items-center gap-2.5">
          <span className="text-sm font-semibold text-ink">
            {grid.scope === "year" ? "Detalle anual" : "Detalle diario"} ·{" "}
            {[monthLabel, centerLabel].filter(Boolean).join(" · ")}
          </span>
          {grid.asImported && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-chip-border bg-chip px-2.5 py-1 text-[11px] font-semibold text-brand">
              <FileSpreadsheet size={12} />
              Data exacta del excel
            </span>
          )}
        </div>
        <span className="text-[11.5px] text-faint">
          {grid.scope === "year"
            ? "Cada columna suma su mes · los indicadores se recalculan sobre el total"
            : readOnly
              ? "Suma de las sucursales · los indicadores se recalculan sobre el total"
              : grid.asImported
                ? "Nada recalculado · al editar cualquier celda, el mes entero pasa a calcularse"
                : "Edita disponibles, vendidas o ingresos · ADR, ocupación y RevPAR se recalculan solos"}
        </span>
      </header>

      <div className="max-h-[62vh] overflow-auto">
        <table className="w-full border-separate border-spacing-0">
          <thead>
            <tr>
              <th
                scope="col"
                className="sticky left-0 top-0 z-[3] min-w-[210px] border-b border-r border-border bg-surface-header px-[14px] py-2.5 text-left text-[11px] font-semibold uppercase tracking-[0.4px] text-faint"
              >
                Concepto
              </th>
              {grid.columnLabels.map((label) => (
                <th
                  key={label}
                  scope="col"
                  className="sticky top-0 z-[2] min-w-[70px] border-b border-l border-border-faint bg-surface-header px-2 py-2.5 text-right text-[11px] font-semibold tabular-nums text-muted"
                >
                  {label}
                </th>
              ))}
              <th
                scope="col"
                className="sticky right-0 top-0 z-[3] min-w-[112px] border-b border-l border-border bg-surface-header px-[14px] py-2.5 text-right text-[11px] font-semibold uppercase tracking-[0.4px] text-brand"
              >
                {grid.scope === "year" ? "Total año" : "Total / prom."}
              </th>
            </tr>
          </thead>
          <tbody>
            {(() => {
              // Number the editable rows top-to-bottom so arrow keys can step between them.
              let navRow = -1;
              return grid.rows.map((row) => {
                const rowNav = row.editable && !readOnly ? ++navRow : undefined;
                return (
                  <OccupancyRow
                    key={row.id}
                    row={row}
                    navRow={rowNav}
                    mismatch={mismatch}
                    readOnly={readOnly}
                    onSaveCell={onSaveCell}
                    onRemoveChannel={
                      row.kind === "channel" && !readOnly ? onRemoveChannel : undefined
                    }
                  />
                );
              });
            })()}
          </tbody>
        </table>
      </div>

      {readOnly ? (
        <div className="border-t-2 border-brand/15 bg-brand-soft px-[18px] py-3 text-[11.5px] text-muted">
          {grid.scope === "year"
            ? "La vista anual no se edita: cada celda es la suma de su mes. Elige un mes para escribir."
            : "El consolidado no se edita: escribe en la sucursal que corresponda y la suma se actualiza sola."}
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-3 border-t-2 border-brand/15 bg-brand-soft px-[18px] py-3">
          <label
            htmlFor="occupancy-new-channel"
            className="inline-flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-[0.4px] text-brand"
          >
            <Plus size={15} />
            Nuevo canal
          </label>
          <input
            id="occupancy-new-channel"
            value={newChannel}
            onChange={(e) => setNewChannel(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                submitChannel();
              }
            }}
            placeholder="Ej.: Booking, Expedia…"
            className="h-9 w-[220px] rounded-lg border border-chip-border bg-surface px-3 text-[13px] text-ink shadow-sm outline-none placeholder:text-faint focus:border-brand focus:ring-2 focus:ring-brand/20"
          />
          <Button
            size="sm"
            variant="primary"
            icon={<Plus size={15} />}
            disabled={!newChannel.trim()}
            onClick={submitChannel}
          >
            Agregar a {monthLabel}
          </Button>
          <span className="text-[11.5px] text-muted">Cada tabla tiene sus propios canales</span>
        </div>
      )}
    </div>
  );
}
