"use client";

import { cn } from "@/lib/cn";

/**
 * The legend of the «Ventas por línea de negocio» card: clicking a category removes it from the
 * chart, clicking it again puts it back. The same gesture as the legend of months ECharts draws down
 * there.
 *
 * **React draws it and not ECharts** because on that card the lines are the X AXIS —the series are the
 * months, which is precisely the legend that is already there— and ECharts only knows how to make a
 * legend of series.
 *
 * Two things separate it from that one so they are not read as the same thing: the micro-label
 * heading it, and that its marks carry NO colour. A line has no colour of its own on this card —the
 * period carries it—, so six coloured dots would promise a distinction that does not exist; it is the
 * same reason the annex's table carries no dot on its rows. The mark is therefore of INK: filled when
 * the line is on, hollow when it is not.
 */
export interface BusinessLineLegendProps {
  /** The lines on offer, the switched-off ones included: it is the only place they are put back. */
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
