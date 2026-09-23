"use client";

import { ChevronRight, Landmark, MapPin, Plus, Printer, Trash2 } from "lucide-react";
import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import { FieldBox, FormField, TextField } from "@/components/ui/form-field";
import { NumericInput } from "@/components/ui/numeric-input";
import { Select } from "@/components/ui/select";
import { SidePanel } from "@/components/ui/side-panel";
import * as cashDb from "@/lib/cash-flow/db";
import { money } from "@/lib/cash-flow/derive";
import { sameCenterName } from "@/lib/cash-flow/flow";
import { cn } from "@/lib/cn";
import type { BankAccount, CashFlowCenter } from "@/lib/cash-flow/types";

import { useCashFlowData } from "./cash-flow-data-provider";
import { CheckLayoutModal } from "./check-layout-modal";

const NO_CENTER = "";

/**
 * «Configurar»: the empresa's CENTERS and BANK ACCOUNTS, in a drawer beside what they change. Both
 * are declared by the user and by nobody else — no file brings an overdraft, and the units of
 * Comisersa (HA · HC · HK) are a decision of the firm, not a column of any report.
 *
 * Centers first because an account names its center: with none declared, the account rows do not
 * offer the choice at all (the control that means nothing renders nothing).
 *
 * Each account also carries its CHECK FORMAT, beside its own row. The comprobante's letterhead is not
 * here: it is completed in the comprobante's own window and kept from there.
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

function SectionHeading({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <h3 className="flex items-center gap-2 text-[13px] font-bold tracking-[-0.1px] text-ink">
      <span className="text-faint">{icon}</span>
      {title}
    </h3>
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
      <SectionHeading icon={<MapPin size={15} />} title="Centros" />
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

/** What a FOLDED row says under its heading: bank · number, the overdraft and the center. */
function accountSummary(account: BankAccount, centers: readonly CashFlowCenter[]): string {
  const center = centers.find((candidate) => candidate.id === account.centerId)?.name;
  return [
    account.label?.trim() ? [account.bank, account.number].filter(Boolean).join(" · ") : null,
    `Sobregiro ${money(account.overdraft)}`,
    centers.length > 0 ? (center ?? "De la empresa") : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

/** The row's heading: the user's name for the account, else bank + number. */
function accountTitle(account: BankAccount): string {
  return (
    account.label?.trim() ||
    [account.bank, account.number].filter(Boolean).join(" · ") ||
    "Cuenta sin banco"
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
  const { asOf } = useCashFlowData();
  const [formatting, setFormatting] = useState<BankAccount | null>(null);
  // The accounts OPEN to edit. All start folded: an empresa can hold several, and the list must
  // read as a list of accounts before it reads as a stack of forms.
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());
  const toggle = useCallback(
    (id: string) =>
      setExpanded((current) => {
        const next = new Set(current);
        if (!next.delete(id)) {
          next.add(id);
        }
        return next;
      }),
    [],
  );

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
      <SectionHeading icon={<Landmark size={15} />} title="Cuentas bancarias" />
      {accounts.length > 0 && (
        <ul className="divide-y divide-border-soft rounded-[9px] border border-border">
          {accounts.map((account) => (
            <li key={account.id} className="flex flex-col gap-2.5 px-3.5 py-2.5">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  aria-expanded={expanded.has(account.id)}
                  onClick={() => toggle(account.id)}
                  className="-ml-1 flex min-w-0 flex-1 items-center gap-1.5 rounded-md px-1 py-1 text-left hover:bg-canvas"
                >
                  <ChevronRight
                    size={15}
                    className={cn(
                      "shrink-0 text-faint transition-transform",
                      expanded.has(account.id) && "rotate-90",
                    )}
                  />
                  <span className="min-w-0">
                    <span className="block truncate text-[13px] font-semibold text-ink">
                      {accountTitle(account)}
                    </span>
                    {!expanded.has(account.id) && (
                      <span className="block truncate text-[11.5px] tabular-nums text-faint">
                        {accountSummary(account, centers)}
                      </span>
                    )}
                  </span>
                </button>
                <Button
                  variant="ghost"
                  size="sm"
                  icon={<Printer size={13} />}
                  onClick={() => setFormatting(account)}
                >
                  Formato de cheque
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  iconOnly
                  icon={<Trash2 size={14} />}
                  aria-label={`Eliminar cuenta ${account.bank} ${account.number}`}
                  onClick={() => void cashDb.deleteAccount(account.id)}
                />
              </div>
              {expanded.has(account.id) && (
                <div className="grid grid-cols-2 gap-2">
                  <TextField
                    label="Banco"
                    defaultValue={account.bank}
                    placeholder="PRODUBANCO"
                    hint="Como lo escribe el registro de cheques"
                    onBlur={(event) => {
                      const value = event.target.value.trim();
                      if (!value) {
                        // The bank is what a check's label resolves by: it cannot be left empty.
                        event.target.value = account.bank;
                      } else if (value !== account.bank) {
                        void cashDb.updateAccount(account.id, { bank: value });
                      }
                    }}
                  />
                  <TextField
                    label="Número"
                    variant="mono"
                    defaultValue={account.number}
                    placeholder="80010385"
                    onBlur={(event) => {
                      if (event.target.value.trim() !== account.number) {
                        void cashDb.updateAccount(account.id, { number: event.target.value });
                      }
                    }}
                  />
                  <TextField
                    label="Nombre"
                    hint="Opcional"
                    defaultValue={account.label ?? ""}
                    placeholder="Produbanco HA"
                    onBlur={(event) => {
                      if (event.target.value.trim() !== (account.label ?? "")) {
                        void cashDb.updateAccount(account.id, { label: event.target.value });
                      }
                    }}
                  />
                  <FormField label="Sobregiro">
                    <FieldBox>
                      <NumericInput
                        value={account.overdraft}
                        format="currency"
                        align="left"
                        ariaLabel={`Sobregiro de ${account.bank}`}
                        onCommit={(value) =>
                          void cashDb.updateAccount(account.id, { overdraft: value ?? 0 })
                        }
                      />
                    </FieldBox>
                  </FormField>
                  {centers.length > 0 && (
                    <div className="col-span-2">
                      <Select
                        label="Centro"
                        value={account.centerId ?? NO_CENTER}
                        options={centerOptions}
                        onChange={(event) =>
                          void cashDb.updateAccount(account.id, {
                            centerId: event.target.value || null,
                          })
                        }
                      />
                    </div>
                  )}
                </div>
              )}
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
          hint="Opcional"
          onChange={(event) => setName(event.target.value)}
        />
        <FormField label="Sobregiro" hint={overdraft ? money(overdraft) : undefined}>
          <FieldBox>
            <NumericInput
              value={overdraft}
              format="currency"
              align="left"
              placeholder="$0.00"
              ariaLabel="Sobregiro de la cuenta nueva"
              onCommit={setOverdraft}
            />
          </FieldBox>
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
      {formatting && (
        <CheckLayoutModal account={formatting} date={asOf} onClose={() => setFormatting(null)} />
      )}
    </section>
  );
}
