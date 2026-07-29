"use client";

import { Divide } from "lucide-react";
import { useCallback } from "react";
import { Dropdown, DropdownPanel, DropdownTrigger } from "@/components/ui/dropdown";
import type { AccountOption } from "@/lib/profit-loss/filter";
import { AccountTreeList } from "./account-tree-list";

export interface AccountBasePickerProps {
  accounts: AccountOption[];
  /** The account every row of the vertical analysis divides by. */
  value: string;
  onChange: (code: string) => void;
}

/**
 * The denominator picker of the vertical analysis, in the CARD's header rather than in the
 * filter bar: it reads by a single card and names how that card expresses its numbers, not
 * which data the module reads. A control in the bar feeds all three tabs, and this one means
 * nothing to two of them.
 *
 * Single choice — a table divides by one account. Only accounts the source declares are
 * offered, so the derived «Utilidad o Pérdida» row never appears (it is not in `accounts`).
 */
export function AccountBasePicker({ accounts, value, onChange }: AccountBasePickerProps) {
  const isSelected = useCallback((code: string) => code === value, [value]);
  const picked = accounts.find((account) => account.code === value);

  return (
    <Dropdown>
      <DropdownTrigger active icon={<Divide size={15} />}>
        {picked ? `Base · ${picked.code} ${picked.name}` : "Base"}
      </DropdownTrigger>
      <DropdownPanel width={344}>
        <AccountTreeList
          accounts={accounts}
          isSelected={isSelected}
          onPick={onChange}
          multiple={false}
          emptyMessage="Carga un Excel de Pérdidas y Ganancias para elegir la cuenta base."
        />
      </DropdownPanel>
    </Dropdown>
  );
}
