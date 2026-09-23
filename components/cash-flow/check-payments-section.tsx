"use client";

import { FilePlus2, X } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { NumericInput } from "@/components/ui/numeric-input";
import { proposePayment } from "@/lib/cash-flow/check-print/voucher";
import { money } from "@/lib/cash-flow/derive";
import type { CheckPayment, Payable } from "@/lib/cash-flow/types";
import { formatDayMonthYear } from "@/lib/date";

import { CarteraPicker } from "./flow-cartera-picker";

/**
 * «Documentos que paga»: the documents of the cartera a check settles — what the comprobante de
 * egreso lists. Linking one takes a SNAPSHOT (`proposePayment`) with the abono proposed as what is
 * left of the check, editable; the saldo actual is derived. «Agregar de la cartera» opens the SAME
 * picker Flujo does (`CarteraPicker`), with the open documents not yet linked and the beneficiary's
 * own group first, so the usual case is the top of the list.
 */
export function CheckPaymentsSection({
  payments,
  payables,
  payee,
  amount,
  onChange,
}: {
  payments: readonly CheckPayment[];
  payables: readonly Payable[];
  payee: string;
  amount: number;
  /** The new list, plus the documents just linked (so the caller can adopt their supplier). */
  onChange: (payments: CheckPayment[], linked?: Payable[]) => void;
}) {
  const [picking, setPicking] = useState(false);
  const candidates = useMemo(() => {
    const linked = new Set(payments.map((payment) => payment.payableId));
    return payables.filter((payable) => payable.status === "open" && !linked.has(payable.id));
  }, [payables, payments]);

  const covered = payments.reduce((total, payment) => total + payment.amount, 0);

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between">
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.5px] text-faint">
          Documentos que paga
        </h3>
        {payments.length > 0 && (
          <span className="text-[11.5px] tabular-nums text-muted">
            Abonos {money(covered)} de {money(amount)}
          </span>
        )}
      </div>
      {payments.length > 0 && (
        <ul className="divide-y divide-border-soft rounded-[9px] border border-border">
          {payments.map((payment, index) => (
            <PaymentRow
              key={payment.payableId}
              payment={payment}
              onAmount={(value) =>
                onChange(
                  payments.map((current, at) =>
                    at === index
                      ? { ...current, amount: Math.min(Math.max(value, 0), current.balance) }
                      : current,
                  ),
                )
              }
              onRemove={() => onChange(payments.filter((_, at) => at !== index))}
            />
          ))}
        </ul>
      )}
      <div>
        <Button
          variant="secondary"
          size="sm"
          icon={<FilePlus2 size={13} />}
          onClick={() => setPicking(true)}
        >
          Agregar de la cartera
        </Button>
      </div>
      <CarteraPicker
        open={picking}
        title="Documentos que paga el cheque"
        candidates={candidates}
        emptyText="No hay documentos abiertos en la cartera."
        restLabel="abiertos"
        confirmLabel={(count) => (count > 0 ? `Agregar ${count} al cheque` : "Agregar al cheque")}
        preferSupplier={payee}
        onConfirm={async (picked) => {
          // One after another, so each abono is what the previous ones left of the check.
          const next = picked.reduce<CheckPayment[]>(
            (list, payable) => [...list, proposePayment(payable, amount, list)],
            [...payments],
          );
          onChange(next, picked);
        }}
        onClose={() => setPicking(false)}
      />
    </section>
  );
}

function PaymentRow({
  payment,
  onAmount,
  onRemove,
}: {
  payment: CheckPayment;
  onAmount: (value: number) => void;
  onRemove: () => void;
}) {
  return (
    <li className="grid grid-cols-[1fr_auto_auto] items-center gap-2 px-3 py-1.5">
      <div className="min-w-0">
        <div className="truncate font-mono text-[12.5px] text-ink">{payment.docNumber}</div>
        <div className="text-[11px] tabular-nums text-faint">
          {formatDayMonthYear(payment.issuedOn) ?? "Sin fecha"} · saldo {money(payment.balance)} ·
          queda {money(payment.balance - payment.amount)}
        </div>
      </div>
      <NumericInput
        value={payment.amount}
        format="currency"
        ariaLabel={`Abono al documento ${payment.docNumber}`}
        className="w-[110px]"
        onCommit={(value) => onAmount(value ?? 0)}
      />
      <Button
        variant="ghost"
        size="sm"
        iconOnly
        icon={<X size={14} />}
        aria-label={`Quitar el documento ${payment.docNumber}`}
        onClick={onRemove}
      />
    </li>
  );
}
