"use client";

import { useCallback, useId, useMemo, useRef, useState } from "react";
import { ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CreatableSelect } from "@/components/ui/creatable-select";
import { DateInput } from "@/components/ui/date-input";
import { FieldBox, FormField, TextField } from "@/components/ui/form-field";
import { NumericInput } from "@/components/ui/numeric-input";
import { Select } from "@/components/ui/select";
import { Modal } from "@/components/ui/modal";
import * as cashDb from "@/lib/cash-flow/db";
import { BUILTIN_KINDS, customKinds, kindLabel, normalizeKind } from "@/lib/cash-flow/derive";
import type { Payable, PayableKind } from "@/lib/cash-flow/types";
import { resolveCenterId } from "@/lib/cash-flow/filters";
import { formatDayMonthYear } from "@/lib/date";
import { parseDateInput } from "@/lib/date-input";
import {
  validateManualObligationForm,
  type ManualObligationFormErrors,
} from "@/lib/cash-flow/manual-obligation-form";
import { useCashFlowData } from "./cash-flow-data-provider";
import { ClientConfigPanel } from "./client-config-panel";

const NO_CENTER = "";

/** Manual obligations belong to Flujo and stay there until paid or removed. */
export function ManualPayablePanel({
  onClose,
  obligation,
}: {
  onClose: () => void;
  obligation?: Payable;
}) {
  const { activeClientId, centers, obligations, asOf } = useCashFlowData();
  const [supplier, setSupplier] = useState(obligation?.supplier ?? "");
  const [kind, setKind] = useState<PayableKind>(obligation?.kind ?? "otros");
  const kindOptions = useMemo(
    () => [...new Set([...BUILTIN_KINDS, ...customKinds(obligations), kind].map(kindLabel))],
    [obligations, kind],
  );
  const [amount, setAmount] = useState<number | null>(obligation?.amount ?? null);
  const [dueOn, setDueOn] = useState(formatDayMonthYear(obligation?.dueOn ?? null) ?? "");
  const [centerId, setCenterId] = useState(
    resolveCenterId(obligation?.centerName ?? null, centers) ?? NO_CENTER,
  );
  const [description, setDescription] = useState(obligation?.description ?? "");
  const [errors, setErrors] = useState<ManualObligationFormErrors>({});
  const [saveError, setSaveError] = useState<string>();
  const formRef = useRef<HTMLDivElement>(null);
  const messageId = useId();
  const [busy, setBusy] = useState(false);
  const [configuring, setConfiguring] = useState(false);

  const save = useCallback(async () => {
    if (!activeClientId || busy) {
      return;
    }
    const validation = validateManualObligationForm({ supplier, kind, amount, dueOn });
    setErrors(validation);
    setSaveError(undefined);
    if (Object.keys(validation).length) {
      const selector = validation.supplier
        ? '[aria-label="Concepto o beneficiario"]'
        : validation.kind
          ? '[data-slot="combobox-trigger"]'
          : validation.amount
            ? '[aria-label="Monto (obligatorio)"]'
            : '[aria-label="Vencimiento"]';
      formRef.current?.querySelector<HTMLElement>(selector)?.focus();
      return;
    }
    const resolvedKind = normalizeKind(kind);
    if (!resolvedKind || amount === null) return;
    setBusy(true);
    try {
      const center = centers.find((candidate) => candidate.id === centerId);
      const input = {
        supplier,
        kind: resolvedKind,
        amount,
        dueOn: parseDateInput(dueOn),
        centerName: center?.name ?? null,
        description,
      };
      if (obligation) {
        await cashDb.updateManualObligation(activeClientId, obligation.id, input);
      } else {
        await cashDb.addManualObligation(activeClientId, input, asOf);
      }
      onClose();
    } catch {
      setSaveError("No se pudo guardar la obligación. Intenta de nuevo.");
    } finally {
      setBusy(false);
    }
  }, [
    activeClientId,
    supplier,
    amount,
    kind,
    dueOn,
    centerId,
    centers,
    description,
    obligation,
    asOf,
    busy,
    onClose,
  ]);

  return (
    <>
      <Modal
        open
        title={obligation ? "Editar obligación" : "Agregar obligación"}
        width={720}
        onClose={onClose}
      >
        <div ref={formRef} className="flex flex-col gap-4">
          <TextField
            label="Concepto o beneficiario *"
            aria-required
            aria-label="Concepto o beneficiario"
            value={supplier}
            error={errors.supplier}
            messageId={`${messageId}-supplier`}
            placeholder="Arriendo mes de marzo FC 00017"
            onChange={(event) => {
              setSupplier(event.target.value);
              setErrors((current) => ({ ...current, supplier: undefined }));
            }}
          />
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Clase *" error={errors.kind}>
              <CreatableSelect
                value={kindLabel(kind)}
                options={kindOptions}
                ariaLabel="Clase (obligatoria)"
                placeholder="Seleccionar o agregar clase"
                searchLabel="Buscar o agregar clase"
                searchPlaceholder="Buscar o escribir una clase…"
                createLabel="Agregar clase"
                onChange={(value) => {
                  const resolvedKind = normalizeKind(value);
                  if (resolvedKind) {
                    setKind(resolvedKind);
                    setErrors((current) => ({ ...current, kind: undefined }));
                  }
                }}
              />
            </FormField>
            <FormField label="Monto *" error={errors.amount} messageId={`${messageId}-amount`}>
              <FieldBox invalid={!!errors.amount}>
                <NumericInput
                  value={amount}
                  nullable
                  format="currency"
                  align="left"
                  placeholder="$0.00"
                  ariaLabel="Monto (obligatorio)"
                  ariaInvalid={!!errors.amount}
                  ariaDescribedBy={errors.amount ? `${messageId}-amount` : undefined}
                  onCommit={(value) => {
                    setAmount(value);
                    setErrors((current) => ({ ...current, amount: undefined }));
                  }}
                />
              </FieldBox>
            </FormField>
            <FormField label="Vencimiento" error={errors.dueOn} messageId={`${messageId}-dueOn`}>
              <DateInput
                value={dueOn}
                ariaLabel="Vencimiento"
                ariaDescribedBy={`${messageId}-dueOn`}
                invalid={!!errors.dueOn}
                onChange={(value) => {
                  setDueOn(value);
                  const validation =
                    value.length === 10
                      ? validateManualObligationForm({ supplier, kind, amount, dueOn: value })
                      : {};
                  setErrors((current) => ({ ...current, dueOn: validation.dueOn }));
                }}
                onBlur={() => {
                  const validation = validateManualObligationForm({
                    supplier,
                    kind,
                    amount,
                    dueOn,
                  });
                  setErrors((current) => ({ ...current, dueOn: validation.dueOn }));
                }}
              />
            </FormField>
            {activeClientId && (
              <div>
                <div className="mb-1.5 flex items-center justify-between gap-2 text-[11px]">
                  <span className="font-semibold text-faint">Centro</span>
                  <button
                    type="button"
                    onClick={() => setConfiguring(true)}
                    className="inline-flex items-center gap-1 rounded text-brand underline-offset-2 hover:underline focus-visible:outline-brand"
                  >
                    Configurar centros
                    <ArrowUpRight size={12} aria-hidden className="shrink-0" />
                  </button>
                </div>
                {centers.length > 0 ? (
                  <Select
                    aria-label="Centro"
                    value={centerId}
                    options={[
                      { value: NO_CENTER, label: "De la empresa" },
                      ...centers.map((center) => ({ value: center.id, label: center.name })),
                    ]}
                    onChange={(event) => setCenterId(event.target.value)}
                  />
                ) : (
                  <p className="text-[12px] text-muted">Sin centros configurados.</p>
                )}
              </div>
            )}
          </div>
          <TextField
            label="Detalle"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
          {saveError && (
            <p role="alert" className="text-[12px] text-negative">
              {saveError}
            </p>
          )}
          <div className="flex items-center justify-end gap-2 border-t border-border-soft pt-4">
            <Button variant="secondary" size="sm" disabled={busy} onClick={onClose}>
              Cancelar
            </Button>
            <Button size="sm" disabled={busy} onClick={() => void save()}>
              Guardar
            </Button>
          </div>
        </div>
      </Modal>
      {configuring && <ClientConfigPanel onClose={() => setConfiguring(false)} />}
    </>
  );
}
