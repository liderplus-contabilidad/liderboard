"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import type { OperationsImport } from "@/lib/operations/types";
import { useOperations } from "./operations-provider";

export function OperationsImportDialog({
  mode,
  onClose,
}: {
  mode: "keys" | "schedule";
  onClose: () => void;
}) {
  const ops = useOperations();
  const [parsed, setParsed] = useState<OperationsImport | null>(null),
    [filename, setFilename] = useState("");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null);
  const load = async (file: File) => {
    setBusy(true);
    setError(null);
    setParsed(null);
    setFilename(file.name);
    try {
      const bytes = await file.arrayBuffer();
      if (mode === "keys") {
        const [own, source] = await Promise.all([
          import("@/lib/credentials/export"),
          import("@/lib/operations/import"),
        ]);
        setParsed(own.parseOwnAccessWorkbook(bytes) ?? source.parseKeysWorkbook(bytes));
      } else {
        const reader = await import("@/lib/schedule/import");
        setParsed(reader.parseScheduleWorkbook(bytes));
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo leer este archivo.");
    } finally {
      setBusy(false);
    }
  };
  const confirm = async () => {
    if (!parsed || busy) return;
    setBusy(true);
    setError(null);
    try {
      await ops.commitImport(parsed, filename);
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo importar.");
      setBusy(false);
    }
  };
  const known = new Set(ops.companies.map((c) => c.id));
  const added = parsed?.companies.filter((c) => !known.has(c.id)).length ?? 0;
  return (
    <Modal
      open
      title={mode === "keys" ? "Cargar claves y empresas" : "Cargar cronograma"}
      onClose={() => {
        if (!busy) onClose();
      }}
      width={560}
    >
      <label className="block text-[13px] font-medium text-ink">
        Archivo Excel
        <input
          aria-label="Archivo Excel"
          type="file"
          accept=".xlsx,.xls"
          disabled={busy}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void load(file);
          }}
          className="mt-2 block w-full rounded-[9px] border border-border bg-surface px-3 py-3 text-[13px] text-muted file:mr-3 file:rounded-[9px] file:border-0 file:bg-brand-soft file:px-3 file:py-1.5 file:text-brand"
        />
      </label>
      {busy && (
        <output className="mt-4 block text-[13px] text-muted">
          {parsed ? "Importando…" : "Leyendo archivo…"}
        </output>
      )}
      {parsed && (
        <div className="mt-5 space-y-3 text-[13px] text-ink">
          <p className="font-medium">{filename}</p>
          <dl className="grid grid-cols-2 gap-x-5 gap-y-2 tabular-nums">
            <dt>Empresas nuevas</dt>
            <dd className="text-right">{added}</dd>
            <dt>Empresas existentes</dt>
            <dd className="text-right">{parsed.companies.length - added}</dd>
            {parsed.kind === "keys" ? (
              <>
                <dt>Accesos</dt>
                <dd className="text-right">{parsed.accesses.length}</dd>
                <dt>Tareas del Excel</dt>
                <dd className="text-right">{parsed.obligations.length}</dd>
              </>
            ) : (
              <>
                <dt>Tareas</dt>
                <dd className="text-right">{parsed.tasks.length}</dd>
              </>
            )}
          </dl>
          <p className="text-muted">Se conservarán las correcciones hechas en el sistema.</p>
          {parsed.warnings.length > 0 && (
            <details className="rounded-[9px] bg-warning/10 px-3 py-2 text-warning">
              <summary className="cursor-pointer">
                Revisar {parsed.warnings.length} observaciones
              </summary>
              <ul className="mt-3 max-h-40 list-disc space-y-1 overflow-auto pl-5">
                {parsed.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
      {error && (
        <p role="alert" className="mt-4 text-[13px] text-warning">
          {error}
        </p>
      )}
      <div className="mt-6 flex justify-end gap-2">
        <Button size="toolbar" variant="secondary" disabled={busy} onClick={onClose}>
          Cancelar
        </Button>
        <Button size="toolbar" disabled={!parsed || busy} onClick={() => void confirm()}>
          Importar
        </Button>
      </div>
    </Modal>
  );
}
