"use client";

import { Download, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { MODULES } from "@/lib/modules";

const available = MODULES.find((entry) => entry.slug === "cash-flow")!;
const upcoming = MODULES.filter((entry) => entry.slug !== "cash-flow");

export function BackupManagerModal({
  downloading,
  onDownload,
  onRestore,
  onClose,
}: {
  downloading: boolean;
  onDownload: () => Promise<void>;
  onRestore: (file: File) => void;
  onClose: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState("");
  const [downloaded, setDownloaded] = useState(false);
  const Icon = available.icon;
  return (
    <Modal open title="Respaldos" width={620} onClose={onClose}>
      <ul className="divide-y divide-border-soft">
        <li className="flex items-center gap-3 pb-5 pt-1">
          <Icon size={19} className="shrink-0 text-brand" aria-hidden />
          <div className="min-w-0 flex-1">
            <h3 className="text-[13px] font-semibold text-ink">{available.label}</h3>
            <p className="mt-1 text-[12px] text-muted">Todas las empresas</p>
          </div>
          <div className="flex shrink-0 gap-2">
            <Button
              size="toolbar"
              icon={<Download size={14} />}
              disabled={downloading}
              onClick={() => {
                setError("");
                setDownloaded(false);
                void onDownload()
                  .then(() => setDownloaded(true))
                  .catch(() => setError("No se pudo descargar el respaldo. Intenta de nuevo."));
              }}
            >
              {downloading ? "Descargando…" : "Descargar"}
            </Button>
            <Button
              variant="secondary"
              size="toolbar"
              icon={<Upload size={14} />}
              disabled={downloading}
              onClick={() => input.current?.click()}
            >
              Restaurar
            </Button>
          </div>
        </li>
        {upcoming.map((entry) => {
          const ModuleIcon = entry.icon;
          return (
            <li key={entry.slug} className="flex items-center gap-3 py-4">
              <ModuleIcon size={19} className="shrink-0 text-muted" aria-hidden />
              <span className="flex-1 text-[13px] font-medium text-muted">{entry.label}</span>
              <span className="rounded-full bg-surface-muted px-2.5 py-1 text-[11.5px] text-muted">
                Próximamente
              </span>
            </li>
          );
        })}
      </ul>
      {error && (
        <p role="alert" className="mt-3 text-[12px] text-negative">
          {error}
        </p>
      )}
      {downloaded && (
        <output className="mt-3 block text-[12px] text-muted">Respaldo descargado.</output>
      )}
      <input
        ref={input}
        type="file"
        accept=".json,application/json"
        className="hidden"
        aria-label="Archivo de respaldo de Cuentas por Pagar"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) onRestore(file);
        }}
      />
    </Modal>
  );
}
