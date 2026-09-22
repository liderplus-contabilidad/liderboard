"use client";

import { RotateCcw, Trash2 } from "lucide-react";
import { useCallback, useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { DateField } from "@/components/ui/date-field";
import { Checkbox } from "@/components/ui/checkbox";
import { FieldBox, FormField } from "@/components/ui/form-field";
import { NumericInput } from "@/components/ui/numeric-input";
import { Select } from "@/components/ui/select";
import { SidePanel } from "@/components/ui/side-panel";
import { agingOf } from "@/lib/cash-flow/aging";
import * as cashDb from "@/lib/cash-flow/db";
import { documentLabel, kindLabel, money } from "@/lib/cash-flow/derive";
import type { Payable, PayPriority } from "@/lib/cash-flow/types";
import { formatDayMonthYear } from "@/lib/date";

import { AccountPicker } from "./account-picker";
import { useCashFlowData } from "./cash-flow-data-provider";
import { AgingBadge, CashBadge, PriorityBadge } from "./payable-badges";

const NONE = "";

/**
 * One document, read ALONGSIDE the grid that opened it (a drawer, not a modal): its figures, its
 * mark of payment, and the four working columns of the `REPORTE CXP` — observación · aprobado (a
 * MONTO: what the first review approved paying, which is also what the flow counts) · revisión
 * final · notificación. Each field saves on commit; the grid's dots follow.
 */
export function PayableDetailPanel({
  payable,
  onClose,
}: {
  payable: Payable;
  onClose: () => void;
}) {
  const { asOf } = useCashFlowData();
  const [observation, setObservation] = useState(payable.observation);
  const finalReviewId = useId();
  const notifiedId = useId();
  const cashId = useId();
  const settled = payable.status === "settled";
  const aging = agingOf(payable.dueOn, asOf);

  const patch = useCallback(
    (fields: cashDb.PayablePatch) => void cashDb.updatePayable(payable.id, fields),
    [payable.id],
  );

  return (
    <SidePanel
      eyebrow={documentLabel(payable) || kindLabel(payable.kind ?? "otros")}
      title={payable.supplier}
      width={460}
      onClose={onClose}
    >
      <div className="flex flex-col gap-5 px-5 pb-6">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-[9px] border border-border bg-surface-muted px-4 py-3 text-[12.5px]">
          <Fact label="Estado">
            <AgingBadge aging={aging} settled={settled} />
          </Fact>
          <Fact label="Prioridad">
            <span className="inline-flex items-center gap-1.5">
              <PriorityBadge priority={payable.priority} />
              {payable.cash && <CashBadge />}
            </span>
          </Fact>
          <Fact label="Emisión">{formatDayMonthYear(payable.issuedOn) ?? "—"}</Fact>
          <Fact label="Vencimiento">{formatDayMonthYear(payable.dueOn) ?? "—"}</Fact>
          <Fact label="Valor documento">{money(payable.amount)}</Fact>
          <Fact label="Retenciones · pagos">
            {money(payable.withholdings)} · {money(payable.payments)}
          </Fact>
          <Fact label="Saldo">
            <span className="font-semibold text-brand">{money(payable.balance)}</span>
          </Fact>
          <Fact label="Centro">{payable.centerName ?? "—"}</Fact>
          {payable.description && (
            <Fact label="Descripción" wide>
              {payable.description}
            </Fact>
          )}
        </dl>

        <section className="flex flex-col gap-3">
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.5px] text-faint">
            Marca de pago
          </h3>
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
                patch({ priority: (event.target.value || null) as PayPriority | null })
              }
            />
            <FormField label="Fecha programada">
              <DateField
                value={payable.payOn}
                nullable
                disabled={settled}
                ariaLabel="Fecha programada"
                onChange={(payOn) => patch({ payOn })}
              />
            </FormField>
            <AccountPicker
              label="Pagar desde"
              value={payable.payFromAccountId}
              disabled={settled}
              onChange={(accountId) => patch({ payFromAccountId: accountId })}
              creationClassName="col-span-2"
            />
          </div>
          <div className="flex items-center gap-2.5 text-[13px] text-ink">
            <Checkbox
              id={cashId}
              checked={payable.cash}
              {...(settled ? {} : { onChange: (checked: boolean) => patch({ cash: checked }) })}
            />
            <label htmlFor={cashId}>Cash</label>
          </div>
        </section>

        <section className="flex flex-col gap-3">
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.5px] text-faint">
            Flujo de aprobación
          </h3>
          <FormField label="Observación de contabilidad">
            <textarea
              value={observation}
              rows={3}
              placeholder="Nota interna sobre este documento"
              onChange={(event) => setObservation(event.target.value)}
              onBlur={() => {
                if (observation !== payable.observation) {
                  patch({ observation });
                }
              }}
              className="w-full resize-y rounded-lg border border-border bg-surface px-[9px] py-2 font-sans text-[13px] text-ink outline-none placeholder:text-faint focus:border-brand"
            />
          </FormField>
          <FormField label="Aprobación primera revisión (monto)">
            <FieldBox>
              <NumericInput
                value={payable.approved}
                nullable
                disabled={settled}
                format="currency"
                align="left"
                placeholder="$0.00"
                ariaLabel="Monto aprobado en primera revisión"
                onCommit={(value) => patch({ approved: value })}
              />
            </FieldBox>
          </FormField>
          <div className="flex items-center gap-2.5 text-[13px] text-ink">
            <Checkbox
              id={finalReviewId}
              checked={payable.finalReview}
              onChange={(checked) => patch({ finalReview: checked })}
            />
            <label htmlFor={finalReviewId}>Aprobación revisión final</label>
          </div>
          <div className="flex items-center gap-2.5 text-[13px] text-ink">
            <Checkbox
              id={notifiedId}
              checked={payable.notified}
              onChange={(checked) => patch({ notified: checked })}
            />
            <label htmlFor={notifiedId}>Notificación de pago</label>
          </div>
        </section>

        <div className="flex items-center gap-2 border-t border-border-soft pt-4">
          {settled ? (
            <Button
              variant="secondary"
              size="sm"
              icon={<RotateCcw size={13} />}
              onClick={() => void cashDb.reopenPayable(payable.id)}
            >
              Reabrir
            </Button>
          ) : (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void cashDb.settlePayables([payable.id], asOf).then(onClose)}
            >
              Marcar pagado
            </Button>
          )}
          {payable.source === "manual" && (
            <Button
              variant="danger"
              size="sm"
              icon={<Trash2 size={13} />}
              onClick={() => void cashDb.deleteManualPayable(payable.id).then(onClose)}
            >
              Eliminar obligación
            </Button>
          )}
          {settled && payable.settledOn && (
            <span className="ml-auto text-[11.5px] text-faint">
              Liquidada el {formatDayMonthYear(payable.settledOn)}
            </span>
          )}
        </div>
      </div>
    </SidePanel>
  );
}

function Fact({
  label,
  wide,
  children,
}: {
  label: string;
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={wide ? "col-span-2" : undefined}>
      <dt className="text-[10.5px] font-semibold uppercase tracking-[0.5px] text-faint">{label}</dt>
      <dd className="mt-0.5 tabular-nums text-ink">{children}</dd>
    </div>
  );
}
