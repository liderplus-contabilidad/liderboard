"use client";

import { FileSpreadsheet, Loader2, Upload, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { NoticeBanner } from "@/components/ui/notice-banner";
import { cn } from "@/lib/cn";
import { legacyCoverage } from "@/lib/personnel-cost/legacy";
import type { ParsedPersonnelCostBackup } from "@/lib/personnel-cost/upload";
import {
  usePersonnelCostData,
  type PersonnelCostImportOutcome,
} from "./personnel-cost-data-provider";

interface StagedFile {
  fileName: string;
  parsed?: ParsedPersonnelCostBackup;
  badge: string;
  error?: string;
}

const list = (years: readonly number[]) => years.join(", ");

/** What a file brought, in one line. */
function stagedBadge(parsed: ParsedPersonnelCostBackup): string {
  const parts: string[] = [];
  if (parsed.legacy.length > 0) {
    parts.push(
      `${parsed.legacy.length === 1 ? "Ejercicio" : "Ejercicios"} ${list(parsed.legacy.map((entry) => entry.year))}`,
    );
  }
  if (parsed.family.length > 0) {
    parts.push(`Familia ${list(parsed.family.map((entry) => entry.year))}`);
  }
  return parts.join(" · ");
}

/**
 * The upload modal of «Análisis costo personal», with the shape of Ventas': the file is PARSED on
 * being dropped and listed with what it carries —or with its own error— and nothing is written until
 * «Cargar». ONE file: the «Excel con tus datos» is the whole backup of a client, and two of them would
 * be two claims about the same years.
 *
 * What is said BEFORE writing: which exercises and family years already exist and get replaced, and
 * which exercises the file carries for years the estado de resultados answers — those are not
 * written at all, and the reader has to know it here and not after.
 */
export function PersonnelCostUploadModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { legacyYears, pygYears, typedMonthsIn, importBackup, backup } = usePersonnelCostData();
  const [file, setFile] = useState<StagedFile | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [summary, setSummary] = useState<PersonnelCostImportOutcome | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Closing clears EVERYTHING, so it does not reopen over the previous upload's state.
  useEffect(() => {
    if (!open) {
      setFile(null);
      setBusy(false);
      setSummary(null);
    }
  }, [open]);

  const addFile = useCallback(async (picked: File | null | undefined) => {
    if (!picked) {
      return;
    }
    // Dynamic import: SheetJS does not go into the initial bundle.
    const { parsePersonnelCostWorkbook } = await import("@/lib/personnel-cost/upload");
    try {
      const result = parsePersonnelCostWorkbook(await picked.arrayBuffer());
      setFile(
        result.ok
          ? { fileName: picked.name, parsed: result, badge: stagedBadge(result) }
          : { fileName: picked.name, badge: "No válido", error: result.message },
      );
    } catch {
      setFile({
        fileName: picked.name,
        badge: "No válido",
        error: "No se pudo leer el archivo (¿es un Excel válido?).",
      });
    }
  }, []);

  const parsed = file?.parsed ?? null;

  /** Exercises the file carries for years PyG answers: said before, written never. */
  const rejected = useMemo(
    () => (parsed ? parsed.legacy.filter((entry) => pygYears.has(entry.year)) : []),
    [parsed, pygYears],
  );
  const writable = useMemo(
    () => (parsed ? parsed.legacy.filter((entry) => !pygYears.has(entry.year)) : []),
    [parsed, pygYears],
  );
  /** Which stored years this upload REPLACES, so it can be said before instead of after. */
  const replaced = useMemo(() => {
    const typed = new Set(legacyYears.filter((year) => typedMonthsIn(year) > 0));
    const family = new Set((backup?.family ?? []).map((entry) => entry.year));
    return {
      legacy: writable.map((entry) => entry.year).filter((year) => typed.has(year)),
      family: (parsed?.family ?? []).map((entry) => entry.year).filter((year) => family.has(year)),
    };
  }, [writable, parsed, legacyYears, typedMonthsIn, backup]);

  const nothingToWrite = parsed !== null && writable.length === 0 && parsed.family.length === 0;

  const commit = useCallback(async () => {
    if (busy || !parsed || nothingToWrite) {
      return;
    }
    setBusy(true);
    try {
      setSummary(await importBackup(parsed));
      setFile(null);
    } finally {
      setBusy(false);
    }
  }, [busy, parsed, nothingToWrite, importBackup]);

  if (!open) {
    return null;
  }

  const writtenMonths = writable.reduce(
    (total, entry) => total + legacyCoverage(entry.series).length,
    0,
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-6">
      <div className="flex max-h-full w-full max-w-[560px] flex-col rounded-2xl border border-border bg-surface shadow-[0_24px_60px_rgba(15,23,42,0.24)]">
        <header className="flex shrink-0 items-center justify-between border-b border-border px-5 py-3.5">
          <h2 className="text-sm font-semibold text-ink">
            {summary ? "Carga completa" : "Cargar Excel con tus datos"}
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
            <div className="flex flex-col gap-3 p-5 text-[13px] text-ink">
              {summary.legacyYears.length > 0 && (
                <p>
                  Se{" "}
                  {summary.legacyYears.length === 1
                    ? "cargó el ejercicio"
                    : "cargaron los ejercicios"}{" "}
                  {list(summary.legacyYears)}.
                </p>
              )}
              {summary.familyYears.length > 0 && (
                <p>Se cargó la nómina de familia de {list(summary.familyYears)}.</p>
              )}
              {summary.rejectedYears.length > 0 && (
                <NoticeBanner>
                  {summary.rejectedYears.length === 1
                    ? `${summary.rejectedYears[0]} sale del estado de resultados y no se cargó; su tabla queda como está.`
                    : `${list(summary.rejectedYears)} salen del estado de resultados y no se cargaron; sus tablas quedan como están.`}
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
                  void addFile(event.dataTransfer.files?.[0]);
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
                  Arrastra el archivo o haz clic para seleccionar
                </span>
                <span className="text-[11.5px] text-faint">
                  El «Excel con tus datos» descargado de aquí (.xlsx): una hoja «Ejercicio año» por
                  año escrito a mano y una «Nómina de familia». Los años se leen de las hojas, no
                  del nombre del archivo.
                </span>
              </button>
              <input
                ref={inputRef}
                type="file"
                accept=".xls,.xlsx"
                className="hidden"
                onChange={(event) => {
                  void addFile(event.target.files?.[0]);
                  event.target.value = "";
                }}
              />

              {file && (
                <ul className="mt-4 flex flex-col gap-1.5">
                  <li className="flex items-center gap-2.5 rounded-lg border border-border bg-surface px-3 py-2">
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
                      onClick={() => setFile(null)}
                      className="ml-auto text-faint hover:text-negative"
                    >
                      <X size={15} />
                    </button>
                  </li>
                </ul>
              )}

              {rejected.length > 0 && (
                <NoticeBanner className="mt-3">
                  {rejected.length === 1
                    ? `${rejected[0].year} sale del estado de resultados y no se carga; su tabla queda como está.`
                    : `${list(rejected.map((entry) => entry.year))} salen del estado de resultados y no se cargan; sus tablas quedan como están.`}
                </NoticeBanner>
              )}
              {(replaced.legacy.length > 0 || replaced.family.length > 0) && (
                <NoticeBanner className="mt-3">
                  {[
                    replaced.legacy.length === 1
                      ? `El ejercicio ${replaced.legacy[0]} ya estaba escrito y se reemplaza por completo.`
                      : replaced.legacy.length > 1
                        ? `Los ejercicios ${list(replaced.legacy)} ya estaban escritos y se reemplazan por completo.`
                        : null,
                    replaced.family.length > 0
                      ? `La nómina de familia de ${list(replaced.family)} se reemplaza por completo.`
                      : null,
                  ]
                    .filter(Boolean)
                    .join(" ")}
                </NoticeBanner>
              )}
              {nothingToWrite && (
                <NoticeBanner className="mt-3">
                  El archivo no trae nada que se pueda cargar en este cliente.
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
                disabled={!parsed || busy || nothingToWrite}
                onClick={() => void commit()}
                className="inline-flex h-[34px] items-center gap-2 rounded-[8px] bg-brand px-3.5 text-[12.5px] font-semibold text-white hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-60"
              >
                {busy && <Loader2 size={14} className="animate-spin" />}
                Cargar
                {parsed && !nothingToWrite
                  ? ` ${[
                      writable.length > 0
                        ? `${writable.length} ejercicio${writable.length === 1 ? "" : "s"} (${writtenMonths} meses)`
                        : null,
                      parsed.family.length > 0
                        ? `familia de ${parsed.family.length} año${parsed.family.length === 1 ? "" : "s"}`
                        : null,
                    ]
                      .filter(Boolean)
                      .join(" y ")}`
                  : ""}
              </button>
            </>
          )}
        </footer>
      </div>
    </div>
  );
}
