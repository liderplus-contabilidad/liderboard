"use client";

import { ListTree } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dropdown,
  DropdownDone,
  DropdownFooter,
  DropdownOption,
  DropdownPanel,
  DropdownTrigger,
} from "@/components/ui/dropdown";
import { ChipBar, FilterChip } from "@/components/ui/filter-chip";
import { SearchInput } from "@/components/ui/search-input";
import { Demo, DocSection } from "./section";

const ACCOUNTS = [
  { code: "4.1", name: "Ingresos por ventas" },
  { code: "4.2", name: "Otros ingresos" },
  { code: "5.1", name: "Costo de ventas" },
  { code: "5.2", name: "Sueldos y salarios" },
  { code: "5.3", name: "Arriendos" },
  { code: "5.4", name: "Servicios básicos" },
  { code: "5.5", name: "Depreciación" },
];

export function DropdownsSection() {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set(["4.1", "5.2"]));
  const [terms, setTerms] = useState(false);

  const visible = useMemo(
    () =>
      ACCOUNTS.filter(
        (account) =>
          account.name.toLowerCase().includes(query.trim().toLowerCase()) ||
          account.code.includes(query.trim()),
      ),
    [query],
  );

  const toggle = (code: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(code)) {
        next.delete(code);
      } else {
        next.add(code);
      }
      return next;
    });
  };

  const selectedAccounts = ACCOUNTS.filter((account) => selected.has(account.code));

  return (
    <DocSection
      id="dropdowns"
      title="Desplegables, checkboxes y chips"
      description="Popover de filtro con búsqueda interna, filas seleccionables y pie de acción; checkbox suelto; y barra de chips de filtros activos, todo removible en vivo."
    >
      <Demo label="Desplegable de filtro (Cuenta contable)" className="items-start">
        <Dropdown>
          <DropdownTrigger active={selected.size > 0} icon={<ListTree size={15} />}>
            {selected.size > 0 ? `Cuenta · ${selected.size}` : "Cuenta contable"}
          </DropdownTrigger>
          <DropdownPanel width={344}>
            <SearchInput
              size="sm"
              value={query}
              onChange={setQuery}
              placeholder="Buscar cuenta o código…"
              className="mb-2"
            />
            <div className="-mx-1 max-h-72 overflow-auto">
              {visible.map((account) => (
                <DropdownOption
                  key={account.code}
                  code={account.code}
                  selected={selected.has(account.code)}
                  onToggle={() => toggle(account.code)}
                >
                  {account.name}
                </DropdownOption>
              ))}
            </div>
            <DropdownFooter>
              <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
                Quitar selección
              </Button>
              <DropdownDone />
            </DropdownFooter>
          </DropdownPanel>
        </Dropdown>
      </Demo>

      <Demo label="Checkbox">
        <label
          htmlFor="cc-costos"
          className="flex cursor-pointer items-center gap-2.5 text-[13px] text-ink"
        >
          <Checkbox
            id="cc-costos"
            checked={terms}
            onChange={setTerms}
            ariaLabel="Incluir centros de costo"
          />
          Incluir centros de costo
        </label>
      </Demo>

      <Demo label="Chips de filtros activos" className="block">
        {selectedAccounts.length === 0 ? (
          <p className="text-[13px] text-faint">Sin filtros activos. Selecciona cuentas arriba.</p>
        ) : (
          <ChipBar onClearAll={() => setSelected(new Set())}>
            {selectedAccounts.map((account) => (
              <FilterChip
                key={account.code}
                dotColor="#1E3A5F"
                label={account.name}
                onRemove={() => toggle(account.code)}
              />
            ))}
          </ChipBar>
        )}
      </Demo>
    </DocSection>
  );
}
