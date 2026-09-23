"use client";

import { Printer, RotateCcw } from "lucide-react";
import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import { FieldBox, FormField, TextField } from "@/components/ui/form-field";
import { Modal } from "@/components/ui/modal";
import { NumericInput } from "@/components/ui/numeric-input";
import * as cashDb from "@/lib/cash-flow/db";
import { downloadCheckTest } from "@/lib/cash-flow/check-print/download";
import {
  CHECK_FIELD_LABELS,
  CHECK_FIELDS,
  resolveCheckLayout,
  type CheckField,
  type CheckFieldPosition,
  type CheckLayout,
} from "@/lib/cash-flow/check-print/layout";
import type { BankAccount } from "@/lib/cash-flow/types";

const POSITION_PARTS: readonly { key: keyof CheckFieldPosition; label: string }[] = [
  { key: "x", label: "Izq." },
  { key: "y", label: "Arriba" },
  { key: "width", label: "Ancho" },
];

/**
 * «Formato de cheque» of ONE account: where each datum falls on its chequebook's form, in the
 * millimetres a ruler reads, plus the printer's calibration. Every change is saved at once (the
 * layout is the account's), and «Imprimir prueba» prints the same page with guides, to lay over a
 * real check before spending one.
 */
export function CheckLayoutModal({
  account,
  date,
  onClose,
}: {
  account: BankAccount;
  /** The date the test prints — the cut date. */
  date: string;
  onClose: () => void;
}) {
  const [layout, setLayout] = useState<CheckLayout>(() => resolveCheckLayout(account.checkLayout));
  const [busy, setBusy] = useState(false);

  const save = useCallback(
    (next: CheckLayout | undefined) => {
      setLayout(next ?? resolveCheckLayout(undefined));
      void cashDb.updateAccount(account.id, { checkLayout: next });
    },
    [account.id],
  );

  const setNumber = (key: "width" | "height" | "fontSize" | "offsetX" | "offsetY", value: number) =>
    save({ ...layout, [key]: value });

  const setPosition = (field: CheckField, key: keyof CheckFieldPosition, value: number) =>
    save({ ...layout, [field]: { ...layout[field], [key]: value } });

  const test = useCallback(async () => {
    setBusy(true);
    try {
      await downloadCheckTest({ ...account, checkLayout: layout }, date);
    } finally {
      setBusy(false);
    }
  }, [account, layout, date]);

  const mm = (value: number, onCommit: (value: number) => void, label: string) => (
    <FieldBox>
      <NumericInput
        value={value}
        format="plain"
        align="left"
        ariaLabel={label}
        onCommit={(next) => next !== null && onCommit(next)}
      />
    </FieldBox>
  );

  return (
    <Modal
      open
      eyebrow={[account.bank, account.number].filter(Boolean).join(" · ")}
      title="Formato de cheque"
      width={560}
      onClose={onClose}
    >
      <div className="flex flex-col gap-5">
        <p className="text-[12.5px] leading-relaxed text-muted">
          Medidas en milímetros desde la esquina superior izquierda del cheque; la altura es la de
          la línea donde se apoya el texto. Imprime a «Tamaño real» (100 %) y ajusta con una prueba
          sobre un cheque real.
        </p>

        <section className="grid grid-cols-4 gap-3">
          <FormField label="Ancho (mm)">
            {mm(layout.width, (value) => setNumber("width", value), "Ancho del cheque")}
          </FormField>
          <FormField label="Alto (mm)">
            {mm(layout.height, (value) => setNumber("height", value), "Alto del cheque")}
          </FormField>
          <FormField label="Letra (pt)">
            {mm(layout.fontSize, (value) => setNumber("fontSize", value), "Tamaño de letra")}
          </FormField>
          <TextField
            // Re-mounted on «Restablecer», which is the one change that comes from outside.
            key={layout.city}
            label="Ciudad"
            defaultValue={layout.city}
            onBlur={(event) =>
              event.target.value !== layout.city && save({ ...layout, city: event.target.value })
            }
          />
        </section>

        <section>
          <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.5px] text-faint">
            Posición de cada dato (mm)
          </h3>
          <div className="grid grid-cols-[1fr_repeat(3,84px)] items-center gap-x-2 gap-y-1.5">
            <span />
            {POSITION_PARTS.map((part) => (
              <span key={part.key} className="text-[11px] font-semibold text-faint">
                {part.label}
              </span>
            ))}
            {CHECK_FIELDS.map((field) => (
              <div key={field} className="contents">
                <span className="text-[12.5px] text-ink">{CHECK_FIELD_LABELS[field]}</span>
                {POSITION_PARTS.map((part) => (
                  <div key={part.key}>
                    {mm(
                      layout[field][part.key],
                      (value) => setPosition(field, part.key, value),
                      `${CHECK_FIELD_LABELS[field]}: ${part.label}`,
                    )}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </section>

        <section>
          <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.5px] text-faint">
            Calibración de la impresora (mm)
          </h3>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Horizontal" hint="+ corre a la derecha">
              {mm(layout.offsetX, (value) => setNumber("offsetX", value), "Calibración horizontal")}
            </FormField>
            <FormField label="Vertical" hint="+ corre hacia abajo">
              {mm(layout.offsetY, (value) => setNumber("offsetY", value), "Calibración vertical")}
            </FormField>
          </div>
        </section>

        <div className="flex items-center gap-2 border-t border-border-soft pt-4">
          <Button
            variant="ghost"
            size="sm"
            icon={<RotateCcw size={13} />}
            onClick={() => save(undefined)}
          >
            Restablecer
          </Button>
          <Button
            size="sm"
            className="ml-auto"
            icon={<Printer size={13} />}
            disabled={busy}
            onClick={() => void test()}
          >
            {busy ? "Generando…" : "Imprimir prueba"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
