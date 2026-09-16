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
import type { PayableKind } from "@/lib/cash-flow/types";
import { useCashFlowData } from "./cash-flow-data-provider";

const NO_CENTER = "";
/** The option that opens the name field: never a class itself, so no typed name can collide. */
const NEW_KIND = "\u0000new";

/**
 * «Agregar obligación»: what no accounting system exports — SRI, IESS, the rent, the payroll, a
 * loan instalment — typed by hand into the SAME list as the imported documents, so the flow, the
 * Excel and the report paint one cartera. Born unmarked, like a document a cut just brought.
 *
 * «Clase» offers the built-ins, then the classes this empresa already typed (`customKinds`, read off
 * its payables so nothing has to be stored), then «Nueva clase…», which opens a name field. The
 * name goes through `normalizeKind`, so typing «Arriendo» lands on the built-in and not beside it.
 */
export function ManualPayablePanel({ onClose }: { onClose: () => void }) {
  const { activeClientId, centers, payables } = useCashFlowData();
  const [supplier, setSupplier] = useState("");
  const [kind, setKind] = useState<PayableKind>("otros");
  const [newKind, setNewKind] = useState("");
  const used = useMemo(() => customKinds(payables), [payables]);
  const [amount, setAmount] = useState<number | null>(null);
  const [dueOn, setDueOn] = useState<string | null>(null);
  const [centerId, setCenterId] = useState(NO_CENTER);
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [kindError, setKindError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  const save = useCallback(async () => {
    if (!activeClientId) {
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
      await cashDb.addManualPayable(activeClientId, {
        supplier,
        kind: resolvedKind,
        amount,
        dueOn,
        centerName: center?.name ?? null,
        description,
      });
      onClose();
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
    onClose,
  ]);

  return (
    <SidePanel eyebrow="Cuentas por pagar" title="Agregar obligación" width={440} onClose={onClose}>
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
          <FormField label="Vencimiento" hint="Opcional; sin fecha cuenta como por vencer.">
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
            Agregar
          </Button>
        </div>
      </div>
    </SidePanel>
  );
}
