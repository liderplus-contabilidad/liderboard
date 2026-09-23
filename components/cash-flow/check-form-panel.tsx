"use client";

import { Ban, FileText, Printer, Trash2 } from "lucide-react";
import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import { DateField } from "@/components/ui/date-field";
import { FieldBox, FormField, TextField } from "@/components/ui/form-field";
import { NumericInput } from "@/components/ui/numeric-input";
import { SidePanel } from "@/components/ui/side-panel";
import { CHECK_STEP_LABELS, CHECK_STEPS, nextVoucher, stepIndex } from "@/lib/cash-flow/checks";
import {
  createCheckPdf,
  downloadVoucher,
  type PdfPreview,
} from "@/lib/cash-flow/check-print/download";
import { knownPayeeDetails } from "@/lib/cash-flow/check-print/payee";
import { buildVoucherDocument, type VoucherDocument } from "@/lib/cash-flow/check-print/voucher";
import * as cashDb from "@/lib/cash-flow/db";
import { money } from "@/lib/cash-flow/derive";
import type { Check, CheckPayment, CheckStep, Payable } from "@/lib/cash-flow/types";
import { cn } from "@/lib/cn";

import { CheckPdfPreview } from "./check-pdf-preview";
import { AccountPicker } from "./account-picker";
import { useCashFlowData } from "./cash-flow-data-provider";
import { CheckPaymentsSection } from "./check-payments-section";
import { VoucherFormModal } from "./voucher-form-modal";

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
 *
 * An existing check that is not voided prints two PDFs (`lib/cash-flow/check-print/`): the CHECK
 * itself on its account's form — drawn only with an account and an amount — and the COMPROBANTE DE
 * EGRESO, which opens first in a window shaped like the paper (`VoucherFormModal`) where whatever is
 * missing is completed before the download.
 */
