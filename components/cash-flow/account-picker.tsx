"use client";

import { ArrowUpRight } from "lucide-react";
import { useMemo, useState } from "react";
import { SearchableCreatableSelect } from "@/components/ui/creatable-select";
import * as cashDb from "@/lib/cash-flow/db";
import type { BankAccount } from "@/lib/cash-flow/types";
import { accountLabel } from "@/lib/cash-flow/flow";
import { normalizeLabel } from "@/lib/workspaces";
import { useCashFlowData } from "./cash-flow-data-provider";
import { ClientConfigPanel } from "./client-config-panel";

interface AccountPickerProps {
  value: string | null;
  onChange: (accountId: string | null, createdAccount?: BankAccount) => void;
  label?: string;
  emptyLabel?: string;
  disabled?: boolean;
  allowNone?: boolean;
  /** Table headers already name the field, so cells only render the compact control. */
  variant?: "field" | "cell";
  /** Retained for callers that previously positioned the expanded creation form. */
  creationClassName?: string;
}

/** Choose or create an account in one menu. Only the bank is required at creation;
 * its number, label and other configuration can be completed in Configurar. */
export function AccountPicker({
  label = "Cuenta",
  variant = "field",
  ...props
}: AccountPickerProps) {
  const { activeClientId } = useCashFlowData();
  const [configuring, setConfiguring] = useState(false);
  return (
    <div>
      {variant === "field" && (
        <div className="mb-1.5 flex items-center justify-between gap-2 text-[11px]">
          <span className="font-semibold text-faint">{label}</span>
          {activeClientId && (
            <button
              type="button"
              onClick={() => setConfiguring(true)}
              className="inline-flex items-center gap-1 rounded text-brand underline-offset-2 hover:underline focus-visible:outline-brand"
            >
              Configurar cuentas
              <ArrowUpRight size={12} aria-hidden className="shrink-0" />
            </button>
          )}
        </div>
      )}
      <AccountCombobox {...props} label={label} variant={variant} />
      {configuring && <ClientConfigPanel onClose={() => setConfiguring(false)} />}
    </div>
  );
}

function AccountCombobox({
  value,
  onChange,
  label = "Cuenta",
  emptyLabel = "Sin cuenta",
  disabled = false,
  allowNone = true,
  variant,
}: AccountPickerProps) {
  const { activeClientId, accounts, centers } = useCashFlowData();
  const options = useMemo(
    () =>
      accounts.map((account) => ({
        value: account.id,
        label: accountLabel(account, centers),
        search: [accountLabel(account, centers), account.bank, account.number].join(" "),
      })),
    [accounts, centers],
  );
  return (
    <SearchableCreatableSelect
      value={value}
      options={options}
      onChange={onChange}
      onCreate={async (bank) => {
        if (!activeClientId) return;
        const account = await cashDb.addAccount(activeClientId, {
          bank,
          number: "",
          label: "",
          overdraft: 0,
          centerId: null,
        });
        onChange(account.id, account);
      }}
      ariaLabel={label}
      placeholder={emptyLabel}
      searchLabel="Buscar cuenta o escribir un banco"
      searchPlaceholder="Buscar cuenta o escribir un banco…"
      createLabel={(query) => {
        const another = accounts.some(
          (account) => normalizeLabel(account.bank) === normalizeLabel(query),
        );
        return `${another ? "Crear otra cuenta" : "Crear cuenta"} de «${query}»`;
      }}
      clearLabel={allowNone ? emptyLabel : undefined}
      allowCreate={!!activeClientId}
      allowCreateMatching
      creationError="No se pudo crear la cuenta. Intenta de nuevo."
      disabled={disabled}
      variant={variant}
    />
  );
}
