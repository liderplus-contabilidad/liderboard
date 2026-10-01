"use client";

import { LockKeyhole } from "lucide-react";
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { VAULT_PASSWORD_MIN_LENGTH } from "@/lib/credentials/vault";
import { useOperations } from "./operations-provider";

export function VaultGate({ label }: { label?: string } = {}) {
  const ops = useOperations();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        size="toolbar"
        variant="secondary"
        icon={<LockKeyhole size={14} />}
        onClick={() => setOpen(true)}
      >
        {label ?? (ops.hasVault ? "Desbloquear claves" : "Proteger claves")}
      </Button>
      {open && !ops.unlocked && <VaultDialog onClose={() => setOpen(false)} />}
    </>
  );
}

export function VaultDialog({
  onClose,
  onUnlocked,
}: {
  onClose: () => void;
  onUnlocked?: () => void;
}) {
  const ops = useOperations();
  const creating = !ops.hasVault;
  const passwordId = useId(),
    confirmationId = useId();
  const [password, setPassword] = useState(""),
    [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState<string | null>(null),
    [busy, setBusy] = useState(false);
  return (
    <Modal
      open
      title={creating ? "Proteger claves" : "Desbloquear claves"}
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <p className="mb-5 text-[13px] leading-relaxed text-muted">
        {creating
          ? "Crea una contraseña para proteger las credenciales de todas tus empresas en este navegador."
          : "Ingresa tu contraseña de protección para consultar y editar las credenciales."}
      </p>
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          if (busy) return;
          if (creating && password !== confirmation) {
            setError("Las contraseñas no coinciden.");
            return;
          }
          setBusy(true);
          setError(null);
          try {
            await ops.unlock(password);
            setPassword("");
            setConfirmation("");
            onClose();
            onUnlocked?.();
          } catch (cause) {
            setError(cause instanceof Error ? cause.message : "No se pudo desbloquear.");
          } finally {
            setBusy(false);
          }
        }}
      >
        <label htmlFor={passwordId} className="block text-[13px] font-medium text-ink">
          Contraseña de protección
          <input
            id={passwordId}
            aria-label="Contraseña de protección"
            autoComplete={creating ? "new-password" : "current-password"}
            type="password"
            required
            minLength={creating ? VAULT_PASSWORD_MIN_LENGTH : undefined}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={busy}
            className="mt-2 h-[38px] w-full rounded-[9px] border border-border bg-surface px-3 font-mono text-[14px] tabular-nums outline-none focus:border-brand"
          />
        </label>
        {creating && (
          <>
            <label htmlFor={confirmationId} className="block text-[13px] font-medium text-ink">
              Confirmar contraseña
              <input
                id={confirmationId}
                aria-label="Confirmar contraseña"
                autoComplete="new-password"
                type="password"
                required
                value={confirmation}
                onChange={(e) => setConfirmation(e.target.value)}
                disabled={busy}
                className="mt-2 h-[38px] w-full rounded-[9px] border border-border bg-surface px-3 font-mono text-[14px] tabular-nums outline-none focus:border-brand"
              />
            </label>
            <p className="text-[12px] leading-relaxed text-muted">
              Mínimo {VAULT_PASSWORD_MIN_LENGTH} caracteres. Guárdala: esta contraseña no se puede
              recuperar.
            </p>
          </>
        )}
        {error && (
          <p role="alert" className="text-[13px] text-warning">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2 border-t border-border-soft pt-4">
          <Button
            type="button"
            size="toolbar"
            variant="secondary"
            disabled={busy}
            onClick={onClose}
          >
            Cancelar
          </Button>
          <Button type="submit" size="toolbar" disabled={busy}>
            {busy ? "Abriendo…" : creating ? "Guardar contraseña" : "Desbloquear"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