export function CheckFormPanel({ check, onClose }: { check: Check | null; onClose: () => void }) {
  const { activeClientId, activeClient, accounts, checks, payables, asOf } = useCashFlowData();
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
  const [pdf, setPdf] = useState<PdfPreview | null>(null);
  const [printing, setPrinting] = useState(false);
  const [voucherDraft, setVoucherDraft] = useState<VoucherDocument | null>(null);
  const [printError, setPrintError] = useState<string | null>(null);

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

  /**
   * What is already known of a beneficiary (`knownPayeeDetails`: their other checks, the cartera)
   * for the fields this check still has EMPTY — never over what was typed here.
   */
  const knownFor = useCallback(
    (payee: string, current: Pick<cashDb.CheckInput, "payeeTaxId" | "payeeAddress">) => {
      const known = knownPayeeDetails(payee, checks, payables, check?.id);
      const patch: Partial<cashDb.CheckInput> = {};
      if (!current.payeeTaxId?.trim() && known.taxId) {
        patch.payeeTaxId = known.taxId;
      }
      if (!current.payeeAddress?.trim() && known.address) {
        patch.payeeAddress = known.address;
      }
      return patch;
    },
    [checks, payables, check?.id],
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

  /**
   * Linking documents also fills what the check still lacks from them: the beneficiary (the first
   * document's supplier) with what is known of them, and — on a check with no amount yet — the
   * amount itself, the sum of their balances, each paid whole.
   */
  const setPayments = useCallback(
    (payments: CheckPayment[], linked?: Payable[]) => {
      const patch: Partial<cashDb.CheckInput> = { payments };
      const first = linked?.[0];
      if (linked && first) {
        if (!draft.payee.trim()) {
          patch.payee = first.supplier;
          Object.assign(patch, knownFor(first.supplier, draft));
        }
        if (!draft.payeeTaxId?.trim() && !patch.payeeTaxId && first.supplierTaxId) {
          patch.payeeTaxId = first.supplierTaxId;
        }
        if (draft.amount === 0) {
          const ids = new Set(linked.map((payable) => payable.id));
          patch.payments = payments.map((payment) =>
            ids.has(payment.payableId) ? { ...payment, amount: payment.balance } : payment,
          );
          patch.amount =
            Math.round(patch.payments.reduce((total, payment) => total + payment.amount, 0) * 100) /
            100;
        }
      }
      commit(patch);
    },
    [commit, knownFor, draft],
  );

  const account = accounts.find((candidate) => candidate.id === draft.accountId);
  // Without an emission date the check is printed at the cut date — the module's «today».
  const printDate = draft.issuedOn ?? asOf;

  const printCheck = useCallback(async () => {
    if (!account) {
      return;
    }
    setPrinting(true);
    setPrintError(null);
    try {
      setPdf(
        await createCheckPdf(
          { payee: draft.payee, amount: draft.amount, date: printDate, number: draft.number },
          account,
        ),
      );
    } catch (error) {
      setPrintError(
        error instanceof Error ? error.message : "No se pudo generar el PDF. Intenta de nuevo.",
      );
    } finally {
      setPrinting(false);
    }
  }, [account, draft.payee, draft.amount, draft.number, printDate]);

  const openVoucher = useCallback(() => {
    if (!check) {
      return;
    }
    setVoucherDraft(
      buildVoucherDocument({
        check: { ...check, ...draft, ...knownFor(draft.payee, draft) },
        client: activeClient ?? { name: "" },
        account,
        date: printDate,
        generatedAt: new Date(),
      }),
    );
  }, [check, draft, knownFor, activeClient, account, printDate]);

  /**
   * Downloads what the window shows and KEEPS what was completed there: the letterhead on the
   * empresa (every comprobante after this one is born with it) and the beneficiary's id and address
   * on the check (and through `knownPayeeDetails`, on every later check to them).
   */
  const downloadVoucherFrom = useCallback(
    async (voucher: VoucherDocument) => {
      await downloadVoucher(voucher, draft.voucher, draft.payee);
      if (activeClient) {
        const stored = activeClient.letterhead ?? { name: activeClient.name, lines: [] };
        const typed = { name: voucher.company, lines: [...voucher.companyLines] };
        if (typed.name !== stored.name || typed.lines.join("\n") !== stored.lines.join("\n")) {
          await cashDb.updateClientLetterhead(activeClient.id, typed);
        }
      }
      const [, taxId, address] = voucher.party;
      const patch: Partial<cashDb.CheckInput> = {};
      if (taxId && taxId.value.trim() !== (draft.payeeTaxId ?? "").trim()) {
        patch.payeeTaxId = taxId.value;
      }
      if (address && address.value.trim() !== (draft.payeeAddress ?? "").trim().toUpperCase()) {
        patch.payeeAddress = address.value;
      }
      if (Object.keys(patch).length > 0) {
        commit(patch);
      }
    },
    [commit, activeClient, draft.voucher, draft.payee, draft.payeeTaxId, draft.payeeAddress],
  );

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
              <DateField
                value={draft.cashedOn}
                ariaLabel="Fecha de cobro"
                onChange={(cashedOn) => cashedOn && commit({ cashedOn })}
              />
            </FormField>
          )}
        </section>

        <section className="grid grid-cols-2 gap-3">
          <TextField
            label="N° egreso"
            value={draft.voucher}
            variant="mono"
            error={error}
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
            onBlur={() => {
              // A beneficiary seen before brings their id and address to the fields still empty.
              const patch = { payee: draft.payee, ...knownFor(draft.payee, draft) };
              if (check) {
                commit(patch);
              } else {
                setDraft((current) => ({ ...current, ...patch }));
              }
            }}
          />
          <TextField
            label="Identificación"
            value={draft.payeeTaxId ?? ""}
            variant="mono"
            placeholder="RUC o cédula"
            onChange={(event) =>
              setDraft((current) => ({ ...current, payeeTaxId: event.target.value }))
            }
            onBlur={() => check && commit({ payeeTaxId: draft.payeeTaxId ?? "" })}
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
            <FieldBox>
              <NumericInput
                value={draft.amount}
                format="currency"
                align="left"
                placeholder="$0.00"
                ariaLabel="Valor del cheque"
                onCommit={(value) => commit({ amount: value ?? 0 })}
              />
            </FieldBox>
          </FormField>
          <FormField label="Fecha de emisión">
            <DateField
              value={draft.issuedOn}
              nullable
              ariaLabel="Fecha de emisión"
              onChange={(issuedOn) => commit({ issuedOn })}
            />
          </FormField>
          <FormField
            label="Fecha prevista de cobro"
            hint="Activa el aviso para preparar fondos en el banco"
          >
            <DateField
              value={draft.expectedCashOn ?? null}
              nullable
              ariaLabel="Fecha prevista de cobro"
              onChange={(expectedCashOn) => commit({ expectedCashOn })}
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
          <TextField
            label="Dirección del beneficiario"
            value={draft.payeeAddress ?? ""}
            placeholder="Para el comprobante de egreso"
            fieldClassName="col-span-2"
            onChange={(event) =>
              setDraft((current) => ({ ...current, payeeAddress: event.target.value }))
            }
            onBlur={() => check && commit({ payeeAddress: draft.payeeAddress ?? "" })}
          />
        </section>

        <CheckPaymentsSection
          payments={draft.payments ?? []}
          payables={payables}
          payee={draft.payee}
          amount={draft.amount}
          onChange={setPayments}
        />

        {check && !draft.voided && (
          <section className="flex flex-col gap-2 border-t border-border-soft pt-4">
            <div className="flex items-center gap-2">
              {account && draft.amount > 0 && (
                <Button
                  variant="secondary"
                  size="sm"
                  icon={<Printer size={13} />}
                  disabled={printing}
                  onClick={() => void printCheck()}
                >
                  {printing ? "Generando…" : "Ver PDF e imprimir"}
                </Button>
              )}
              <Button
                variant="secondary"
                size="sm"
                icon={<FileText size={13} />}
                onClick={openVoucher}
              >
                Comprobante de egreso
              </Button>
            </div>
            {printError ? (
              <p className="text-[11.5px] text-negative">{printError}</p>
            ) : (
              account &&
              draft.amount > 0 && (
                <p className="text-[11.5px] text-faint">
                  El cheque se imprime a «Tamaño real» (100 %) sobre el formulario del banco. Su
                  formato se ajusta en Configurar → la cuenta → «Formato de cheque».
                </p>
              )
            )}
          </section>
        )}

        {pdf && <CheckPdfPreview pdf={pdf} onClose={() => setPdf(null)} />}

        {voucherDraft && (
          <VoucherFormModal
            initial={voucherDraft}
            onDownload={downloadVoucherFrom}
            onClose={() => setVoucherDraft(null)}
          />
        )}

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
