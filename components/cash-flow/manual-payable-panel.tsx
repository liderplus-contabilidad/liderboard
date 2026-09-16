"use client";

import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import { FormField, TextField } from "@/components/ui/form-field";
import { NumericInput } from "@/components/ui/numeric-input";
import { Select } from "@/components/ui/select";
import { SidePanel } from "@/components/ui/side-panel";
import * as cashDb from "@/lib/cash-flow/db";
import { isISODate } from "@/lib/cash-flow/dates";
import { KIND_LABELS, PAYABLE_KINDS } from "@/lib/cash-flow/derive";
import type { PayableKind } from "@/lib/cash-flow/types";
import { useCashFlowData } from "./cash-flow-data-provider";

const NO_CENTER = "";

/**
 * «Agregar obligación»: what no accounting system exports — SRI, IESS, the rent, the payroll, a
 * loan instalment — typed by hand into the SAME list as the imported documents, so the flow, the
 * Excel and the report paint one cartera. Born unmarked, like a document a cut just brought.
 */
export function ManualPayablePanel({ onClose }: { onClose: () => void }) {
  const { activeClientId, centers } = useCashFlowData();
  const [supplier, setSupplier] = useState("");
  const [kind, setKind] = useState<PayableKind>("otros");
  const [amount, setAmount] = useState<number | null>(null);
  const [dueOn, setDueOn] = useState("");
  const [centerId, setCenterId] = useState(NO_CENTER);
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  const save = useCallback(async () => {
    if (!activeClientId) {
      return;
    }
    if (!supplier.trim()) {
      setError("Escribe el concepto o el beneficiario.");
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
        kind,
        amount,
        dueOn: isISODate(dueOn) ? dueOn : null,
        centerName: center?.name ?? null,
        description,
      });
      onClose();
    } finally {
      setBusy(false);
    }
  }, [activeClientId, supplier, amount, kind, dueOn, centerId, centers, description, onClose]);

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
            options={PAYABLE_KINDS.map((value) => ({ value, label: KIND_LABELS[value] }))}
            onChange={(event) => setKind(event.target.value as PayableKind)}
          />
          <FormField label="Monto">
            <NumericInput
              value={amount}
              nullable
              format="currency"
              ariaLabel="Monto"
              onCommit={setAmount}
            />
          </FormField>
          <FormField label="Vencimiento" hint="Opcional; sin fecha cuenta como por vencer.">
            <input
              type="date"
              value={dueOn}
              aria-label="Vencimiento"
              onChange={(event) => setDueOn(event.target.value)}
              className="w-full rounded-lg border border-border bg-surface px-[9px] py-2 font-sans text-[13px] tabular-nums text-ink outline-none focus:border-brand"
            />
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
