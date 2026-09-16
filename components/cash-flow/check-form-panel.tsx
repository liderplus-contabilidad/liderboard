"use client";

import { Ban, Trash2 } from "lucide-react";
import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import { FormField, TextField } from "@/components/ui/form-field";
import { NumericInput } from "@/components/ui/numeric-input";
import { SidePanel } from "@/components/ui/side-panel";
import { CHECK_STEP_LABELS, CHECK_STEPS, nextVoucher, stepIndex } from "@/lib/cash-flow/checks";
import * as cashDb from "@/lib/cash-flow/db";
import { money } from "@/lib/cash-flow/derive";
import { isISODate } from "@/lib/cash-flow/dates";
import type { Check, CheckStep } from "@/lib/cash-flow/types";
import { cn } from "@/lib/cn";

import { AccountPicker } from "./account-picker";
import { useCashFlowData } from "./cash-flow-data-provider";

/**
 * One check, new or existing, in a drawer: its data and its TIMELINE — realizado → firmado →
 * entregado → cobrado, the four X of the book as an order one clicks along. Reaching «Cobrado»
 * asks the cashed date (the cut date by default) because the flow needs a day; «Anular» is the
 * step's orthogonal flag, so an annulled check keeps how far it went.
 *
 * On an existing check every field saves on commit. A new one is written on «Registrar»: its N°
 * EGRESO is proposed as the next in the sequence (`nextVoucher`) and stays editable — it is the
 * check's identity, so a number already taken is refused naming whose it is; its account is chosen
 * here, and its bank label follows from it.
 */
