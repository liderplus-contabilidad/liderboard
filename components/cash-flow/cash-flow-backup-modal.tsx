"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { FileUploadCard } from "@/components/ui/file-upload-card";
import { parseBackup, type BackupEnvelope } from "@/lib/backup";
import {
  cashFlowBackupAdapter,
  CASH_FLOW_BACKUP_TABLE_NAMES,
  type CashFlowBackupTables,
} from "@/lib/cash-flow/backup";

const TABLE_LABELS = {
  clients: "Empresas",
  centers: "Centros",
  accounts: "Cuentas bancarias",
  payables: "Documentos de cartera",
  manualObligations: "Obligaciones manuales",
  checks: "Cheques",
  flows: "Capturas de flujo",
  cashEntries: "Filas de cargas cash",
  meta: "Registros de carga",
  active: "Empresa activa",
};

export function CashFlowBackupModal({
  file,
  download: downloadCurrent,
  onClose,
  onDone,
  restore,
}: {
  file: File;
  download: () => Promise<void>;
  onClose: () => void;
  onDone: () => void;
  restore: (backup: BackupEnvelope<CashFlowBackupTables>) => Promise<boolean>;
}) {
  const [prepared, setPrepared] = useState<BackupEnvelope<CashFlowBackupTables> | null>(null);
  const [filename, setFilename] = useState("");
  const [busy, setBusy] = useState<"read" | "download" | "restore" | null>("read");
  const [error, setError] = useState("");
  const [result, setResult] = useState("");
  const running = useRef(false);
  const restoring = useRef(false);
  const input = useRef<HTMLInputElement>(null);
  const summary = useMemo(
    () => (prepared ? cashFlowBackupAdapter.summarize(prepared.tables) : null),
    [prepared],
  );

  const download = async () => {
    if (running.current) return;
    running.current = true;
    setBusy("download");
    setError("");
    try {
      await downloadCurrent();
    } catch {
      setError("No se pudo descargar el respaldo. Intenta nuevamente.");
    } finally {
      running.current = false;
      setBusy(null);
    }
  };

  const read = useCallback(async (file: File) => {
    if (running.current) return;
    running.current = true;
    setBusy("read");
    setError("");
    setResult("");
    setPrepared(null);
    try {
      const checkpoint = parseBackup(await file.text(), cashFlowBackupAdapter);
      setPrepared(checkpoint);
      setFilename(file.name);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo leer el archivo de respaldo.");
    } finally {
      running.current = false;
      setBusy(null);
    }
  }, []);

  useEffect(() => {
    void read(file);
  }, [file, read]);

  const confirm = async () => {
    if (running.current || !prepared) return;
    running.current = true;
    restoring.current = true;
    setBusy("restore");
    setError("");
    try {
      const refreshed = await restore(prepared);
      setPrepared(null);
      setResult(
        refreshed
          ? "Respaldo restaurado."
          : "Datos restaurados. La vista no pudo reiniciarse; revisa la fecha y los filtros.",
      );
    } catch {
      setError("No se pudo restaurar. Tus datos siguen intactos; intenta de nuevo.");
    } finally {
      restoring.current = false;
      running.current = false;
      setBusy(null);
    }
  };

  return (
    <Modal
      open
      title="Restaurar Cuentas por Pagar"
      width={620}
      onClose={() => {
        if (!restoring.current) onClose();
      }}
    >
      <div className="space-y-6 text-[13px] text-ink-soft" aria-busy={busy !== null}>
        {error && (
          <p role="alert" className="rounded-[9px] bg-warning/10 p-3 text-ink">
            {error}
          </p>
        )}
        {result && (
          <output className="block rounded-[9px] bg-brand-soft p-3 text-ink">{result}</output>
        )}
        {busy && (
          <output className="block">
            {busy === "read"
              ? "Validando archivo…"
              : busy === "download"
                ? "Descargando…"
                : "Restaurando…"}
          </output>
        )}
        <input
          ref={input}
          type="file"
          accept=".json,application/json"
          className="hidden"
          aria-label="Archivo de respaldo"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) void read(file);
          }}
        />
        {prepared && summary ? (
          <>
            <FileUploadCard
              kind="json"
              fileName={`Respaldo del ${new Date(prepared.createdAt).toLocaleDateString("es-EC", {
                day: "numeric",
                month: "short",
                year: "numeric",
              })}`}
              originalFileName={filename}
              actionSlot={
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={busy !== null}
                  onClick={() => input.current?.click()}
                >
                  Cambiar archivo
                </Button>
              }
            >
              <span className="text-[12px]">
                Creado a las{" "}
                {new Date(prepared.createdAt).toLocaleTimeString("es-EC", {
                  hour: "numeric",
                  minute: "2-digit",
                  timeZoneName: "short",
                })}
              </span>
            </FileUploadCard>
            <div>
              <h3 className="text-[12px] font-medium text-muted">Empresas incluidas</h3>
              <p className="mt-2 break-words font-medium text-ink">
                {summary.clients.length
                  ? summary.clients.map((client) => client.name).join(" · ")
                  : "Sin empresas: respaldo vacío"}
              </p>
            </div>
            <details className="border-y border-border-soft py-3">
              <summary className="cursor-pointer py-1 text-[12px] font-medium text-ink hover:text-brand">
                Contenido del respaldo
              </summary>
              <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 text-[12px]">
                {CASH_FLOW_BACKUP_TABLE_NAMES.map((table) => (
                  <div key={table} className="flex justify-between gap-3">
                    <dt>{TABLE_LABELS[table]}</dt>
                    <dd className="font-mono tabular-nums text-ink">{summary.counts[table]}</dd>
                  </div>
                ))}
              </dl>
            </details>
            <div className="space-y-2 rounded-[9px] bg-warning/10 p-4 text-ink">
              <p className="font-semibold">
                {summary.clients.length
                  ? "Reemplazará todas las empresas y sus datos."
                  : "El respaldo está vacío: eliminará todos los datos actuales."}
              </p>
              <p>Cierra otras pestañas del navegador con Cuentas por Pagar abierto.</p>
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-border-soft pt-5">
              <Button
                variant="ghost"
                size="sm"
                className="mr-auto"
                disabled={busy !== null}
                icon={<Download size={15} />}
                onClick={() => void download()}
              >
                Guardar copia actual
              </Button>
              <Button variant="secondary" disabled={busy === "restore"} onClick={onClose}>
                Cancelar
              </Button>
              <Button
                variant="danger-solid"
                disabled={busy !== null}
                onClick={() => void confirm()}
              >
                Restaurar y reemplazar
              </Button>
            </div>
          </>
        ) : result ? (
          <div className="flex justify-end">
            <Button onClick={onDone}>Listo</Button>
          </div>
        ) : (
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={onClose}>
              Cancelar
            </Button>
            <Button disabled={busy !== null} onClick={() => input.current?.click()}>
              Cambiar archivo
            </Button>
          </div>
        )}
      </div>
    </Modal>
  );
}
