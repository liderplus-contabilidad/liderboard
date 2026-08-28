"use client";

import { FileSpreadsheet, Loader2, Upload, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { NoticeBanner } from "@/components/ui/notice-banner";
import { cn } from "@/lib/cn";
import { MONTHS_FULL_ES } from "@/lib/date";
import { formatNumber } from "@/lib/format";
import {
  describeSalesIdentityClash,
  deriveSalesIdentity,
  incomingSalesIdentity,
  sameSalesIdentity,
} from "@/lib/sales/identity";
import type { ParsedSalesMonth } from "@/lib/sales/types";
import { useSalesData } from "./sales-data-provider";

interface StagedFile {
  fileName: string;
  month?: ParsedSalesMonth;
  badge: string;
  error?: string;
}

/**
 * The sales upload modal, with the shape of PyG's: each file is PARSED on being dropped, listed with
 * the month it declared —or with its own error— and can be removed one by one **before anything is
 * written**. An invalid file does not drag the rest down, which is the entire reason the upload is in
 * two phases.
 *
 * What is checked at the BATCH level, and not per file, are two things that only make sense looking
 * at the whole: that a month is not repeated —two files of the same period would overwrite each other
 * and the user would not know which one was left— and that the company they declare does not
 * contradict the one the client already has.
 */
export function SalesUploadModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { clientName, months, importMonths } = useSalesData();
  const [files, setFiles] = useState<StagedFile[]>([]);
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [clash, setClash] = useState<string | null>(null);
  const [summary, setSummary] = useState<{
    months: string[];
    lines: number;
    warnings: string[];
  } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Closing clears EVERYTHING, so it does not reopen over the previous upload's state.
  useEffect(() => {
    if (!open) {
      setFiles([]);
      setBusy(false);
      setClash(null);
      setSummary(null);
    }
  }, [open]);

  const addFiles = useCallback(async (list: FileList | null) => {
    // Materialized BEFORE the first `await`: the caller clears `input.value` right afterwards, and
    // that empties the live `FileList`.
    const picked = list ? Array.from(list) : [];
    if (picked.length === 0) {
      return;
    }
    // Dynamic import: SheetJS does not go into the initial bundle.
    const { parseSalesWorkbook } = await import("@/lib/sales/upload/parse");
    const staged = await Promise.all(
      picked.map(async (file): Promise<StagedFile> => {
        try {
          const result = parseSalesWorkbook(await file.arrayBuffer());
          return result.ok
            ? {
                fileName: file.name,
                month: result.month,
                badge: `${MONTHS_FULL_ES[result.month.monthIndex]} ${result.month.year} · ${formatNumber(result.month.lines.length)} líneas`,
              }
            : { fileName: file.name, badge: "No válido", error: result.message };
        } catch {
          return {
            fileName: file.name,
            badge: "No válido",
            error: "No se pudo leer el archivo (¿es un Excel válido?).",
          };
        }
      }),
    );
    setFiles((previous) => [...previous, ...staged]);
  }, []);

  const valid = useMemo(
    () =>
      files.map((file) => file.month).filter((month): month is ParsedSalesMonth => Boolean(month)),
    [files],
  );

  /** Two files of the same period would overwrite each other in silence, and the user would not know
   *  which one was left. */
  const duplicate = useMemo(() => {
    const seen = new Set<string>();
    for (const month of valid) {
      const key = `${month.year}-${month.monthIndex}`;
      if (seen.has(key)) {
        return `Hay dos archivos del mismo periodo (${MONTHS_FULL_ES[month.monthIndex]} ${month.year}). Quita uno: la carga escribiría dos veces el mismo mes.`;
      }
      seen.add(key);
    }
    return null;
  }, [valid]);

  /** Which months this upload REPLACES, so it can be said before instead of after. */
  const replaced = useMemo(() => {
    const held = new Set(months.map((month) => `${month.year}-${month.monthIndex}`));
    return valid
      .filter((month) => held.has(`${month.year}-${month.monthIndex}`))
      .map((month) => `${MONTHS_FULL_ES[month.monthIndex]} ${month.year}`);
  }, [valid, months]);

  const write = useCallback(async () => {
    setBusy(true);
    try {
      await importMonths(valid);
      setSummary({
        months: valid.map((month) => `${MONTHS_FULL_ES[month.monthIndex]} ${month.year}`),
        lines: valid.reduce((total, month) => total + month.lines.length, 0),
        warnings: valid.flatMap((month) => month.warnings),
      });
      setFiles([]);
    } finally {
      setBusy(false);
      setClash(null);
    }
  }, [importMonths, valid]);

  const commit = useCallback(async () => {
    if (busy || valid.length === 0 || duplicate) {
      return;
    }
    // The identity is compared BEFORE writing. A client with no sales has none, so the first upload
    // adopts it and this path is not walked.
    const current = deriveSalesIdentity(months);
    const incoming = incomingSalesIdentity(valid);
    if (current && incoming && !sameSalesIdentity(current, incoming)) {
      setClash(describeSalesIdentityClash(current, incoming, clientName ?? "este cliente"));
      return;
    }
    await write();
  }, [busy, valid, duplicate, months, clientName, write]);

  if (!open) {
    return null;
  }

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-6">
        <div className="flex max-h-full w-full max-w-[560px] flex-col rounded-2xl border border-border bg-surface shadow-[0_24px_60px_rgba(15,23,42,0.24)]">
          <header className="flex shrink-0 items-center justify-between border-b border-border px-5 py-3.5">
            <h2 className="text-sm font-semibold text-ink">
              {summary ? "Carga completa" : "Cargar ventas por servicio"}
            </h2>
            <button
              type="button"
              aria-label="Cerrar"
              onClick={onClose}
              className="text-faint hover:text-ink"
            >
              <X size={18} />
            </button>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {summary ? (
              <div className="flex flex-col gap-3 p-5">
                <p className="text-[13px] text-ink">
                  Se cargaron{" "}
                  {summary.months.length === 1 ? "1 mes" : `${summary.months.length} meses`} (
                  {summary.months.join(", ")}) con {formatNumber(summary.lines)} líneas de factura.
                </p>
                {summary.warnings.length > 0 && (
                  <NoticeBanner details={summary.warnings}>
                    La lectura de {summary.warnings.length === 1 ? "un mes" : "varios meses"} no
                    cuadra con el total que declara su archivo.
                  </NoticeBanner>
                )}
              </div>
            ) : (
              <div className="p-5">
                <button
                  type="button"
                  onClick={() => inputRef.current?.click()}
                  onDragOver={(event) => {
                    event.preventDefault();
                    setDragOver(true);
                  }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={(event) => {
                    event.preventDefault();
                    setDragOver(false);
                    void addFiles(event.dataTransfer.files);
                  }}
                  className={cn(
                    "flex w-full flex-col items-center gap-2 rounded-xl border-2 border-dashed px-4 py-8 text-center transition-colors",
                    dragOver
                      ? "border-brand bg-brand-soft"
                      : "border-border bg-canvas hover:border-faint",
                  )}
                >
                  <Upload size={22} className="text-muted" />
                  <span className="text-[13px] font-medium text-ink">
                    Arrastra los archivos o haz clic para seleccionar
                  </span>
                  {/* The file's name plays NO part: the month is declared by the report itself, so
                      renaming it cannot change where it lands. */}
                  <span className="text-[11.5px] text-faint">
                    El reporte «Venta de Servicios por FACTURA», un archivo por mes (.xls / .xlsx).
                    El periodo se lee del propio reporte, no del nombre del archivo.
                  </span>
                </button>
                <input
                  ref={inputRef}
                  type="file"
                  accept=".xls,.xlsx"
                  multiple
                  className="hidden"
                  onChange={(event) => {
                    void addFiles(event.target.files);
                    event.target.value = "";
                  }}
                />

                {files.length > 0 && (
                  <ul className="mt-4 flex flex-col gap-1.5">
                    {files.map((file, index) => (
                      <li
                        key={`${file.fileName}-${index}`}
                        className="flex items-center gap-2.5 rounded-lg border border-border bg-surface px-3 py-2"
                      >
                        <FileSpreadsheet
                          size={18}
                          className={file.error ? "text-negative" : "text-brand"}
                        />
                        <span className="flex min-w-0 flex-col">
                          <span className="truncate text-[12.5px] font-medium text-ink">
                            {file.fileName}
                          </span>
                          <span
                            className={cn(
                              "text-[11px]",
                              file.error ? "text-negative" : "text-faint",
                            )}
                          >
                            {file.error ?? file.badge}
                          </span>
                        </span>
                        <button
                          type="button"
                          aria-label="Quitar"
                          onClick={() =>
                            setFiles((previous) => previous.filter((_unused, at) => at !== index))
                          }
                          className="ml-auto text-faint hover:text-negative"
                        >
                          <X size={15} />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}

                {duplicate && <NoticeBanner className="mt-3">{duplicate}</NoticeBanner>}
                {!duplicate && replaced.length > 0 && (
                  <NoticeBanner className="mt-3">
                    {replaced.length === 1
                      ? `${replaced[0]} ya estaba cargado y se reemplaza por completo.`
                      : `Estos meses ya estaban cargados y se reemplazan por completo: ${replaced.join(", ")}.`}
                  </NoticeBanner>
                )}
              </div>
            )}
          </div>

          <footer className="flex shrink-0 items-center justify-end gap-2.5 border-t border-border px-5 py-3.5">
            {summary ? (
              <button
                type="button"
                onClick={onClose}
                className="h-[34px] rounded-[8px] bg-brand px-3.5 text-[12.5px] font-semibold text-white hover:bg-brand-hover"
              >
                Cerrar
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={onClose}
                  className="h-[34px] rounded-[8px] border border-border bg-surface px-3.5 text-[12.5px] font-semibold text-muted hover:bg-canvas"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={valid.length === 0 || busy || Boolean(duplicate)}
                  onClick={() => void commit()}
                  className="inline-flex h-[34px] items-center gap-2 rounded-[8px] bg-brand px-3.5 text-[12.5px] font-semibold text-white hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {busy && <Loader2 size={14} className="animate-spin" />}
                  Cargar{" "}
                  {valid.length > 0
                    ? `${valid.length} archivo${valid.length === 1 ? "" : "s"}`
                    : ""}
                </button>
              </>
            )}
          </footer>
        </div>
      </div>

      <ConfirmDialog
        open={clash !== null}
        busy={busy}
        title="Estos archivos son de otra empresa"
        description={clash ?? ""}
        confirmLabel="Cargar de todos modos"
        onConfirm={() => void write()}
        onCancel={() => setClash(null)}
      />
    </>
  );
}