export function CheckFormPanel({ check, onClose }: { check: Check | null; onClose: () => void }) {
  const { activeClientId, accounts, checks, asOf } = useCashFlowData();
  const [draft, setDraft] = useState<cashDb.CheckInput>(() =>
    check
      ? { ...check }
      : {
          // Proposed as the next in the sequence, and editable: the numbering is the accountant's.
          voucher: nextVoucher(checks),
          bank: accounts[0]?.bank ?? "",
          accountId: accounts[0]?.id ?? null,
          payee: "",
          number: "",
          amount: 0,
          issuedOn: asOf,
          step: "made",
          voided: false,
          cashedOn: null,
          place: "",
          note: "",
        },
  );
  const [error, setError] = useState<string | undefined>();

  const commit = useCallback(
    (patch: Partial<cashDb.CheckInput>) => {
      setDraft((current) => ({ ...current, ...patch }));
      if (check) {
        void cashDb.updateCheck(check.id, patch);
      }
    },
    [check],
  );

  const setAccount = useCallback(
    (accountId: string | null) => {
      const account = accounts.find((candidate) => candidate.id === accountId);
      commit({ accountId: account?.id ?? null, ...(account ? { bank: account.bank } : {}) });
    },
    [accounts, commit],
  );

  const reach = useCallback(
    (step: CheckStep) => {
      if (step === "cashed") {
        commit({ step, cashedOn: draft.cashedOn ?? asOf });
      } else {
        commit({ step, cashedOn: null });
      }
    },
    [commit, draft.cashedOn, asOf],
  );

  const register = useCallback(async () => {
    if (!activeClientId) {
      return;
    }
    const voucher = draft.voucher.trim();
    if (!voucher) {
      setError("Escribe el número de egreso: es la identidad del cheque.");
      return;
    }
    const taken = checks.find((candidate) => candidate.voucher === voucher);
    if (taken) {
      setError(`El egreso ${voucher} ya existe (${taken.payee || "sin beneficiario"}).`);
      return;
    }
    await cashDb.addCheck(activeClientId, { ...draft, voucher });
    onClose();
  }, [activeClientId, checks, draft, onClose]);

  const reached = stepIndex(draft.step);

  return (
    <SidePanel
      eyebrow={check ? `Egreso ${check.voucher}` : "Control de cheques"}
      title={check ? `${check.payee || "Cheque"} · ${money(check.amount)}` : "Nuevo cheque"}
      width={460}
      onClose={onClose}
    >
      <div className="flex flex-col gap-5 px-5 pb-6">
        <section>
          <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.5px] text-faint">
            Línea de tiempo
          </h3>
          <ol className="grid grid-cols-4 gap-1.5">
            {CHECK_STEPS.map((step, index) => {
              const on = !draft.voided && index <= reached;
              return (
                <li key={step}>
                  <button
                    type="button"
                    disabled={draft.voided}
                    aria-pressed={index === reached}
                    onClick={() => reach(step)}
                    className={cn(
                      "flex w-full flex-col items-center gap-1 rounded-[9px] border px-2 py-2 text-[11.5px] font-semibold transition-colors disabled:cursor-not-allowed",
                      on
                        ? "border-brand bg-brand-soft text-brand"
                        : "border-border text-faint hover:bg-canvas",
                    )}
                  >
                    <span
                      className={cn(
                        "flex size-5 items-center justify-center rounded-full text-[10.5px]",
                        on ? "bg-brand text-white" : "bg-border-faint text-faint",
                      )}
                    >
                      {index + 1}
                    </span>
                    {CHECK_STEP_LABELS[step]}
                  </button>
                </li>
              );
            })}
          </ol>
          {draft.step === "cashed" && !draft.voided && (
            <FormField label="Fecha de cobro" className="mt-3">
              <input
                type="date"
                value={draft.cashedOn ?? ""}
                aria-label="Fecha de cobro"
                onChange={(event) =>
                  isISODate(event.target.value) && commit({ cashedOn: event.target.value })
                }
                className="w-full rounded-lg border border-border bg-surface px-[9px] py-2 font-sans text-[13px] tabular-nums text-ink outline-none focus:border-brand"
              />
            </FormField>
          )}
          <p className="mt-3 rounded-[9px] bg-surface-muted px-3 py-2 text-[11.5px] leading-relaxed text-ink-soft">
            Mientras el cheque no esté cobrado ni anulado, su valor resta del disponible de su
            cuenta en Flujo a la fecha de corte.
          </p>
        </section>

        <section className="grid grid-cols-2 gap-3">
          <TextField
            label="N° egreso"
            value={draft.voucher}
            variant="mono"
            error={error}
            hint={check ? undefined : "Propuesto como el siguiente; puedes corregirlo."}
            disabled={check !== null}
            onChange={(event) => {
              setDraft((current) => ({ ...current, voucher: event.target.value }));
              setError(undefined);
            }}
          />
          <AccountPicker
            value={draft.accountId}
            emptyLabel={draft.bank ? `${draft.bank} · sin cuenta` : "Sin cuenta"}
            onChange={setAccount}
            creationClassName="col-span-2"
          />
          <TextField
            label="Beneficiario"
            value={draft.payee}
            fieldClassName="col-span-2"
            onChange={(event) => setDraft((current) => ({ ...current, payee: event.target.value }))}
            onBlur={() => check && commit({ payee: draft.payee })}
          />
          <TextField
            label="N° cheque"
            value={draft.number}
            variant="mono"
            onChange={(event) =>
              setDraft((current) => ({ ...current, number: event.target.value }))
            }
            onBlur={() => check && commit({ number: draft.number })}
          />
          <FormField label="Valor">
            <NumericInput
              value={draft.amount}
              format="currency"
              ariaLabel="Valor del cheque"
              onCommit={(value) => commit({ amount: value ?? 0 })}
            />
          </FormField>
          <FormField label="Fecha de emisión">
            <input
              type="date"
              value={draft.issuedOn ?? ""}
              aria-label="Fecha de emisión"
              onChange={(event) =>
                commit({ issuedOn: isISODate(event.target.value) ? event.target.value : null })
              }
              className="w-full rounded-lg border border-border bg-surface px-[9px] py-2 font-sans text-[13px] tabular-nums text-ink outline-none focus:border-brand"
            />
          </FormField>
          <TextField
            label="Lugar"
            value={draft.place}
            placeholder="ARCHIVO"
            onChange={(event) => setDraft((current) => ({ ...current, place: event.target.value }))}
            onBlur={() => check && commit({ place: draft.place })}
          />
          <TextField
            label="Notas"
            value={draft.note}
            placeholder="Observación interna"
            fieldClassName="col-span-2"
            onChange={(event) => setDraft((current) => ({ ...current, note: event.target.value }))}
            onBlur={() => check && commit({ note: draft.note })}
          />
        </section>

        <div className="flex items-center gap-2 border-t border-border-soft pt-4">
          {check ? (
            <>
              <Button
                variant={draft.voided ? "secondary" : "danger"}
                size="sm"
                icon={<Ban size={13} />}
                onClick={() => commit({ voided: !draft.voided })}
              >
                {draft.voided ? "Quitar anulación" : "Anular"}
              </Button>
              <Button
                variant="danger"
                size="sm"
                icon={<Trash2 size={13} />}
                className="ml-auto"
                onClick={() => void cashDb.deleteCheck(check.id).then(onClose)}
              >
                Eliminar
              </Button>
            </>
          ) : (
            <>
              <Button variant="secondary" size="sm" onClick={onClose}>
                Cancelar
              </Button>
              <Button size="sm" className="ml-auto" onClick={() => void register()}>
                Registrar cheque
              </Button>
            </>
          )}
        </div>
      </div>
    </SidePanel>
  );
}
