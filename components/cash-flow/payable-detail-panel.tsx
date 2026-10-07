"use client";

import { Check, CheckCheck, ChevronDown, LoaderCircle, RotateCcw } from "lucide-react";
import { useCallback, useId, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { DateField } from "@/components/ui/date-field";
import { Checkbox } from "@/components/ui/checkbox";
import { FieldBox, FormField } from "@/components/ui/form-field";
import { NumericInput } from "@/components/ui/numeric-input";
import { Select } from "@/components/ui/select";
import { agingOf } from "@/lib/cash-flow/aging";
import * as cashDb from "@/lib/cash-flow/db";
import { documentLabel, kindLabel, money } from "@/lib/cash-flow/derive";
import type { Payable, PayPriority } from "@/lib/cash-flow/types";
import { formatDayMonthYear } from "@/lib/date";

import { AccountPicker } from "./account-picker";
import { useCashFlowData } from "./cash-flow-data-provider";
import { CashFlowSidePanel } from "./cash-flow-side-panel";
import { AgingBadge } from "./payable-badges";

const NONE = "";

/** Independent fields, saved on commit. Grouping helps scanning without imposing an approval
 * sequence; settling and reopening still use the same document actions and the selected cut. */
export function PayableDetailPanel({
  payable,
  onClose,
}: {
  payable: Payable;
  onClose: () => void;
}) {
  const { asOf } = useCashFlowData();
  const [observation, setObservation] = useState(payable.observation);
  const [saveState, setSaveState] = useState({
    pending: 0,
    saved: false,
    errors: {} as Record<string, string>,
  });
  const [acting, setActing] = useState(false);
  const finalReviewId = useId();
  const notifiedId = useId();
  const cashId = useId();
  const settled = payable.status === "settled";
  const aging = agingOf(payable.dueOn, asOf);

  // Keep failures until the same control saves successfully: changing another field cannot hide
  // a failed write. This is feedback only; each operation still writes its original patch.
  const save = useCallback(async (key: string, message: string, operation: () => Promise<void>) => {
    setSaveState((current) => ({ ...current, pending: current.pending + 1 }));
    try {
      await operation();
      setSaveState((current) => {
        const errors = { ...current.errors };
        delete errors[key];
        return { pending: current.pending - 1, saved: true, errors };
      });
    } catch {
      setSaveState((current) => ({
        ...current,
        pending: current.pending - 1,
        errors: { ...current.errors, [key]: message },
      }));
    }
  }, []);

  const patch = useCallback(
    (fields: cashDb.PayablePatch, label: string) =>
      void save(
        Object.keys(fields).join(","),
        `No se pudo guardar ${label}. Vuelve a editar ese campo para intentarlo de nuevo.`,
        () => cashDb.updatePayable(payable.id, fields),
      ),
    [payable.id, save],
  );

  const changePaymentStatus = async () => {
    setActing(true);
    await save(
      "payment",
      `No se pudo ${settled ? "reabrir el documento" : "marcar el documento como pagado"}. Intenta de nuevo.`,
      () =>
        settled
          ? cashDb.reopenPayable(payable.id)
          : cashDb.settlePayables([payable.id], asOf).then(onClose),
    );
    setActing(false);
  };
  const errors = Object.values(saveState.errors);

  return (
    <CashFlowSidePanel
      eyebrow={documentLabel(payable) || kindLabel(payable.kind ?? "otros")}
      title={payable.supplier}
      onClose={onClose}
      footer={
        <div className="flex flex-col gap-3">
          {errors.length > 0 && (
            <div role="alert" className="text-[12px] text-negative">
              {errors.map((error) => (
                <p key={error}>{error}</p>
              ))}
            </div>
          )}
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[11px] text-muted">
                {settled ? "Documento liquidado" : "Saldo del documento"}
              </p>
              <p className="font-mono text-[16px] font-semibold tabular-nums text-ink">
                {settled && payable.settledOn
                  ? formatDayMonthYear(payable.settledOn)
                  : money(payable.balance)}
              </p>
            </div>
            <Button
              variant={settled ? "secondary" : "primary"}
              size="md"
              disabled={acting}
              icon={
                acting ? (
                  <LoaderCircle size={15} className="animate-spin" />
                ) : settled ? (
                  <RotateCcw size={15} />
                ) : (
                  <CheckCheck size={15} />
                )
              }
              onClick={() => void changePaymentStatus()}
            >
              {acting
                ? settled
                  ? "Reabriendo…"
                  : "Marcando…"
                : settled
                  ? "Reabrir documento"
                  : "Marcar como pagado"}
            </Button>
          </div>
          <output className="flex min-h-4 items-center gap-1.5 text-[11px] text-muted">
            {saveState.pending > 0 ? (
              <>
                <LoaderCircle size={12} className="animate-spin" />
                Guardando…
              </>
            ) : errors.length > 0 ? (
              "Hay cambios sin guardar"
            ) : saveState.saved ? (
              <>
                <Check size={12} />
                Cambios guardados
              </>
            ) : (
              "Los cambios se guardan al salir de cada campo"
            )}
          </output>
        </div>
      }
    >
      <div className="flex flex-col gap-5">
        <div className="rounded-[13px] border border-border bg-surface-muted px-4 py-3">
          <dl className="grid grid-cols-2 gap-4">
            <Fact label="Saldo">
              <span className="font-mono text-[22px] font-semibold tabular-nums text-ink">
                {money(payable.balance)}
              </span>
            </Fact>
            <Fact label="Vencimiento">
              <div className="flex flex-col items-start gap-1.5">
                <span>{formatDayMonthYear(payable.dueOn) ?? "—"}</span>
                <AgingBadge aging={aging} settled={settled} />
              </div>
            </Fact>
          </dl>
          <details className="group mt-3 border-t border-border pt-3">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-2 rounded text-[12px] font-medium text-brand outline-none hover:underline focus-visible:outline-2 focus-visible:outline-brand [&::-webkit-details-marker]:hidden">
              Ver detalle del documento
              <ChevronDown
                size={14}
                className="shrink-0 transition-transform group-open:rotate-180"
              />
            </summary>
            <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3">
              <Fact label="Emisión">{formatDayMonthYear(payable.issuedOn) ?? "—"}</Fact>
              <Fact label="Centro">{payable.centerName ?? "—"}</Fact>
              <Fact label="Valor documento">{money(payable.amount)}</Fact>
              <Fact label="Retenciones · pagos">
                {money(payable.withholdings)} · {money(payable.payments)}
              </Fact>
              {payable.description && (
                <Fact label="Descripción" wide>
                  {payable.description}
                </Fact>
              )}
            </dl>
          </details>
        </div>

        <section className="flex flex-col gap-3">
          <h3 className="text-[13px] font-semibold text-ink">Preparar pago</h3>
          <div className="grid grid-cols-2 gap-3">
            <Select
              label="Prioridad"
              value={payable.priority ?? NONE}
              disabled={settled}
              options={[
                { value: NONE, label: "Sin marcar" },
                { value: "urgent", label: "Urgente" },
                { value: "pending", label: "Pendiente" },
              ]}
              onChange={(event) =>
                patch(
                  { priority: (event.target.value || null) as PayPriority | null },
                  "la prioridad",
                )
              }
            />
            <FormField label="Fecha programada">
              <DateField
                value={payable.payOn}
                nullable
                disabled={settled}
                ariaLabel="Fecha programada"
                onChange={(payOn) => patch({ payOn }, "la fecha programada")}
              />
            </FormField>
            <div className="col-span-2">
              <AccountPicker
                label="Pagar desde"
                value={payable.payFromAccountId}
                disabled={settled}
                onChange={(accountId) =>
                  patch({ payFromAccountId: accountId }, "la cuenta de pago")
                }
                creationClassName="col-span-2"
              />
            </div>
          </div>
          <CheckField
            id={cashId}
            label="Incluir en Cargas cash"
            checked={payable.cash}
            onChange={
              settled ? undefined : (checked) => patch({ cash: checked }, "la etiqueta Cash")
            }
          />
        </section>

        <section className="flex flex-col gap-3 border-t border-border-soft pt-4">
          <h3 className="text-[13px] font-semibold text-ink">Aprobación</h3>
          <FormField
            label="Monto aprobado · primera revisión"
            hint={
              <span className="text-muted">
                Déjalo vacío para considerar el saldo completo:{" "}
                <span className="font-mono tabular-nums">{money(payable.balance)}</span>.
              </span>
            }
          >
            <FieldBox>
              <NumericInput
                value={payable.approved}
                nullable
                disabled={settled}
                format="currency"
                align="left"
                placeholder="Sin monto registrado"
                ariaLabel="Monto aprobado en primera revisión"
                className="placeholder:text-muted"
                onCommit={(value) => patch({ approved: value }, "el monto aprobado")}
              />
            </FieldBox>
          </FormField>
          <div className="divide-y divide-border-soft">
            <CheckField
              id={finalReviewId}
              label="Revisión final aprobada"
              checked={payable.finalReview}
              onChange={(checked) => patch({ finalReview: checked }, "la revisión final")}
            />
            <CheckField
              id={notifiedId}
              label="Notificación de pago registrada"
              hint="Marca esta casilla si la notificación ya se realizó."
              checked={payable.notified}
              onChange={(checked) => patch({ notified: checked }, "la notificación de pago")}
            />
          </div>
        </section>

        <section className="border-t border-border-soft pt-4">
          <FormField
            label={
              <span className="text-[13px] font-semibold text-ink">
                Observación de contabilidad{" "}
                <span className="font-normal text-muted">· opcional</span>
              </span>
            }
          >
            <textarea
              value={observation}
              rows={2}
              placeholder="Escribe una nota interna sobre este documento"
              onChange={(event) => setObservation(event.target.value)}
              onBlur={() => {
                if (observation !== payable.observation)
                  patch({ observation }, "la observación de contabilidad");
              }}
              className="w-full resize-y rounded-[9px] border border-border bg-surface px-[9px] py-2 font-sans text-[13px] text-ink outline-none placeholder:text-muted focus:border-brand"
            />
          </FormField>
        </section>
      </div>
    </CashFlowSidePanel>
  );
}

/** The label is the whole hit area, including its explanation; no tiny checkbox targets. */
function CheckField({
  id,
  label,
  hint,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  hint?: string;
  checked: boolean;
  onChange?: (checked: boolean) => void;
}) {
  return (
    <label
      htmlFor={onChange ? id : undefined}
      className={`flex items-start gap-3 rounded-[9px] px-2 py-2.5 text-[13px] text-ink ${onChange ? "cursor-pointer hover:bg-canvas focus-within:bg-canvas" : "cursor-default text-muted"}`}
    >
      <Checkbox id={id} checked={checked} onChange={onChange} className="mt-0.5" />
      <span className="min-w-0">
        <span className="block font-medium">{label}</span>
        {hint && <span className="mt-0.5 block text-[11.5px] font-normal text-muted">{hint}</span>}
      </span>
    </label>
  );
}

function Fact({ label, wide, children }: { label: string; wide?: boolean; children: ReactNode }) {
  return (
    <div className={wide ? "col-span-2" : undefined}>
      <dt className="text-[11px] font-medium text-muted">{label}</dt>
      <dd className="mt-1 text-[12.5px] tabular-nums text-ink">{children}</dd>
    </div>
  );
}
