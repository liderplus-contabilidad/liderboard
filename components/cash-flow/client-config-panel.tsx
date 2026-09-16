"use client";

import { Landmark, MapPin, Plus, Trash2 } from "lucide-react";
import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import { FormField, TextField } from "@/components/ui/form-field";
import { NumericInput } from "@/components/ui/numeric-input";
import { Select } from "@/components/ui/select";
import { SidePanel } from "@/components/ui/side-panel";
import * as cashDb from "@/lib/cash-flow/db";
import { money } from "@/lib/cash-flow/derive";
import { sameCenterName } from "@/lib/cash-flow/flow";
import type { BankAccount, CashFlowCenter } from "@/lib/cash-flow/types";

import { useCashFlowData } from "./cash-flow-data-provider";

const NO_CENTER = "";

/**
 * «Configurar»: the empresa's CENTERS and BANK ACCOUNTS, in a drawer beside what they change. Both
 * are declared by the user and by nobody else — no file brings an overdraft, and the units of
 * Comisersa (HA · HC · HK) are a decision of the firm, not a column of any report.
 *
 * Centers first because an account names its center: with none declared, the account rows do not
 * offer the choice at all (the control that means nothing renders nothing).
 */
export function ClientConfigPanel({ onClose }: { onClose: () => void }) {
  const { activeClientId, activeClient, centers, accounts } = useCashFlowData();
  if (!activeClientId) {
    return null;
  }
  return (
    <SidePanel
      eyebrow="Configurar"
      title={activeClient?.name ?? "Empresa"}
      width={480}
      onClose={onClose}
    >
      <div className="flex flex-col gap-6 px-5 pb-6">
        <CentersSection clientId={activeClientId} centers={centers} />
        <AccountsSection clientId={activeClientId} centers={centers} accounts={accounts} />
      </div>
    </SidePanel>
  );
}

function SectionHeading({
  icon,
  title,
  hint,
}: {
  icon: React.ReactNode;
  title: string;
  hint: string;
}) {
  return (
    <div>
      <h3 className="flex items-center gap-2 text-[13px] font-bold tracking-[-0.1px] text-ink">
        <span className="text-faint">{icon}</span>
        {title}
      </h3>
      <p className="mt-0.5 text-[11.5px] leading-relaxed text-faint">{hint}</p>
    </div>
  );
}

function CentersSection({ clientId, centers }: { clientId: string; centers: CashFlowCenter[] }) {
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | undefined>();

  const add = useCallback(async () => {
    const name = draft.trim();
    if (!name) {
      setError("Escribe el nombre del centro.");
      return;
    }
    if (centers.some((center) => sameCenterName(center.name, name))) {
      setError(`«${name}» ya existe.`);
      return;
    }
    await cashDb.addCenter(clientId, name);
    setDraft("");
    setError(undefined);
  }, [clientId, centers, draft]);

  return (
    <section className="flex flex-col gap-3">
      <SectionHeading
        icon={<MapPin size={15} />}
        title="Centros"
        hint="Las unidades de la empresa (HA · HC · HK). Opcionales: sin centros, ningún control de centro se dibuja."
      />
      {centers.length > 0 && (
        <ul className="divide-y divide-border-soft rounded-[9px] border border-border">
          {centers.map((center) => (
            <li key={center.id} className="flex items-center gap-2 px-3 py-1.5">
              <input
                defaultValue={center.name}
                aria-label={`Nombre del centro ${center.name}`}
                onBlur={(event) => {
                  const name = event.target.value.trim();
                  if (name && name !== center.name) {
                    void cashDb.renameCenter(center.id, name);
                  } else {
                    event.target.value = center.name;
                  }
                }}
                className="min-w-0 flex-1 bg-transparent py-1 text-[13px] text-ink outline-none"
              />
              <Button
                variant="danger"
                size="sm"
                iconOnly
                icon={<Trash2 size={14} />}
                aria-label={`Eliminar centro ${center.name}`}
                onClick={() => void cashDb.deleteCenter(center.id)}
              />
            </li>
          ))}
        </ul>
      )}
      <div className="flex items-end gap-2">
        <TextField
          label="Nuevo centro"
          value={draft}
          error={error}
          placeholder="HA"
          fieldClassName="flex-1"
          onChange={(event) => {
            setDraft(event.target.value);
            setError(undefined);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              void add();
            }
          }}
        />
        <Button variant="secondary" size="md" icon={<Plus size={14} />} onClick={() => void add()}>
          Agregar
        </Button>
      </div>
    </section>
  );
}

