"use client";

import { FileSpreadsheet, Loader2, Upload, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { NoticeBanner } from "@/components/ui/notice-banner";
import { UploadChips, UploadFigures, UploadSummary } from "@/components/ui/upload-summary";
import { cn } from "@/lib/cn";
import { MONTHS_FULL_ES, MONTHS_SHORT_ES, monthRangeLabels } from "@/lib/date";
import { formatList, formatNumber } from "@/lib/format";
import {
  describeSalesIdentityClash,
  deriveSalesIdentity,
  incomingSalesIdentity,
  sameSalesIdentity,
} from "@/lib/sales/identity";
import { LARGE_FILE_BYTES, readSalesFile } from "@/lib/sales/upload/client";
import { salesMonthLabel, sharedMonths } from "@/lib/sales/upload/parse";
import type { ParsedSalesMonth } from "@/lib/sales/types";
import { useSalesData } from "./sales-data-provider";

interface StagedFile {
  fileName: string;
  /** Every month the file's lines fell into — one, or forty-four for the whole history. */
  months?: ParsedSalesMonth[];
  /** The FILE's warnings — shown, never stored. */
  warnings?: string[];
  badge: string;
  error?: string;
}

/** What a file brought, in one line: the period —one month, or the first and the last— and the
 *  count of lines. */
function stagedBadge(months: readonly ParsedSalesMonth[]): string {
  const lines = formatNumber(months.reduce((total, month) => total + month.lineCount, 0));
  if (months.length === 1) {
    const [month] = months;
    return `${MONTHS_FULL_ES[month.monthIndex]} ${month.year} · ${lines} líneas`;
  }
  const sorted = [...months].sort((a, b) => a.year - b.year || a.monthIndex - b.monthIndex);
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  return (
    `${MONTHS_SHORT_ES[first.monthIndex]} ${first.year} – ${MONTHS_SHORT_ES[last.monthIndex]} ` +
    `${last.year} · ${months.length} meses · ${lines} líneas`
  );
}

/** Months arriving with only part of their calendar covered: the one case where «replace the
 *  month whole» throws data away, so it is said before writing. A notice, not a block. */
function partialMonths(months: readonly ParsedSalesMonth[]): string[] {
  return months
    .filter((month) => month.firstDay > 1)
    .map(
      (month) =>
        `${salesMonthLabel(month)}: el archivo solo trae del ${month.firstDay} al ${month.lastDay}`,
    );
}

/**
 * The sales upload modal, with the shape of PyG's: each file is PARSED on being dropped, listed with
 * the months it declared —one, or one per sheet for the app's own download— or with its own error,
 * and can be removed one by one **before anything is written**. An invalid file does not drag the
 * rest down, which is the entire reason the upload is in two phases.
 *
 * What is checked at the BATCH level, and not per file, are two things that only make sense looking
 * at the whole of the MONTHS, whichever file each came in: that a period is not repeated —two of
 * the same month would overwrite each other and the user would not know which one was left— and
 * that the company they declare does not contradict the one the client already has.
 */
export function SalesUploadModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { clientName, coverage, importMonths } = useSalesData();
  const [files, setFiles] = useState<StagedFile[]>([]);
  const [busy, setBusy] = useState(false);
  const [reading, setReading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [clash, setClash] = useState<string | null>(null);
  /** Files awaiting confirmation before being READ, because reading is the expensive part. */
  const [oversized, setOversized] = useState<File[] | null>(null);
  const [summary, setSummary] = useState<{
    /** How many months were written. */
    months: number;
    /** Those months as contiguous runs — never the forty-four names one by one. */
    ranges: string[];
    lines: number;
    warnings: string[];
  } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Closing clears EVERYTHING, so it does not reopen over the previous upload's state.
  useEffect(() => {
    if (!open) {
      setFiles([]);
      setBusy(false);
      setReading(false);
      setClash(null);
      setOversized(null);
      setSummary(null);
    }
  }, [open]);

  /** Reads the picked files in the Worker, ONE AT A TIME: two large reads at once kill the tab. */
  const readFiles = useCallback(async (picked: readonly File[]) => {
    setReading(true);
    try {
      for (const file of picked) {
        let staged: StagedFile;
        try {
          const result = await readSalesFile(file);
          staged = {
            fileName: file.name,
            months: result.months,
            warnings: result.warnings,
            badge: stagedBadge(result.months),
          };
        } catch (error) {
          staged = {
            fileName: file.name,
            badge: "No válido",
            error:
              error instanceof Error
                ? error.message
                : "No se pudo leer el archivo (¿es un Excel válido?).",
          };
        }
        setFiles((previous) => [...previous, staged]);
      }
    } finally {
      setReading(false);
    }
  }, []);

  /** What a drop does. The size is checked BEFORE reading: advising afterwards is too late. */
  const addFiles = useCallback(
    (list: FileList | null) => {
      // Materialized BEFORE any await: the caller clears `input.value` right afterwards, and that
      // empties the live `FileList`.
      const picked = list ? Array.from(list) : [];
      if (picked.length === 0) {
        return;
      }
      const big = picked.filter((file) => file.size > LARGE_FILE_BYTES);
      if (big.length > 0) {
        setOversized(picked);
        return;
      }
      void readFiles(picked);
    },
    [readFiles],
  );

  const valid = useMemo(() => files.flatMap((file) => file.months ?? []), [files]);
  const fileWarnings = useMemo(() => files.flatMap((file) => file.warnings ?? []), [files]);

  /** Two files of the batch with lines of the same month block it: one would overwrite the other. */
  const duplicate = useMemo(() => {
    const clashes = sharedMonths(
      files.flatMap((file) =>
        file.months ? [{ fileName: file.fileName, months: file.months }] : [],
      ),
    );
    if (clashes.length === 0) {
      return null;
    }
    const first = clashes[0];
    return (
      `«${first.fileNames.join("» y «")}» traen líneas de ${first.months.join(", ")}. ` +
      "Quita uno de los archivos o súbelos por separado: cada mes se reemplaza completo, así que " +
      "uno pisaría al otro."
    );
  }, [files]);

  /** Which months this upload REPLACES, so it can be said before instead of after. */
  const replaced = useMemo(() => {
    const held = new Set(coverage.map((row) => `${row.year}-${row.monthIndex}`));
    const months = valid.filter((month) => held.has(`${month.year}-${month.monthIndex}`));
    return { count: months.length, ranges: monthRangeLabels(months) };
  }, [valid, coverage]);

  /** Months arriving with only part of their calendar covered — see `partialMonths`. */
  const partial = useMemo(() => {
    const held = new Set(coverage.map((row) => `${row.year}-${row.monthIndex}`));
    return partialMonths(valid.filter((month) => held.has(`${month.year}-${month.monthIndex}`)));
  }, [valid, coverage]);

  const write = useCallback(async () => {
    setBusy(true);
    try {
      await importMonths(valid);
      setSummary({
        months: valid.length,
        ranges: monthRangeLabels(valid),
        lines: valid.reduce((total, month) => total + month.lineCount, 0),
        warnings: fileWarnings,
      });
      setFiles([]);
    } finally {
      setBusy(false);
      setClash(null);
    }
  }, [importMonths, valid, fileWarnings]);

  const commit = useCallback(async () => {
    if (busy || valid.length === 0 || duplicate) {
      return;
    }
    // The identity is compared BEFORE writing. A client with no sales has none, so the first upload
    // adopts it and this path is not walked.
    const current = deriveSalesIdentity(coverage);
    const incoming = incomingSalesIdentity(valid);
    if (current && incoming && !sameSalesIdentity(current, incoming)) {
      setClash(describeSalesIdentityClash(current, incoming, clientName ?? "este cliente"));
      return;
    }
    await write();
  }, [busy, valid, duplicate, coverage, clientName, write]);

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
              <div className="p-5">
                <UploadSummary>
                  <UploadFigures
                    figures={[
                      {
                        label: summary.months === 1 ? "Mes cargado" : "Meses cargados",
                        value: summary.months,
                      },
                      { label: "Líneas de factura", value: summary.lines },
                    ]}
                  />
                  {/* Several runs means the file skipped months: said, so a hole in the history
                      is not discovered later on a chart. */}
                  <UploadChips
                    label={summary.ranges.length === 1 ? "Periodo" : "Periodos"}
                    items={summary.ranges}
                    note={
                      summary.ranges.length > 1
                        ? "El archivo no trae líneas de los meses entre un periodo y el siguiente."
                        : undefined
                    }
                  />
                  {summary.warnings.length > 0 && (
                    <NoticeBanner details={summary.warnings}>
                      {summary.warnings.length === 1
                        ? "La lectura dejó una observación."
                        : `La lectura dejó ${summary.warnings.length} observaciones.`}
                    </NoticeBanner>
                  )}
                </UploadSummary>
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
                  {/* The file's name plays NO part, and neither does its range: each LINE is
                      filed under the month of its own date. */}
                  <span className="text-[11.5px] text-faint">
                    El reporte de ventas del sistema (.xls / .xlsx), de cualquier rango de fechas, o
                    el «Excel con tus datos» descargado de aquí. Cada línea cae en el mes de su
                    FECHA, así que no importa cómo se llame el archivo ni qué periodo abarque.
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

                {reading && (
                  <p className="mt-4 flex items-center gap-2 text-[12.5px] text-muted">
                    <Loader2 size={14} className="animate-spin" />
                    Leyendo el archivo. Puedes seguir usando la pantalla.
                  </p>
                )}

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
                {!duplicate && replaced.count > 0 && (
                  <NoticeBanner className="mt-3" details={partial}>
                    {replaced.count === 1
                      ? `${replaced.ranges[0]} ya estaba cargado y se reemplaza por completo.`
                      : `${replaced.count} meses ya estaban cargados y se reemplazan por completo: ${formatList(replaced.ranges)}.`}
                  </NoticeBanner>
                )}
                {!duplicate && fileWarnings.length > 0 && (
                  <NoticeBanner className="mt-3" details={fileWarnings}>
                    {fileWarnings.length === 1
                      ? "La lectura dejó una observación."
                      : `La lectura dejó ${fileWarnings.length} observaciones.`}
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
                  disabled={valid.length === 0 || busy || reading || Boolean(duplicate)}
                  onClick={() => void commit()}
                  className="inline-flex h-[34px] items-center gap-2 rounded-[8px] bg-brand px-3.5 text-[12.5px] font-semibold text-white hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {busy && <Loader2 size={14} className="animate-spin" />}
                  Cargar{" "}
                  {valid.length > 0 ? `${valid.length} mes${valid.length === 1 ? "" : "es"}` : ""}
                </button>
              </>
            )}
          </footer>
        </div>
      </div>

      <ConfirmDialog
        open={oversized !== null}
        title="El archivo es grande"
        description={
          "Leerlo puede tardar cerca de medio minuto y pedirle al navegador más de dos gigas de " +
          "memoria. Si la pestaña se te queda sin responder, cancela y vuelve a exportarlo " +
          "partido por año: se pueden subir los cuatro de una vez. Los cortes de uno o dos meses " +
          "no tienen este problema."
        }
        confirmLabel="Leerlo igualmente"
        onConfirm={() => {
          const picked = oversized ?? [];
          setOversized(null);
          void readFiles(picked);
        }}
        onCancel={() => setOversized(null)}
      />

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
