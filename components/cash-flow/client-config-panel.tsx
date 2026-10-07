"use client";

import { Eye, Pencil, Plus, Printer, Save, Search, Trash2 } from "lucide-react";
import { useCallback, useState } from "react";
import { OverdraftDateFields } from "./overdraft-date-fields";
import { overdraftDatesError } from "@/lib/cash-flow/overdraft";
import { Button } from "@/components/ui/button";
import { FieldBox, FormField, TextField } from "@/components/ui/form-field";
import { NumericInput } from "@/components/ui/numeric-input";
import { Select } from "@/components/ui/select";
import { CashFlowSidePanel } from "./cash-flow-side-panel";
import * as cashDb from "@/lib/cash-flow/db";
import { money } from "@/lib/cash-flow/derive";
import { sameCenterName } from "@/lib/cash-flow/flow";
import { normalizeLabel } from "@/lib/workspaces";
import type { BankAccount, CashFlowCenter } from "@/lib/cash-flow/types";

import { useCashFlowData } from "./cash-flow-data-provider";
import { CheckLayoutModal } from "./check-layout-modal";
import { AccountDetailSheet } from "./account-detail-sheet";

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
    <CashFlowSidePanel
      eyebrow="Configurar"
      title={activeClient?.name ?? "Empresa"}
      onClose={onClose}
    >
      <div className="flex flex-col gap-6 pb-6">
        <CentersSection clientId={activeClientId} centers={centers} />
        <AccountsSection clientId={activeClientId} centers={centers} accounts={accounts} />
      </div>
    </CashFlowSidePanel>
  );
}