function AccountsSection({
  clientId,
  centers,
  accounts,
}: {
  clientId: string;
  centers: CashFlowCenter[];
  accounts: BankAccount[];
}) {
  const [bank, setBank] = useState("");
  const [number, setNumber] = useState("");
  const [name, setName] = useState("");
  const [overdraft, setOverdraft] = useState<number | null>(0);
  const [centerId, setCenterId] = useState<string>(NO_CENTER);
  const [error, setError] = useState<string | undefined>();

  const centerOptions = [
    { value: NO_CENTER, label: "De la empresa" },
    ...centers.map((center) => ({ value: center.id, label: center.name })),
  ];

  const add = useCallback(async () => {
    if (!bank.trim()) {
      setError("Escribe el banco.");
      return;
    }
    await cashDb.addAccount(clientId, {
      bank,
      number,
      label: name,
      overdraft: overdraft ?? 0,
      centerId: centerId || null,
    });
    setBank("");
    setNumber("");
    setName("");
    setOverdraft(0);
    setCenterId(NO_CENTER);
    setError(undefined);
  }, [clientId, bank, number, name, overdraft, centerId]);

  return (
    <section className="flex flex-col gap-3">
      <SectionHeading
        icon={<Landmark size={15} />}
        title="Cuentas bancarias"
        hint="El banco tal como lo escribe el control de cheques (PRODUBANCO, PICHINCHA): así se reconoce la cuenta de cada cheque. El nombre es cómo la ves tú; el sobregiro se suma al saldo como disponible."
      />
      {accounts.length > 0 && (
        <ul className="divide-y divide-border-soft rounded-[9px] border border-border">
          {accounts.map((account) => (
            <li key={account.id} className="grid grid-cols-[1fr_auto] items-center gap-2 px-3 py-2">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 text-[13px] font-semibold text-ink">
                  <span className="truncate">{account.bank}</span>
                  {account.number && (
                    <span className="font-mono text-[12px] font-normal text-muted">
                      {account.number}
                    </span>
                  )}
                  <input
                    defaultValue={account.label ?? ""}
                    placeholder="Nombre (Produbanco HA)"
                    aria-label={`Nombre de la cuenta ${account.bank} ${account.number}`}
                    onBlur={(event) => {
                      if (event.target.value.trim() !== (account.label ?? "")) {
                        void cashDb.updateAccount(account.id, { label: event.target.value });
                      }
                    }}
                    className="ml-auto w-[160px] rounded-lg border border-transparent bg-transparent px-2 py-1 text-[12px] font-normal text-ink outline-none placeholder:text-faint hover:border-border focus:border-brand focus:bg-surface"
                  />
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-faint">
                  <span className="flex items-center gap-1.5">
                    Sobregiro
                    <NumericInput
                      value={account.overdraft}
                      format="currency"
                      ariaLabel={`Sobregiro de ${account.bank}`}
                      className="w-[110px]"
                      onCommit={(value) =>
                        void cashDb.updateAccount(account.id, { overdraft: value ?? 0 })
                      }
                    />
                  </span>
                  {centers.length > 0 && (
                    <Select
                      size="sm"
                      aria-label={`Centro de ${account.bank}`}
                      value={account.centerId ?? NO_CENTER}
                      options={centerOptions}
                      onChange={(event) =>
                        void cashDb.updateAccount(account.id, {
                          centerId: event.target.value || null,
                        })
                      }
                    />
                  )}
                </div>
              </div>
              <Button
                variant="danger"
                size="sm"
                iconOnly
                icon={<Trash2 size={14} />}
                aria-label={`Eliminar cuenta ${account.bank} ${account.number}`}
                onClick={() => void cashDb.deleteAccount(account.id)}
              />
            </li>
          ))}
        </ul>
      )}
      <div className="grid grid-cols-2 gap-2">
        <TextField
          label="Banco"
          value={bank}
          error={error}
          placeholder="PRODUBANCO"
          onChange={(event) => {
            setBank(event.target.value);
            setError(undefined);
          }}
        />
        <TextField
          label="Número"
          value={number}
          variant="mono"
          placeholder="80010385"
          onChange={(event) => setNumber(event.target.value)}
        />
        <TextField
          label="Nombre"
          value={name}
          placeholder="Produbanco HA"
          hint="Opcional: cómo se nombra la cuenta en pantalla y en el reporte."
          onChange={(event) => setName(event.target.value)}
        />
        <FormField label="Sobregiro" hint={overdraft ? money(overdraft) : undefined}>
          <NumericInput
            value={overdraft}
            format="currency"
            ariaLabel="Sobregiro de la cuenta nueva"
            onCommit={setOverdraft}
          />
        </FormField>
        {centers.length > 0 && (
          <Select
            label="Centro"
            value={centerId}
            options={centerOptions}
            onChange={(event) => setCenterId(event.target.value)}
          />
        )}
      </div>
      <div>
        <Button variant="secondary" size="md" icon={<Plus size={14} />} onClick={() => void add()}>
          Agregar cuenta
        </Button>
      </div>
    </section>
  );
}
