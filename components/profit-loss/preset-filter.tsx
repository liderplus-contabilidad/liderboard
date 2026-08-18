"use client";

import { Sparkles } from "lucide-react";
import { useMemo } from "react";
import { ToolbarLabel } from "@/components/ui/toolbar";
import { cn } from "@/lib/cn";
import { availablePresets } from "@/lib/profit-loss/charts/preset-views";
import { activeSource } from "@/lib/profit-loss/charts/selection";
import { usePygAnalytics } from "./pyg-analytics-provider";
import { usePygData } from "./pyg-data-provider";

/**
 * «Predeterminados»: la sección de la barra que guarda las lecturas que la firma presenta siempre.
 *
 * Va en la barra y no en la cabecera de su tarjeta —donde vive todo control que lee una sola
 * tarjeta— porque no es una opción de dibujo: es la otra forma de decidir QUÉ se compara, la misma
 * pregunta que responde «Cuenta contable», y por eso son excluyentes y por eso deja chip.
 *
 * Es una SECCIÓN aparte, con su propio rótulo y separada por una línea, en vez de un desplegable
 * más: los cinco de la izquierda acotan lo que ya hay en pantalla y estas lo sustituyen por otra
 * lectura. Cada vista es un INTERRUPTOR a la vista y no una opción dentro de un menú: se presentan
 * de un clic, y un menú además esconde detrás de un rótulo genérico lo único que hay que leer.
 * **Se rinde entera** cuando el plan del cliente abierto no admite ninguna —la misma regla con la
 * que «Centro de costo» desaparece en modo estado único—, porque un rótulo sobre un control muerto
 * enseña a no leer ninguno de los dos.
 */
export function PresetFilter() {
  const { filters, selectPreset, sourceSystemId } = usePygData();
  const { context } = usePygAnalytics();

  const source = activeSource(context);
  // Qué vistas se ofrecen depende del PLAN y del SISTEMA del que salió el archivo: hay lecturas
  // que solo son legibles sobre un plan de cierta profundidad, y eso no está en el árbol.
  const presets = useMemo(
    () => availablePresets({ source, systemId: sourceSystemId }),
    [source, sourceSystemId],
  );
  if (presets.length === 0) {
    return null;
  }

  return (
    <div className="flex items-center gap-2.5 border-l border-border-soft pl-3">
      <ToolbarLabel icon={<Sparkles size={14} />}>Predeterminados</ToolbarLabel>
      {presets.map((preset) => {
        const active = preset.id === filters.preset;
        return (
          <button
            key={preset.id}
            type="button"
            // Lo que la vista declara de sí misma viaja al proveedor desde aquí: él no importa de
            // `charts/`, y quién siembra qué es de la vista, igual que `isAvailable`.
            onClick={() =>
              selectPreset(preset.id, {
                seeds: preset.seeds,
                frequency: preset.frequency,
                codes: preset.seedCodes?.(source),
              })
            }
            aria-pressed={active}
            title={preset.description}
            className={cn(
              "inline-flex h-[34px] items-center rounded-[9px] border px-3 text-[12.5px] font-semibold transition-colors",
              active
                ? "border-brand bg-brand-soft text-brand"
                : "border-border bg-surface text-muted hover:bg-canvas",
            )}
          >
            {preset.label}
          </button>
        );
      })}
    </div>
  );
}
