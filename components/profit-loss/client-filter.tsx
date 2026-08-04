"use client";

import { Users } from "lucide-react";
import { Dropdown, DropdownOption, DropdownPanel, DropdownTrigger } from "@/components/ui/dropdown";
import { InfoTip } from "@/components/ui/info-tip";
import { cn } from "@/lib/cn";

export interface ClientFilterProps {
  /** Todos los clientes que el consolidado podría sumar — los que tienen datos. */
  clients: { id: string; name: string }[];
  selected: readonly string[];
  onToggle: (id: string) => void;
  /** «Todos los clientes»: limpia la selección en vez de marcarlos uno a uno. */
  onSelectAll: () => void;
}

/**
 * Filtro «Cliente»: qué clientes entran en el consolidado y cuáles no.
 *
 * Es hermano de «Centro de costo» y se lee igual — un atajo destacado para «ninguno marcado», que
 * aquí significa TODOS, y una casilla por cliente. La diferencia con los centros es que aquí marcar
 * varios SUMA en vez de comparar: el consolidado es una suma por definición, y quien quiera comparar
 * dos clientes los abre por separado.
 *
 * **No se rinde fuera del consolidado**, igual que `center-filter.tsx` no se rinde en modo estado
 * único: dentro de un cliente concreto, «qué clientes considerar» no querría decir nada.
 */
export function ClientFilter({ clients, selected, onToggle, onSelectAll }: ClientFilterProps) {
  if (clients.length === 0) {
    return null;
  }
  const picked = new Set(selected);

  return (
    <Dropdown>
      <DropdownTrigger active={picked.size > 0} icon={<Users size={15} />}>
        {picked.size > 0 ? `Cliente · ${picked.size}` : "Cliente"}
      </DropdownTrigger>
      <DropdownPanel width={288}>
        <div className="-mx-1 mb-1">
          <button
            type="button"
            onClick={onSelectAll}
            className={cn(
              "flex w-full items-center rounded-lg px-2 py-1.5 text-left text-[12.5px] transition-colors",
              picked.size === 0
                ? "bg-brand-soft font-medium text-brand"
                : "text-ink hover:bg-canvas",
            )}
          >
            Todos los clientes ({clients.length})
          </button>
        </div>
        <div className="-mx-1 max-h-72 overflow-auto border-t border-border-soft pt-1.5">
          {clients.map((client) => (
            <DropdownOption
              key={client.id}
              selected={picked.has(client.id)}
              onToggle={() => onToggle(client.id)}
            >
              {client.name}
            </DropdownOption>
          ))}
        </div>
        <div className="mt-1.5 flex justify-end border-t border-border-soft pt-[9px]">
          <InfoTip label="¿Cómo funciona el consolidado?" align="right">
            Marcar varios clientes los SUMA — el consolidado es una suma, no una comparación. No
            marcar ninguno equivale a marcarlos todos. Los avisos de cobertura se recalculan sobre
            los que queden dentro.
          </InfoTip>
        </div>
      </DropdownPanel>
    </Dropdown>
  );
}
