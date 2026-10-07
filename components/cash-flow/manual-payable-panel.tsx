"use client";

import { useCallback, useMemo, useState } from "react";
import { ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CreatableSelect } from "@/components/ui/creatable-select";
import { DateField } from "@/components/ui/date-field";
import { FieldBox, FormField, TextField } from "@/components/ui/form-field";
import { NumericInput } from "@/components/ui/numeric-input";
import { Select } from "@/components/ui/select";
import { Modal } from "@/components/ui/modal";
import * as cashDb from "@/lib/cash-flow/db";
import { BUILTIN_KINDS, customKinds, kindLabel, normalizeKind } from "@/lib/cash-flow/derive";
import type { Payable, PayableKind } from "@/lib/cash-flow/types";
import { resolveCenterId } from "@/lib/cash-flow/filters";
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
  const [dueOn, setDueOn] = useState<string | null>(obligation?.dueOn ?? null);
  const [centerId, setCenterId] = useState(
    resolveCenterId(obligation?.centerName ?? null, centers) ?? NO_CENTER,
  );
  const [description, setDescription] = useState(obligation?.description ?? "");
  const [error, setError] = useState<string | undefined>();
  const [kindError, setKindError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [configuring, setConfiguring] = useState(false);

  const save = useCallback(async () => {
    if (!activeClientId || busy) {
      return;
    }
    if (!supplier.trim()) {
      setError("Escribe el concepto o el beneficiario.");
      return;
    }
    const resolvedKind = normalizeKind(kind);
    if (!resolvedKind) {
      setKindError("Escribe el nombre de la clase nueva.");
      return;
    }
    if (!amount || amount <= 0) {
      setError("Escribe un monto mayor que cero.");
      return;
    }
    setBusy(true);
    try {
      const center = centers.find((candidate) => candidate.id === centerId);
      const input = {
        supplier,
        kind: resolvedKind,
        amount,
        dueOn,
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
      setError("No se pudo guardar la obligación. Intenta de nuevo.");
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
        <div className="flex flex-col gap-4">
          <TextField
            label="Concepto o beneficiario *"
            aria-required
            value={supplier}
            error={error}
            placeholder="Arriendo mes de marzo FC 00017"
            onChange={(event) => {
              setSupplier(event.target.value);
              setError(undefined);
            }}
          />
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Clase *" error={kindError}>
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
                    setKindError(undefined);
                  }
                }}
              />
            </FormField>
            <FormField label="Monto *">
              <FieldBox>
                <NumericInput
                  value={amount}
                  nullable
                  format="currency"
                  align="left"
                  placeholder="$0.00"
                  ariaLabel="Monto (obligatorio)"
                  onCommit={setAmount}
                />
              </FieldBox>
            </FormField>
            <FormField label="Vencimiento">
              <DateField value={dueOn} nullable ariaLabel="Vencimiento" onChange={setDueOn} />
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
