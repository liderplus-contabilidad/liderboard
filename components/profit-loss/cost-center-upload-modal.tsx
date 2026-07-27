"use client";

import { FileSpreadsheet, Loader2, Upload, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { cn } from "@/lib/cn";
import { db } from "@/lib/profit-loss/db";
import { PygParseError } from "@/lib/profit-loss/errors";
import { buildWorkspace, type StagedParse } from "@/lib/profit-loss/workspace";
import { NoticeBanner } from "@/components/ui/notice-banner";
import { usePygData } from "./pyg-data-provider";

interface StagedFile {
  fileName: string;
  parsed?: StagedParse;
  badge: string;
  error?: string;
}

function describe(parsed: StagedParse): string {
  if (parsed.format === "consolidated") {
    const centers = parsed.consolidated.columns.filter((c) => c.kind === "center").length;
    return `Consolidado · ${centers} centro${centers === 1 ? "" : "s"}`;
  }
  const d = parsed.result.dataset;
  if (d.costCenterName) {
    return `Centro: ${d.costCenterName}${d.year ? ` · ${d.year}` : ""}`;
  }
  return d.baseFrequency === "anual" ? "Estado único · anual" : "Estado único · mensual";
}

/**
 * Staging modal for the multi-center upload: drag/drop or pick several files, each parsed on
 * the fly to show its detected role (center / consolidado / single), keep adding, then commit
 * the whole workspace at once. The single-statement flow also goes through here.
 */
export function CostCenterUploadModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { commitWorkspace } = usePygData();
  const [files, setFiles] = useState<StagedFile[]>([]);
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  // Reset the confirm gate whenever the modal is closed, so it never reappears stale.
  useEffect(() => {
    if (!open) {
      setConfirmOpen(false);
    }
  }, [open]);

  const addFiles = useCallback(async (list: FileList | null) => {
    // Materialized BEFORE the first await: the caller clears `input.value` right after, which
    // empties the live FileList.
    const picked = list ? Array.from(list) : [];
    if (picked.length === 0) {
      return;
    }
    // Dynamic import keeps SheetJS out of the initial bundle (see `errors.ts`: the typed
    // failures live apart precisely so this import can be deferred).
    const { parseWorkbookFile } = await import("@/lib/profit-loss/parse");
    const staged = await Promise.all(
      picked.map(async (file): Promise<StagedFile> => {
        try {
          const parsed = await parseWorkbookFile(file);
          return { fileName: file.name, parsed, badge: describe(parsed) };
        } catch (error) {
          return {
            fileName: file.name,
            badge: "No válido",
            error:
              error instanceof PygParseError
                ? error.message
                : "No se pudo leer el archivo (¿es un Excel válido?).",
          };
        }
      }),
    );
    setFiles((prev) => [...prev, ...staged]);
  }, []);

  const valid = files.filter((f) => f.parsed);
  const preview =
    valid.length > 0 ? buildWorkspace(valid.map((f) => f.parsed as StagedParse)) : null;

  // The actual replace; shared by the no-edits direct path and the confirm dialog.
  const doCommit = useCallback(async () => {
    if (!preview || busy) {
      return;
    }
    setBusy(true);
    try {
      await commitWorkspace(preview);
      onClose();
      setFiles([]);
    } finally {
      setBusy(false);
    }
  }, [preview, busy, commitWorkspace, onClose]);

  // Entry from the "Cargar" button: gate on existing edits before replacing.
  const commit = useCallback(async () => {
    if (!preview || busy) {
      return;
    }
    // Hold the button disabled across the edit-count lookup so a double-click can't
    // re-enter; committing then replaces the whole workspace.
    setBusy(true);
    const editCount = await db.edits.count();
    setBusy(false);
    // Confirm first if replacing would discard existing edits.
    if (editCount > 0) {
      setConfirmOpen(true);
      return;
    }
    await doCommit();
  }, [preview, busy, doCommit]);

  if (!open) {
    return null;
  }

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-6">
        <div className="w-full max-w-[560px] rounded-2xl border border-border bg-surface shadow-[0_24px_60px_rgba(15,23,42,0.24)]">
          <header className="flex items-center justify-between border-b border-border px-5 py-3.5">
            <h2 className="text-sm font-semibold text-ink">Cargar Excel</h2>
            <button
              type="button"
              aria-label="Cerrar"
              onClick={onClose}
              className="text-faint hover:text-ink"
            >
              <X size={18} />
            </button>
          </header>

          <div className="p-5">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                void addFiles(e.dataTransfer.files);
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
              <span className="text-[11.5px] text-faint">
                Sucursales mensuales, consolidado por centros, o un estado único (.xls / .xlsx)
              </span>
            </button>
            <input
              ref={inputRef}
              type="file"
              accept=".xls,.xlsx"
              multiple
              className="hidden"
              onChange={(e) => {
                void addFiles(e.target.files);
                e.target.value = "";
              }}
            />

            {files.length > 0 && (
              <ul className="mt-4 flex flex-col gap-1.5">
                {files.map((file, i) => (
                  <li
                    key={`${file.fileName}-${i}`}
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
                        className={cn("text-[11px]", file.error ? "text-negative" : "text-faint")}
                      >
                        {file.error ?? file.badge}
                      </span>
                    </span>
                    <button
                      type="button"
                      aria-label="Quitar"
                      onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))}
                      className="ml-auto text-faint hover:text-negative"
                    >
                      <X size={15} />
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {preview && preview.meta.warnings.length > 0 && (
              <NoticeBanner details={preview.meta.warnings} className="mt-3">
                {preview.meta.warnings.length} aviso(s) de cuadre; se cargarán los valores tal cual.
              </NoticeBanner>
            )}
          </div>

          <footer className="flex items-center justify-end gap-2.5 border-t border-border px-5 py-3.5">
            <button
              type="button"
              onClick={onClose}
              className="h-[34px] rounded-[8px] border border-border bg-surface px-3.5 text-[12.5px] font-semibold text-muted hover:bg-canvas"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={!preview || busy}
              onClick={() => void commit()}
              className="inline-flex h-[34px] items-center gap-2 rounded-[8px] bg-brand px-3.5 text-[12.5px] font-semibold text-white hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busy && <Loader2 size={14} className="animate-spin" />}
              Cargar{" "}
              {valid.length > 0 ? `${valid.length} archivo${valid.length === 1 ? "" : "s"}` : ""}
            </button>
          </footer>
        </div>
      </div>
      <ConfirmDialog
        open={confirmOpen}
        variant="destructive"
        busy={busy}
        title="Reemplazar datos actuales"
        description="Cargar reemplazará los datos actuales y descartará las ediciones y comentarios existentes. ¿Continuar?"
        confirmLabel="Cargar"
        cancelLabel="Cancelar"
        onConfirm={() => void doCommit()}
        onCancel={() => setConfirmOpen(false)}
      />
    </>
  );
}