function CentersSection({ clientId, centers }: { clientId: string; centers: CashFlowCenter[] }) {
  const [query, setQuery] = useState("");
  const visibleCenters = centers.filter((center) =>
    normalizeLabel(center.name).includes(normalizeLabel(query)),
  );
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string>();
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | undefined>();

  const closeForm = useCallback(() => {
    setCreating(false);
    setDraft("");
    setError(undefined);
    setSaveError(undefined);
  }, []);

  const add = useCallback(async () => {
    if (saving) return;
    const name = draft.trim();
    if (!name) {
      setError("Escribe el nombre del centro.");
      return;
    }
    if (centers.some((center) => sameCenterName(center.name, name))) {
      setError(`«${name}» ya existe.`);
      return;
    }
    setSaving(true);
    setSaveError(undefined);
    try {
      await cashDb.addCenter(clientId, name);
      closeForm();
    } catch {
      setSaveError("No se pudo guardar el centro. Intenta de nuevo.");
    } finally {
      setSaving(false);
    }
  }, [clientId, centers, draft, saving, closeForm]);

  return (
    <section aria-label="Centros" className="flex flex-col gap-4 border-b border-border-soft pb-6">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-[15px] font-semibold text-ink">Centros</h3>
        {!creating && (
          <Button
            variant="primary"
            size="toolbar"
            icon={<Plus size={14} />}
            onClick={() => setCreating(true)}
          >
            Crear centro
          </Button>
        )}
      </div>
      <div className="flex items-center gap-2.5 rounded-[9px] bg-surface-muted px-3 py-2.5 focus-within:outline focus-within:outline-1 focus-within:outline-brand">
        <Search size={16} aria-hidden className="shrink-0 text-muted" />
        <input
          aria-label="Buscar centros"
          placeholder="Buscar centro por nombre…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="w-full border-0 bg-transparent text-[13px] text-ink outline-none placeholder:text-muted"
        />
      </div>
      {creating && (
        <form
          aria-label="Nuevo centro"
          className="border-b border-border-soft pb-4"
          onSubmit={(event) => {
            event.preventDefault();
            void add();
          }}
        >
          <fieldset disabled={saving} className="flex flex-col gap-3">
            <legend className="mb-3 text-[13px] font-semibold text-ink">Nuevo centro</legend>
            <TextField
              label={<span className="sr-only">Nombre del centro</span>}
              required
              value={draft}
              error={error}
              placeholder="Ej. Hotel, Restaurante o HA"
              onChange={(event) => {
                setDraft(event.target.value);
                setError(undefined);
              }}
            />
            {saveError && (
              <p role="alert" className="text-[12px] text-negative">
                {saveError}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="secondary" size="md" onClick={closeForm}>
                Cancelar
              </Button>
              <Button type="submit" size="md">
                {saving ? "Creando…" : "Crear centro"}
              </Button>
            </div>
          </fieldset>
        </form>
      )}
      <ul className="divide-y divide-border-soft">
        {visibleCenters.map((center) => (
          <li key={center.id} className="flex items-center gap-2 py-3">
            <input
              defaultValue={center.name}
              aria-label={`Nombre del centro ${center.name}`}
              onBlur={(event) => {
                const name = event.target.value.trim();
                if (name && name !== center.name) void cashDb.renameCenter(center.id, name);
                else event.target.value = center.name;
              }}
              className="min-w-0 flex-1 rounded-[9px] border border-transparent bg-transparent px-1 py-2 text-[13px] font-medium text-ink outline-none hover:bg-canvas focus:border-brand focus:bg-surface"
            />
            <Button
              variant="ghost"
              size="sm"
              iconOnly
              icon={<Pencil size={14} />}
              aria-label={`Editar centro ${center.name}`}
              title="Editar nombre"
              onClick={(event) => {
                const input = event.currentTarget.parentElement?.querySelector("input");
                input?.focus();
                input?.select();
              }}
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
      {visibleCenters.length === 0 && !creating && (
        <p className="py-3 text-[13px] text-muted">
          {centers.length
            ? "No hay centros que coincidan con la búsqueda."
            : "Crea el primer centro de esta empresa."}
        </p>
      )}
      {visibleCenters.length > 0 && (
        <p className="inline-flex items-center gap-1.5 text-[11.5px] text-muted">
          <Save size={13} aria-hidden />
          Los cambios de nombre se guardan al salir del campo.
        </p>
      )}
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
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string>();
  const [bank, setBank] = useState("");
  const [number, setNumber] = useState("");
  const [name, setName] = useState("");
  const [overdraft, setOverdraft] = useState<number | null>(0);
  const [overdraftStartsOn, setOverdraftStartsOn] = useState<string | null>(null);
  const [overdraftEndsOn, setOverdraftEndsOn] = useState<string | null>(null);
  const [dateError, setDateError] = useState<string>();
  const [accountError, setAccountError] = useState<{ id: string; message: string } | null>(null);
  const [centerId, setCenterId] = useState<string>(NO_CENTER);
  const [error, setError] = useState<string | undefined>();
  const { asOf } = useCashFlowData();
  const [formatting, setFormatting] = useState<BankAccount | null>(null);
  const [query, setQuery] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const toggle = useCallback(
    (id: string) => setExpandedId((current) => (current === id ? null : id)),
    [],
  );
  const visibleAccounts = accounts.filter((account) =>
    normalizeLabel([accountTitle(account), account.bank, account.number].join(" ")).includes(
      normalizeLabel(query),
    ),
  );

  const detailAccount = accounts.find((account) => account.id === expandedId);
  const centerOptions = [
    { value: NO_CENTER, label: "De la empresa" },
    ...centers.map((center) => ({ value: center.id, label: center.name })),
  ];

  const closeForm = useCallback(() => {
    setCreating(false);
    setBank("");
    setNumber("");
    setName("");
    setOverdraft(0);
    setOverdraftStartsOn(null);
    setOverdraftEndsOn(null);
    setDateError(undefined);
    setCenterId(NO_CENTER);
    setError(undefined);
    setSaveError(undefined);
  }, []);

  const add = useCallback(async () => {
    if (saving) return;
    if (!bank.trim()) {
      setError("Escribe el banco.");
      return;
    }
    const dateError = overdraftDatesError({ overdraftStartsOn, overdraftEndsOn });
    if (dateError) {
      setDateError(dateError);
      return;
    }
    setSaving(true);
    setSaveError(undefined);
    try {
      await cashDb.addAccount(clientId, {
        bank,
        number,
        label: name,
        overdraft: overdraft ?? 0,
        overdraftStartsOn,
        overdraftEndsOn,
        centerId: centerId || null,
      });
      closeForm();
    } catch {
      setSaveError("No se pudo guardar la cuenta. Intenta de nuevo.");
    } finally {
      setSaving(false);
    }
  }, [
    clientId,
    bank,
    number,
    name,
    overdraft,
    centerId,
    overdraftStartsOn,
    overdraftEndsOn,
    saving,
    closeForm,
  ]);

  return (
    <section aria-label="Cuentas bancarias" className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-[15px] font-semibold text-ink">Cuentas bancarias</h3>
        {!creating && (
          <Button
            variant="primary"
            size="toolbar"
            icon={<Plus size={14} />}
            onClick={() => {
              setCreating(true);
              setExpandedId(null);
            }}
          >
            Crear cuenta
          </Button>
        )}
      </div>
      <div className="flex items-center gap-2.5 rounded-[9px] bg-surface-muted px-3 py-2.5 focus-within:outline focus-within:outline-1 focus-within:outline-brand">
        <Search size={16} aria-hidden className="shrink-0 text-muted" />
        <input
          aria-label="Buscar cuentas bancarias"
          placeholder="Buscar por nombre, banco o número…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="w-full border-0 bg-transparent text-[13px] text-ink outline-none placeholder:text-muted"
        />
      </div>
      {creating && (
        <form
          aria-label="Nueva cuenta bancaria"
          className="rounded-[13px] border border-border bg-surface p-4"
          onSubmit={(event) => {
            event.preventDefault();
            void add();
          }}
        >
          <fieldset disabled={saving} className="flex flex-col gap-4">
            <legend className="mb-3 text-[13px] font-semibold text-ink">
              Nueva cuenta bancaria
            </legend>
            <div className="grid grid-cols-2 gap-x-4 gap-y-3">
              <TextField
                label="Banco *"
                required
                value={bank}
                error={error}
                placeholder="Ej. Produbanco"
                onChange={(event) => {
                  setBank(event.target.value);
                  setError(undefined);
                }}
              />
              <TextField
                label="Número de cuenta"
                value={number}
                variant="mono"
                placeholder="Ej. 80010385"
                onChange={(event) => setNumber(event.target.value)}
              />
              <TextField
                label="Nombre de la cuenta"
                value={name}
                placeholder="Ej. Produbanco HA"
                onChange={(event) => setName(event.target.value)}
              />
              {centers.length > 0 && (
                <Select
                  label="Centro"
                  value={centerId}
                  options={centerOptions}
                  onChange={(event) => setCenterId(event.target.value)}
                />
              )}
              <h4 className="col-span-2 mt-2 border-t border-border-soft pt-4 text-[13px] font-semibold text-ink">
                Sobregiro y vigencia
              </h4>
              <FormField label="Límite de sobregiro">
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
              <div className="col-span-2 grid grid-cols-2 gap-4">
                <OverdraftDateFields
                  startsOn={overdraftStartsOn}
                  endsOn={overdraftEndsOn}
                  error={dateError}
                  onChange={(patch) => {
                    if ("overdraftStartsOn" in patch)
                      setOverdraftStartsOn(patch.overdraftStartsOn ?? null);
                    if ("overdraftEndsOn" in patch)
                      setOverdraftEndsOn(patch.overdraftEndsOn ?? null);
                    setDateError(undefined);
                  }}
                />
              </div>
            </div>
            {saveError && (
              <p role="alert" className="text-[12px] text-negative">
                {saveError}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="secondary" size="md" onClick={closeForm}>
                Cancelar
              </Button>
              <Button type="submit" size="md">
                {saving ? "Creando…" : "Crear cuenta"}
              </Button>
            </div>
          </fieldset>
        </form>
      )}
      <ul>
        {visibleAccounts.map((account) => (
          <li key={account.id} className="border-b border-border-soft py-4 last:border-b-0">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <h4 className="text-[13px] font-semibold text-ink">{accountTitle(account)}</h4>
                <p className="mt-0.5 text-[12px] tabular-nums leading-relaxed text-muted">
                  {accountSummary(account, centers)}
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                icon={<Eye size={14} />}
                iconOnly
                aria-label={`Ver detalle de ${accountTitle(account)}`}
                title="Ver detalle"
                onClick={() => toggle(account.id)}
                className="shrink-0 text-brand"
              />
            </div>
            {expandedId === account.id && (
              <AccountDetailSheet
                title={accountTitle(account)}
                summary={accountSummary(account, centers)}
                onClose={() => setExpandedId(null)}
              >
                <div
                  id={`account-detail-${account.id}`}
                  className="mt-5 grid grid-cols-2 gap-x-4 gap-y-4 [&_label]:text-muted"
                >
                  <h5 className="col-span-2 text-[13px] font-semibold text-ink">
                    Datos de la cuenta
                  </h5>
                  <TextField
                    label="Banco *"
                    required
                    defaultValue={account.bank}
                    placeholder="Ej. Produbanco"
                    hint="Debe coincidir con el banco del registro de cheques."
                    onBlur={(event) => {
                      const bank = event.target.value.trim();
                      if (!bank) event.target.value = account.bank;
                      else if (bank !== account.bank)
                        void cashDb.updateAccount(account.id, { bank });
                    }}
                  />
                  <TextField
                    label="Número de cuenta"
                    variant="mono"
                    defaultValue={account.number}
                    placeholder="Ej. 80010385"
                    onBlur={(event) => {
                      if (event.target.value.trim() !== account.number)
                        void cashDb.updateAccount(account.id, { number: event.target.value });
                    }}
                  />
                  <TextField
                    label="Nombre de la cuenta"
                    defaultValue={account.label ?? ""}
                    placeholder="Ej. Produbanco HA"
                    onBlur={(event) => {
                      if (event.target.value.trim() !== (account.label ?? ""))
                        void cashDb.updateAccount(account.id, { label: event.target.value });
                    }}
                  />
                  {centers.length > 0 && (
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
                  )}
                  <h4 className="col-span-2 mt-2 border-t border-border-soft pt-4 text-[13px] font-semibold text-ink">
                    Sobregiro y vigencia
                  </h4>
                  <FormField label="Límite de sobregiro">
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
                  <div className="col-span-2 grid grid-cols-2 gap-4">
                    <OverdraftDateFields
                      startsOn={account.overdraftStartsOn ?? null}
                      endsOn={account.overdraftEndsOn ?? null}
                      error={accountError?.id === account.id ? accountError.message : undefined}
                      onChange={(patch) => {
                        void cashDb.updateAccount(account.id, patch).then(
                          () => setAccountError(null),
                          (error: Error) =>
                            setAccountError({ id: account.id, message: error.message }),
                        );
                      }}
                    />
                  </div>
                  <div className="col-span-2 flex items-center justify-between gap-3 text-[11.5px] text-muted">
                    <span className="inline-flex items-center gap-1.5">
                      <Save size={13} aria-hidden />
                      Guardado automático al salir del campo
                    </span>
                    <span>* Obligatorio</span>
                  </div>
                  <div className="col-span-2 flex items-center justify-between border-t border-border-soft pt-3">
                    <Button
                      variant="secondary"
                      size="sm"
                      icon={<Printer size={13} />}
                      onClick={() => setFormatting(account)}
                    >
                      Formato de cheque
                    </Button>
                    <Button
                      variant="danger"
                      size="sm"
                      icon={<Trash2 size={14} />}
                      onClick={() => void cashDb.deleteAccount(account.id)}
                    >
                      Eliminar cuenta
                    </Button>
                  </div>
                </div>
              </AccountDetailSheet>
            )}
          </li>
        ))}
      </ul>
      {!detailAccount && visibleAccounts.length === 0 && !creating && (
        <p className="py-6 text-[13px] text-muted">
          {accounts.length
            ? "No hay cuentas que coincidan con la búsqueda."
            : "Agrega la primera cuenta bancaria de esta empresa."}
        </p>
      )}
      {formatting && (
        <CheckLayoutModal account={formatting} date={asOf} onClose={() => setFormatting(null)} />
      )}
    </section>
  );
}
