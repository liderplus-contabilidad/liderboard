"use client";

import { cn } from "@/lib/cn";

/**
 * La leyenda de la tarjeta «Ventas por línea de negocio»: pulsar una categoría la quita del
 * gráfico, volver a pulsarla la repone. El mismo gesto que la leyenda de meses que ECharts dibuja
 * ahí abajo.
 *
 * **La dibuja React y no ECharts** porque en esa tarjeta las líneas son el EJE X —las series son
 * los meses, que es justo la leyenda que ya está— y ECharts solo sabe hacer leyenda de series.
 *
 * Dos cosas la separan de aquella para que no se lean como la misma cosa: el micro-rótulo que la
 * encabeza, y que sus marcas NO llevan color. Una línea no tiene color propio en esta tarjeta —lo
 * lleva el periodo—, así que seis puntos de colores prometerían una distinción que no existe; es la
 * misma razón por la que la tabla del anexo no lleva punto en sus filas. La marca es entonces de
 * TINTA: llena cuando la línea está encendida, hueca cuando no.
 */
export interface BusinessLineLegendProps {
  /** Las líneas que se ofrecen, apagadas incluidas: es el único sitio desde el que se reponen. */
  lines: readonly { id: string; label: string }[];
  hidden: readonly string[];
  onToggle: (id: string) => void;
}

export function BusinessLineLegend({ lines, hidden, onToggle }: BusinessLineLegendProps) {
  const off = new Set(hidden);

  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border-faint pt-3">
      <span className="text-[10px] font-semibold uppercase tracking-[0.5px] text-faint">
        Líneas
      </span>
      {lines.map((line) => {
        const isOff = off.has(line.id);
        return (
          <button
            key={line.id}
            type="button"
            aria-pressed={!isOff}
            title={isOff ? `Volver a poner ${line.label}` : `Quitar ${line.label} del gráfico`}
            onClick={() => onToggle(line.id)}
            className={cn(
              "inline-flex items-center gap-1.5 text-[11.5px] transition-colors",
              isOff ? "text-faintest hover:text-faint" : "text-muted hover:text-ink",
            )}
          >
            <span
              aria-hidden
              className={cn(
                "h-2.5 w-2.5 rounded-[3px]",
                isOff ? "border border-border" : "bg-ink-soft",
              )}
            />
            <span className={cn(isOff && "line-through")}>{line.label}</span>
          </button>
        );
      })}
    </div>
  );
}
