"use client";

import { Download } from "lucide-react";
import { useCallback, useState, type InputHTMLAttributes } from "react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import type { VoucherDocument } from "@/lib/cash-flow/check-print/voucher";
import { cn } from "@/lib/cn";

const TITLE_PREFIX = "COMPROBANTE DE EGRESO No. ";
/** The letterhead offers at least this many lines, so a missing one can be typed in. */
const MIN_COMPANY_LINES = 3;

/**
 * A blank of the form: an input that reads as part of the paper, and that is TINTED while empty so
 * what is missing is seen at a glance. Emptiness is not an error — an empty field is simply not
 * printed — which is why it is a tint and not a red border.
 */
function Blank({
  className,
  value,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, "value"> & { value: string }) {
  return (
    <input
      value={value}
      className={cn(
        "min-w-0 rounded-md border border-border px-1.5 py-[3px] text-[12px] text-ink outline-none transition-colors placeholder:text-faint focus:border-brand",
        value.trim() ? "bg-surface" : "bg-warning/10",
        className,
      )}
      {...props}
    />
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <span className="text-[11.5px] font-semibold text-ink">{children}</span>;
}

/**
 * «Comprobante de egreso» as a WINDOW IN THE SHAPE OF THE PAPER: the document the app composes —
 * what it knows plus the standard ledger codes — laid out like Dingoo's comprobante, every text an
 * input, so what is missing is completed here, at the moment of printing, instead of being hunted
 * down in a configuration beforehand. It edits the `VoucherDocument` itself: what is downloaded is
 * exactly what is on screen.
 *
 * The amounts and the documents paid are read-only: they are the check's, and changing them here
 * would print a comprobante that contradicts it. On download what was completed is KEPT (the caller
 * does it): the letterhead on the empresa, the beneficiary's id and address on the check — so the
 * next comprobante, and the next check to the same beneficiary, are born with them.
 */
export function VoucherFormModal({
  initial,
  onDownload,
  onClose,
}: {
  initial: VoucherDocument;
  onDownload: (document: VoucherDocument) => Promise<void>;
  onClose: () => void;
}) {
  const [doc, setDoc] = useState<VoucherDocument>(() => ({
    ...initial,
    companyLines: [
      ...initial.companyLines,
      ...Array.from(
        { length: Math.max(0, MIN_COMPANY_LINES - initial.companyLines.length) },
        () => "",
      ),
    ],
  }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const number = doc.title.startsWith(TITLE_PREFIX)
    ? doc.title.slice(TITLE_PREFIX.length)
    : doc.title;

  const patch = useCallback((next: Partial<VoucherDocument>) => {
    setDoc((current) => ({ ...current, ...next }));
  }, []);

  const download = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      await onDownload({
        ...doc,
        company: doc.company.trim(),
        companyLines: doc.companyLines.map((line) => line.trim()).filter(Boolean),
      });
      onClose();
    } catch {
      setError("No se pudo generar el PDF. Intenta de nuevo.");
    } finally {
      setBusy(false);
    }
  }, [doc, onDownload, onClose]);

  const missing =
    doc.party.filter((field) => !field.value.trim()).length +
    doc.entry.filter((line) => !line.code.trim() || !line.name.trim()).length +
    [doc.issuedOn, doc.payment.account, doc.payment.number, doc.payment.date].filter(
      (value) => !value.trim(),
    ).length;

  return (
    <Modal
      open
      eyebrow="Revisa y completa"
      title="Comprobante de egreso"
      width={780}
      onClose={onClose}
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-4 rounded-[9px] border border-border bg-surface p-5 shadow-[0_1px_2px_rgba(15,23,42,0.06)]">
          {/* Letterhead */}
          <header className="flex items-start gap-4">
            {doc.logo && (
              // oxlint-disable-next-line next/no-img-element
              <img
                src={doc.logo.dataUrl}
                alt=""
                className="max-h-[56px] max-w-[120px] object-contain"
              />
            )}
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <Blank
                value={doc.company}
                aria-label="Nombre de la empresa"
                placeholder="Empresa"
                className="text-[14px] font-bold"
                onChange={(event) => patch({ company: event.target.value })}
              />
              {doc.companyLines.map((line, index) => (
                <Blank
                  // A letterhead line has no identity beyond its place.
                  key={index}
                  value={line}
                  aria-label={`Línea ${index + 1} del membrete`}
                  placeholder={
                    [
                      "Razón social · RUC",
                      "Provincia / Cantón / Parroquia / Dirección",
                      "Teléfonos",
                    ][index] ?? "Línea del membrete"
                  }
                  onChange={(event) =>
                    patch({
                      companyLines: doc.companyLines.map((current, at) =>
                        at === index ? event.target.value : current,
                      ),
                    })
                  }
                />
              ))}
            </div>
          </header>

          {/* Identity box */}
          <section className="rounded-md border border-ink/70 p-3">
            <div className="mb-2 flex items-center gap-2">
              <span className="text-[13px] font-bold text-ink">{TITLE_PREFIX.trim()}</span>
              <Blank
                value={number}
                aria-label="Número de comprobante"
                className="w-[120px] font-mono font-bold tabular-nums"
                onChange={(event) => patch({ title: `${TITLE_PREFIX}${event.target.value}` })}
              />
            </div>
            <div className="grid grid-cols-[1fr_220px] gap-x-6">
              <div className="grid grid-cols-[96px_1fr] items-center gap-x-2 gap-y-1.5">
                {doc.party.map((field, index) => (
                  <div key={field.label} className="contents">
                    <Label>{field.label}</Label>
                    <Blank
                      value={field.value}
                      aria-label={field.label.replace(":", "")}
                      className={cn(index === 1 && "font-mono tabular-nums")}
                      onChange={(event) =>
                        patch({
                          party: doc.party.map((current, at) =>
                            at === index ? { ...current, value: event.target.value } : current,
                          ),
                        })
                      }
                    />
                  </div>
                ))}
              </div>
              <div className="flex items-start gap-2">
                <Label>Fecha de Emisión:</Label>
                <Blank
                  value={doc.issuedOn}
                  aria-label="Fecha de emisión"
                  placeholder="dd/mm/aaaa"
                  className="w-[96px] font-mono tabular-nums"
                  onChange={(event) => patch({ issuedOn: event.target.value })}
                />
              </div>
            </div>
          </section>

          {/* Entry */}
          <table className="w-full text-[12px]">
            <thead>
              <tr className="border border-ink/70 text-left">
                <th className="w-[150px] px-1.5 py-1 font-semibold">Código de Cta.</th>
                <th className="px-1.5 py-1 font-semibold">Nombre de la cuenta</th>
                <th className="w-[100px] px-1.5 py-1 text-right font-semibold">Debe</th>
                <th className="w-[100px] px-1.5 py-1 text-right font-semibold">Haber</th>
              </tr>
            </thead>
            <tbody>
              {doc.entry.map((line, index) => {
                const setLine = (next: Partial<typeof line>) =>
                  patch({
                    entry: doc.entry.map((current, at) =>
                      at === index ? { ...current, ...next } : current,
                    ),
                  });
                return (
                  <tr key={line.debit ? "debit" : "credit"}>
                    <td className="px-1 py-1">
                      <Blank
                        value={line.code}
                        aria-label={`Código de la cuenta ${index + 1}`}
                        className="w-full font-mono tabular-nums"
                        onChange={(event) => setLine({ code: event.target.value })}
                      />
                    </td>
                    <td className="px-1 py-1">
                      <Blank
                        value={line.name}
                        aria-label={`Nombre de la cuenta ${index + 1}`}
                        className="w-full"
                        onChange={(event) => setLine({ name: event.target.value })}
                      />
                    </td>
                    <td className="px-1.5 py-1 text-right font-mono tabular-nums">{line.debit}</td>
                    <td className="px-1.5 py-1 text-right font-mono tabular-nums">{line.credit}</td>
                  </tr>
                );
              })}
              <tr className="border-t border-ink/70 font-semibold">
                <td colSpan={2} className="px-1.5 py-1 text-right">
                  Total
                </td>
                <td className="px-1.5 py-1 text-right font-mono tabular-nums">{doc.entryTotal}</td>
                <td className="px-1.5 py-1 text-right font-mono tabular-nums">{doc.entryTotal}</td>
              </tr>
            </tbody>
          </table>

          {/* Documents paid — the check's, read-only */}
          {doc.documents.length > 0 ? (
            <table className="w-full text-[12px]">
              <thead>
                <tr className="bg-brand text-left text-white">
                  <th className="px-1.5 py-1 font-semibold">Fecha emisión</th>
                  <th className="px-1.5 py-1 font-semibold">No. Comprobante</th>
                  <th className="px-1.5 py-1 text-right font-semibold">Saldo anterior</th>
                  <th className="px-1.5 py-1 text-right font-semibold">Abono</th>
                  <th className="px-1.5 py-1 text-right font-semibold">Saldo actual</th>
                </tr>
              </thead>
              <tbody className="font-mono tabular-nums">
                {doc.documents.map((line) => (
                  <tr
                    key={`${line.number}-${line.issuedOn}`}
                    className="border-b border-border-soft"
                  >
                    <td className="px-1.5 py-1">{line.issuedOn}</td>
                    <td className="px-1.5 py-1">{line.number}</td>
                    <td className="px-1.5 py-1 text-right">{line.previous}</td>
                    <td className="px-1.5 py-1 text-right">{line.amount}</td>
                    <td className="px-1.5 py-1 text-right">{line.current}</td>
                  </tr>
                ))}
                <tr className="font-semibold">
                  <td colSpan={2} className="px-1.5 py-1 text-right font-sans">
                    Total
                  </td>
                  <td className="px-1.5 py-1 text-right">{doc.documentTotals.previous}</td>
                  <td className="px-1.5 py-1 text-right">{doc.documentTotals.amount}</td>
                  <td className="px-1.5 py-1 text-right">{doc.documentTotals.current}</td>
                </tr>
              </tbody>
            </table>
          ) : (
            <p className="rounded-md bg-surface-muted px-3 py-2 text-[12px] text-faint">
              Sin documentos: la tabla de facturas no se imprime. Se eligen en el cheque, en
              «Documentos que paga».
            </p>
          )}

          {/* Payment detail */}
          <div>
            <div className="mb-1 text-[12px] font-semibold text-ink">Detalle de pago</div>
            <div className="grid grid-cols-[110px_100px_1fr_110px_100px] gap-1.5 rounded-md bg-brand px-1.5 py-1 text-[11.5px] font-semibold text-white">
              <span>Forma de pago</span>
              <span>Fecha</span>
              <span>Banco/Cuenta</span>
              <span className="text-right">No. Documento</span>
              <span className="text-right">Valor</span>
            </div>
            <div className="grid grid-cols-[110px_100px_1fr_110px_100px] items-center gap-1.5 px-0.5 py-1">
              <Blank
                value={doc.payment.method}
                aria-label="Forma de pago"
                onChange={(event) =>
                  patch({ payment: { ...doc.payment, method: event.target.value } })
                }
              />
              <Blank
                value={doc.payment.date}
                aria-label="Fecha de pago"
                placeholder="dd/mm/aaaa"
                className="font-mono tabular-nums"
                onChange={(event) =>
                  patch({ payment: { ...doc.payment, date: event.target.value } })
                }
              />
              <Blank
                value={doc.payment.account}
                aria-label="Banco y cuenta"
                onChange={(event) =>
                  patch({ payment: { ...doc.payment, account: event.target.value } })
                }
              />
              <Blank
                value={doc.payment.number}
                aria-label="Número de cheque"
                className="text-right font-mono tabular-nums"
                onChange={(event) =>
                  patch({ payment: { ...doc.payment, number: event.target.value } })
                }
              />
              <span className="pr-1.5 text-right font-mono text-[12px] tabular-nums text-ink">
                {doc.payment.value}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span className={cn("text-[12px]", error ? "text-negative" : "text-faint")}>
            {error ??
              (missing > 0
                ? `${missing === 1 ? "Falta 1 dato" : `Faltan ${missing} datos`} (resaltados): lo vacío no se imprime.`
                : "Todo completo.")}
          </span>
          <Button variant="secondary" size="sm" className="ml-auto" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            size="sm"
            icon={<Download size={13} />}
            disabled={busy}
            onClick={() => void download()}
          >
            {busy ? "Generando…" : "Descargar PDF"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
