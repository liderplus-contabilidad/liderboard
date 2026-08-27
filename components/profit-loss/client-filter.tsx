"use client";

import { Users } from "lucide-react";
import { Dropdown, DropdownOption, DropdownPanel, DropdownTrigger } from "@/components/ui/dropdown";
import { InfoTip } from "@/components/ui/info-tip";
import { cn } from "@/lib/cn";

export interface ClientFilterProps {
  /** Every client the consolidado could sum — the ones with data. */
  clients: { id: string; name: string }[];
  selected: readonly string[];
  onToggle: (id: string) => void;
  /** «Todos los clientes»: clears the selection instead of marking them one by one. */
  onSelectAll: () => void;
}

/**
 * The «Cliente» filter: which clients go into the consolidado and which do not.
 *
 * It is a sibling of «Centro de costo» and reads alike — a highlighted shortcut for «nothing marked»,
 * which here means ALL, and one checkbox per client. The difference from the centers is that marking
 * several here SUMS instead of comparing: the consolidado is a sum by definition, and whoever wants
 * to compare two clients opens them separately.
 *
 * **It does not render outside the consolidado**, just as `center-filter.tsx` does not render in
 * single-statement mode: inside one particular client, «which clients to consider» would mean
 * nothing.
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
