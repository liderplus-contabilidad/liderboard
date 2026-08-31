"use client";

import { EyeOff } from "lucide-react";
import { useCallback } from "react";
import { cn } from "@/lib/cn";
import { formatCurrency } from "@/lib/format";
import { usePersonnelCostData } from "./personnel-cost-data-provider";
import { PersonnelCostGrid } from "./personnel-cost-grid";

/**
 * The Datos tab: the comparativo, whole, and the control that only it can use.
 *
 * **There are no tiles here.** The table already closes on every total and every percentage it
 * computes, and putting them again in four boxes above it would be saying the same number twice on one
 * screen — the reader then looks for the difference between two figures that have none. The tiles live
 * in Gráficos, where nothing else states them.
 *
 * «Ocultar filas en cero» sits in THIS card's header and not in the filter bar, which is the house
 * rule: a control read by one card lives in that card, a control read by every card lives in the bar
 * where it leaves a chip. Only the grid has rows to hide.
 */
export function PersonnelCostDatosView() {
  const { grid, reading, hideEmptyRows, setHideEmptyRows, periodName, saveFamily } =
    usePersonnelCostData();

  const onCapture = useCallback(
    (year: number, monthIndex: number, amount: number | null) => {
      void saveFamily(year, monthIndex, amount);
    },
    [saveFamily],
  );

  // Reported ONCE for the whole reading and not per year: a code missing from the plan is missing from
  // every exercise of the same client, so repeating it per year would be the same warning three times.
  const missing = [...new Set(reading.years.flatMap((year) => year.missingCodes))];

  return (
    <div className="px-7 py-5">
      <section className="flex min-w-0 flex-col overflow-hidden rounded-[13px] border border-border bg-surface">
        <header className="flex items-start justify-between gap-2.5 border-b border-border px-[18px] py-[11px]">
          <div className="min-w-0">
            <h3 className="truncate text-sm font-semibold text-ink">
              Comparativo de costo personal
            </h3>
            <p className="mt-0.5 truncate text-[11.5px] text-muted">
              {periodName} · ventas {formatCurrency(reading.revenue, { cents: true })}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setHideEmptyRows(!hideEmptyRows)}
            aria-pressed={hideEmptyRows}
            className={cn(
              "inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11.5px] font-semibold transition-colors",
              hideEmptyRows
                ? "border-brand bg-brand-soft text-brand"
                : "border-border bg-surface text-muted hover:bg-canvas",
            )}
          >
            <EyeOff size={13} />
            Ocultar filas en cero
            {hideEmptyRows && grid.hiddenRows > 0 && (
              <span className="tabular-nums">· {grid.hiddenRows}</span>
            )}
          </button>
        </header>

        <PersonnelCostGrid grid={grid} onCapture={onCapture} />

        <footer className="border-t border-border-soft px-[18px] py-3 text-[11.5px] leading-snug text-faint">
          {/* Said where it can be acted on: the highlighted row is the one figure the estado de
              resultados does not separate, and until it is written «Administración» carries the
              family's part inside it. */}
          La fila resaltada es la única que se escribe: la nómina de la familia sale de{" "}
          <span className="font-mono text-[11px]">5.5.01.01</span> y entra en «Administración
          (Familia Durán)», así que el par siempre suma lo que trajo el archivo. Se guarda al salir
          de la celda; vaciarla la borra.
          {missing.length > 0 && (
            <>
              {" "}
              El plan de este cliente no tiene {missing.length}{" "}
              {missing.length === 1 ? "cuenta" : "cuentas"} del mapa (
              <span className="font-mono text-[11px]">{missing.join(", ")}</span>): esas filas leen
              «–» y no suman como cero.
            </>
          )}
        </footer>
      </section>
    </div>
  );
}
