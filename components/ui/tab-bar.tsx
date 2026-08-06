"use client";

import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * La barra de pestañas de CUALQUIER vista — icono, etiqueta y el subrayado `brand` del activo,
 * sobre una tira de `surface` cerrada por abajo.
 *
 * Existe porque el mismo aspecto lo necesitan dos sitios que no comparten estructura: `ModuleTabs`
 * (Datos · Gráficos · Análisis de un módulo, leídas del registro de `lib/modules.ts`) y las
 * pestañas internas del detalle de un período de Rol de Pagos, que no son un módulo ni están en
 * ese registro. Escribirlas dos veces es lo que hace que una se quede atrás cuando la otra cambia
 * —y ya había pasado: el detalle usaba un `SegmentedControl`, que en esta app significa otra cosa
 * (elegir cómo se ve UNA tarjeta, como el «Ver por» de Ocupaciones), no cambiar de vista.
 *
 * Lo que NO posee es el margen horizontal: cada sitio lo pone por `className`, porque el ancho al
 * que la tira se alinea es del contenido que la rodea, no de la barra.
 */

export interface TabBarItem<Id extends string = string> {
  id: Id;
  label: string;
  icon: LucideIcon;
}

interface TabBarProps<Id extends string> {
  items: readonly TabBarItem<Id>[];
  value: Id;
  onChange: (id: Id) => void;
  ariaLabel: string;
  /**
   * Prefijo de los `id` de cada pestaña y del `aria-controls` que apunta a su panel. Quien rinde
   * el panel debe darle `id={`${idPrefix}-panel`}` y `aria-labelledby={`${idPrefix}-tab-${value}`}`
   * para cerrar el par.
   */
  idPrefix: string;
  /** Alineado a la altura de las etiquetas, no del subrayado — así el mismo slot sirve fuera de
   *  la barra sin arrastrar la compensación. */
  rightSlot?: ReactNode;
  className?: string;
}

export function TabBar<Id extends string>({
  items,
  value,
  onChange,
  ariaLabel,
  idPrefix,
  rightSlot,
  className,
}: TabBarProps<Id>) {
  return (
    <div
      className={cn(
        "flex items-end justify-between gap-6 border-b border-border bg-surface",
        className,
      )}
    >
      <div role="tablist" aria-label={ariaLabel} className="flex items-end gap-6">
        {items.map((item) => {
          const Icon = item.icon;
          const active = item.id === value;

          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              id={`${idPrefix}-tab-${item.id}`}
              aria-selected={active}
              aria-controls={`${idPrefix}-panel`}
              onClick={() => onChange(item.id)}
              className={cn(
                "relative flex items-center gap-2 py-2.5 text-sm font-semibold transition-colors",
                active ? "text-brand" : "text-faint hover:text-muted",
              )}
            >
              <Icon size={16} strokeWidth={1.9} />
              {item.label}
              {active && (
                <span className="absolute inset-x-0 -bottom-px h-[2.5px] rounded-[3px] bg-brand" />
              )}
            </button>
          );
        })}
      </div>

      <div className="pb-[11px]">{rightSlot}</div>
    </div>
  );
}
