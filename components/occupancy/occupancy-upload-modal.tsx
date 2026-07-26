"use client";

import { FileSpreadsheet, Loader2, Upload, X } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { NoticeBanner } from "@/components/ui/notice-banner";
import { cn } from "@/lib/cn";
import { normalize } from "@/lib/occupancy/slug";
import type { OccupancyParseResult } from "@/lib/occupancy/types";
import { useOccupancyData } from "./occupancy-data-provider";

interface StagedFile {
  fileName: string;
  result?: OccupancyParseResult;
  badge: string;
  error?: string;
}

/** What the file declares: the record it will write, and how much of it it replaces. */
function describe({ dataset, parsedMonths }: OccupancyParseResult): string {
  const months = parsedMonths.length;
  return `${dataset.centerName} · ${dataset.year} · ${months} ${months === 1 ? "mes" : "meses"}`;
}

/**
 * Staging modal for the occupancy upload, mirroring PyG's: drop or pick several files, each
 * parsed on the fly to show the sucursal-año it declares, drop the one that doesn't belong, then
 * commit the whole selection at once. Parse failures are reported per file HERE — where the user
 * can still act on them — instead of in the banner above the grid.
 */
export function OccupancyUploadModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { importParsed } = useOccupancyData();
  const [files, setFiles] = useState<StagedFile[]>([]);
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const addFiles = useCallback(async (list: FileList | null) => {
    // Materialized BEFORE the first await: the caller clears `input.value` right after, which
    // empties the live FileList this would otherwise read.
    const picked = list ? Array.from(list) : [];
    if (picked.length === 0) {
      return;
    }
    // Dynamic import keeps SheetJS out of the initial bundle.
    const { parseOccupancyWorkbook } = await import("@/lib/occupancy/parse");
    const staged = await Promise.all(
      picked.map(async (file): Promise<StagedFile> => {
        try {
          const result = parseOccupancyWorkbook(await file.arrayBuffer(), file.name);
          return { fileName: file.name, result, badge: describe(result) };
        } catch (error) {
          return {
            fileName: file.name,
            badge: "No válido",
            error:
              error instanceof Error
                ? error.message
                : "No se pudo leer el archivo (¿es un Excel válido?).",
          };
        }
      }),
    );
    setFiles((prev) => [...prev, ...staged]);
  }, []);

  const valid = files.filter((file): file is StagedFile & { result: OccupancyParseResult } =>
    Boolean(file.result),
  );
  // A mixed selection is refused before anything is written: two companies cannot share one set
  // of tabs. Caught here so the reason is on screen while the files are still removable.
  const hotels = [
    ...new Map(valid.map((f) => [normalize(f.result.dataset.hotelName), f.result])).values(),
  ];
  const mixedHotels = hotels.length > 1;
  const warnings = valid.flatMap((f) =>
    f.result.dataset.warnings.map((warning) => `${f.fileName}: ${warning}`),
  );

  const commit = useCallback(async () => {
    if (valid.length === 0 || mixedHotels || busy) {
      return;
    }
    setBusy(true);
    try {
      await importParsed(valid.map((f) => f.result));
      // Closed before the provider's replace dialog can answer: it is mounted outside this
      // modal, so nothing is left stacked behind it.
      onClose();
      setFiles([]);
    } finally {
      setBusy(false);
    }
  }, [valid, mixedHotels, busy, importParsed, onClose]);

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-6">
      <div className="w-full max-w-[560px] rounded-2xl border border-border bg-surface shadow-[0_24px_60px_rgba(15,23,42,0.24)]">
        <header className="flex items-center justify-between border-b border-border px-5 py-3.5">
          <h2 className="text-sm font-semibold text-ink">Cargar Excel de ocupación</h2>
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
              Un archivo por sucursal y año, todos del mismo hotel (.xls / .xlsx)
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
              // Cleared immediately so picking the same file twice fires change again.
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

          {mixedHotels && (
            <NoticeBanner className="mt-3">
              Los archivos son de hoteles distintos (
              {hotels.map((r) => r.dataset.hotelName).join(", ")}); cárgalos por separado.
            </NoticeBanner>
          )}

          {warnings.length > 0 && (
            <NoticeBanner details={warnings} className="mt-3">
              {warnings.length} aviso(s) de lectura; se cargarán los valores tal cual.
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
            disabled={valid.length === 0 || mixedHotels || busy}
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
  );
}
