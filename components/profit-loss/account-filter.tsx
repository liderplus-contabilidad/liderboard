"use client";

import { ListTree } from "lucide-react";
import { useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Dropdown, DropdownFooter, DropdownPanel, DropdownTrigger } from "@/components/ui/dropdown";
import type { AccountOption } from "@/lib/profit-loss/filter";
import { AccountTreeList } from "./account-tree-list";

export interface AccountFilterProps {
  /** Accounts parsed from the loaded Excel; empty shows the "carga un Excel" state. */
  accounts: AccountOption[];
  /** Focus selection (empty = no filter). */
  selected: ReadonlySet<string>;
  onToggle: (code: string) => void;
  onClear: () => void;
}

/**
 * "Cuenta contable" filter. The account list comes from the uploaded P&L Excel via
 * PygDataProvider; until one is loaded `accounts` is empty and the panel shows an empty
 * state. Selection is prop-driven so the Datos table can focus the chosen accounts.
 *
 * The tree itself — search, indent, chevrons — is `AccountTreeList`, shared with the vertical
 * analysis base picker. What stays here is what makes this control a FILTER: its trigger, its
 * "Quitar selección" footer, and multiple selection.
 */
export function AccountFilter({ accounts, selected, onToggle, onClear }: AccountFilterProps) {
  const isSelected = useCallback((code: string) => selected.has(code), [selected]);

  return (
    <Dropdown>
      <DropdownTrigger active={selected.size > 0} icon={<ListTree size={15} />}>
        {selected.size > 0 ? `Cuenta · ${selected.size}` : "Cuenta contable"}
      </DropdownTrigger>
      <DropdownPanel width={344}>
        <AccountTreeList
          accounts={accounts}
          isSelected={isSelected}
          onPick={onToggle}
          multiple
          emptyMessage="Carga un Excel de Pérdidas y Ganancias para filtrar por cuenta contable."
        />
        {accounts.length > 0 && (
          <DropdownFooter>
            <Button variant="ghost" size="sm" onClick={onClear}>
              Quitar selección
            </Button>
            <Button variant="primary" size="sm">
              Listo
            </Button>
          </DropdownFooter>
        )}
      </DropdownPanel>
    </Dropdown>
  );
}
