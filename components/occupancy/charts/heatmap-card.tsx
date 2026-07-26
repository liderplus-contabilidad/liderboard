"use client";

import { memo } from "react";
import { CHART_HEAT_EMPTY, CHART_HEAT_RAMP, heatStep } from "@/lib/charts/palette";
import { cn } from "@/lib/cn";
import { formatMetric } from "@/lib/occupancy/charts/option";
import { HEATMAP_DAYS, type HeatmapResult } from "@/lib/occupancy/charts/heatmap";

export interface HeatmapCardProps {
  result: HeatmapResult;
  onSelectDay: (centerId: string, year: number, monthIndex: number, day: number) => void;
}

/**
 * The day × month grid. Every cell is a day and the tone climbs with the metric; clicking one
 * opens its detail. All the grids share ONE scale, which is what makes two of them comparable
 * at a glance — a tone means the same figure in every grid on screen.
 */
export const HeatmapCard = memo(function HeatmapCard({ result, onSelectDay }: HeatmapCardProps) {
  const { scale, metric } = result;

  return (
    <section className="flex min-w-0 flex-col overflow-hidden rounded-[13px] border border-border bg-surface">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-surface-header px-[18px] py-3">
        <div>
          <h3 className="text-sm font-semibold text-ink">
            Mapa de calor · {metric.label.toLowerCase()} diaria
          </h3>
          <p className="mt-0.5 text-[11.5px] text-faint">
            Cada celda es un día; el tono crece con {metric.label.toLowerCase()}. Clic para ver el
            detalle del día
          </p>
        </div>
        <div className="flex items-center gap-1.5 text-[11px] text-faint">
          <span>Menos</span>
          {CHART_HEAT_RAMP.map((color) => (
            <span
              key={color}
              aria-hidden
              className="h-[11px] w-4 rounded-[3px]"
              style={{ backgroundColor: color }}
            />
          ))}
          <span>Más</span>
        </div>
      </header>

      <div className="max-h-[52vh] overflow-auto px-[18px] py-4">
        {result.grids.map((grid) => (
          <div key={grid.id} className="mb-5 last:mb-0">
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.5px] text-faint">
              {grid.label}
            </p>
            <div className="inline-block min-w-full">
              <div
                className="grid gap-[3px]"
                style={{ gridTemplateColumns: `34px repeat(${HEATMAP_DAYS}, minmax(0, 1fr))` }}
              >
                <span />
                {Array.from({ length: HEATMAP_DAYS }, (_, day) => (
                  <span
                    key={day}
                    aria-hidden
                    className="text-center text-[9px] tabular-nums text-faintest"
                  >
                    {/* Only every fifth number: 31 labels at this width become texture. */}
                    {(day + 1) % 5 === 0 || day === 0 ? day + 1 : ""}
                  </span>
                ))}

                {grid.rows.map((row) => (
                  <Row
                    key={row.monthIndex}
                    label={row.label}
                    cells={row.cells}
                    scale={scale}
                    unit={metric.unit}
                    onSelect={(day) => onSelectDay(grid.centerId, grid.year, row.monthIndex, day)}
                  />
                ))}
              </div>
            </div>
          </div>
        ))}

        {result.truncated > 0 && (
          <p className="text-[11.5px] text-muted">
            Se dibujan {result.grids.length} cuadrículas; quedan {result.truncated} fuera. Marca
            menos sucursales o años para verlas.
          </p>
        )}
      </div>
    </section>
  );
});

function Row({
  label,
  cells,
  scale,
  unit,
  onSelect,
}: {
  label: string;
  cells: { day: number; value: number | null }[];
  scale: HeatmapResult["scale"];
  unit: Parameters<typeof formatMetric>[1];
  onSelect: (day: number) => void;
}) {
  return (
    <>
      <span className="self-center text-[10.5px] font-semibold text-muted">{label}</span>
      {cells.map((cell) => {
        const formatted = formatMetric(cell.value, unit);
        const empty = cell.value === null;
        return (
          <button
            key={cell.day}
            type="button"
            disabled={empty}
            onClick={() => onSelect(cell.day)}
            title={`${label} ${cell.day + 1} · ${formatted ?? "sin datos"}`}
            aria-label={`${label} ${cell.day + 1}, ${formatted ?? "sin datos"}`}
            className={cn(
              "h-[15px] rounded-[3px] transition-transform",
              !empty && "cursor-pointer hover:scale-125 hover:ring-1 hover:ring-brand",
            )}
            style={{
              backgroundColor: scale
                ? heatStep(cell.value, scale.min, scale.max)
                : CHART_HEAT_EMPTY,
            }}
          />
        );
      })}
    </>
  );
}
