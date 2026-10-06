"use client";

import { useCallback, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { DateField } from "@/components/ui/date-field";
import { FieldBox, FormField, TextField } from "@/components/ui/form-field";
import { NumericInput } from "@/components/ui/numeric-input";
import { Select } from "@/components/ui/select";
import { SidePanel } from "@/components/ui/side-panel";
import * as cashDb from "@/lib/cash-flow/db";
import { BUILTIN_KINDS, customKinds, kindLabel, normalizeKind } from "@/lib/cash-flow/derive";
import type { Payable, PayableKind } from "@/lib/cash-flow/types";
import { resolveCenterId } from "@/lib/cash-flow/filters";
import { useCashFlowData } from "./cash-flow-data-provider";

const NO_CENTER = "";
/** The option that opens the name field: never a class itself, so no typed name can collide. */
const NEW_KIND = "\u0000new";

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
  const [newKind, setNewKind] = useState("");
  const used = useMemo(() => customKinds(obligations), [obligations]);
  const [amount, setAmount] = useState<number | null>(obligation?.amount ?? null);
  const [dueOn, setDueOn] = useState<string | null>(obligation?.dueOn ?? null);
  const [centerId, setCenterId] = useState(
    resolveCenterId(obligation?.centerName ?? null, centers) ?? NO_CENTER,
  );
  const [description, setDescription] = useState(obligation?.description ?? "");
  const [error, setError] = useState<string | undefined>();
  const [kindError, setKindError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  const save = useCallback(async () => {
    if (!activeClientId || busy) {
      return;
    }
    if (!supplier.trim()) {
      setError("Escribe el concepto o el beneficiario.");
      return;
    }
    const resolvedKind = kind === NEW_KIND ? normalizeKind(newKind) : kind;
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
    newKind,
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
    <SidePanel
      eyebrow="Flujo"
      title={obligation ? "Editar obligación" : "Agregar obligación"}
      width={440}
      onClose={onClose}
    >
      <div className="flex flex-col gap-4 px-5 pb-6">
        <TextField
          label="Concepto o beneficiario"
          value={supplier}
          error={error}
          placeholder="Arriendo mes de marzo FC 00017"
          onChange={(event) => {
            setSupplier(event.target.value);
            setError(undefined);
          }}
        />
        <div className="grid grid-cols-2 gap-3">
          <Select
            label="Clase"
            value={kind}
            options={[
              ...BUILTIN_KINDS.map((value) => ({ value, label: kindLabel(value) })),
              ...used.map((value) => ({ value, label: kindLabel(value) })),
              { value: NEW_KIND, label: "Nueva clase…" },
            ]}
            onChange={(event) => {
              setKind(event.target.value);
              setKindError(undefined);
            }}
          />
          <FormField label="Monto">
            <FieldBox>
              <NumericInput
                value={amount}
                nullable
                format="currency"
                align="left"
                placeholder="$0.00"
                ariaLabel="Monto"
                onCommit={setAmount}
              />
            </FieldBox>
          </FormField>
          <FormField label="Vencimiento" hint="Opcional">
            <DateField value={dueOn} nullable ariaLabel="Vencimiento" onChange={setDueOn} />
          </FormField>
          {centers.length > 0 && (
            <Select
              label="Centro"
              value={centerId}
              options={[
                { value: NO_CENTER, label: "De la empresa" },
                ...centers.map((center) => ({ value: center.id, label: center.name })),
              ]}
              onChange={(event) => setCenterId(event.target.value)}
            />
          )}
        </div>
        {kind === NEW_KIND && (
          <TextField
            label="Nombre de la clase"
            value={newKind}
            error={kindError}
            placeholder="Servicios básicos"
            onChange={(event) => {
              setNewKind(event.target.value);
              setKindError(undefined);
            }}
          />
        )}
        <TextField
          label="Detalle"
          value={description}
          placeholder="Opcional"
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
    </SidePanel>
  );
}
