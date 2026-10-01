"use client";

import { Copy, Eye, EyeOff, LockKeyhole, MoreHorizontal, Plus } from "lucide-react";
import { memo, useState } from "react";
import { Button } from "@/components/ui/button";
import { addAccess, deleteAccess } from "@/lib/operations/db";
import { working } from "@/lib/operations/model";
import type { Access } from "@/lib/operations/types";
import { AccessDetail } from "./access-detail";
import { InlineField } from "./inline-field";
import { useOperations } from "./operations-provider";
import { DeleteRow } from "./row-actions";
import { CELL_CLASS, OperationsTable } from "./table-chrome";
import { VaultGate } from "./vault-gate";

export function CompanyAccesses({ companyId }: { companyId: string }) {
  const ops = useOperations();
  const [busy, setBusy] = useState(false);
  const accesses = ops.accesses.filter((a) => a.companyId === companyId);
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-[15px] font-semibold text-brand">Credenciales</h3>
        {ops.unlocked ? (
          <div className="flex items-center gap-2">
            <Button
              size="toolbar"
              variant="ghost"
              icon={<LockKeyhole size={14} />}
              onClick={ops.lock}
            >
              Bloquear claves
            </Button>
            <Button
              size="toolbar"
              icon={<Plus size={14} />}
              disabled={busy}
              onClick={async () => {
                if (!ops.key || busy) return;
                setBusy(true);
                try {
                  await ops.save(() => addAccess(companyId, ops.key!));
                } catch {
                  /* Provider keeps the save error visible. */
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? "Agregando…" : "Nuevo acceso"}
            </Button>
          </div>
        ) : (
          <VaultGate />
        )}
      </div>
      {ops.unlocked ? (
        <OperationsTable
          headers={["Servicio", "Usuario", "Contraseña", "", ""]}
          empty={
            accesses.length ? undefined : "Sin credenciales. Agrega un acceso para esta empresa."
          }
        >
          {accesses.map((access) => (
            <AccessRow key={access.id} access={access} />
          ))}
        </OperationsTable>
      ) : (
        <p className="text-[13px] text-muted">
          {ops.hasVault
            ? "Desbloquea las claves para ver los accesos de esta empresa."
            : "Protege las claves para agregar los accesos de esta empresa."}
        </p>
      )}
    </section>
  );
}

const AccessRow = memo(function AccessRow({ access }: { access: Access }) {
  const ops = useOperations();
  const patch = ops.patchAccess;
  const v = working(access);
  const [expanded, setExpanded] = useState(false);
  const [revealed, setRevealed] = useState(false),
    [copied, setCopied] = useState(false),
    [copyError, setCopyError] = useState(false);
  return (
    <>
      <tr>
        <td className={`${CELL_CLASS} min-w-[150px]`}>
          <InlineField
            appearance="field"
            value={v.service}
            label="Servicio"
            onCommit={(service) => patch(access.id, { service })}
          />
        </td>
        <td className={`${CELL_CLASS} min-w-[190px]`}>
          <InlineField
            appearance="field"
            className="font-mono tabular-nums"
            value={v.user}
            label={`Usuario ${v.service}`}
            onCommit={(user) => patch(access.id, { user })}
          />
        </td>
        <td className={`${CELL_CLASS} min-w-[230px]`}>
          <div className="flex items-center gap-0.5">
            <InlineField
              appearance="field"
              autoComplete="off"
              type={revealed ? "text" : "password"}
              value={v.password}
              label={`Contraseña ${v.service}`}
              className="font-mono tabular-nums"
              onCommit={(password) => patch(access.id, { password })}
            />
            <Button
              size="sm"
              variant="ghost"
              iconOnly
              icon={revealed ? <EyeOff size={15} /> : <Eye size={15} />}
              aria-label={revealed ? "Ocultar contraseña" : "Mostrar contraseña"}
              onClick={() => setRevealed((s) => !s)}
            />
            <Button
              size="sm"
              variant="ghost"
              iconOnly
              icon={<Copy size={15} />}
              aria-label="Copiar contraseña"
              onClick={async (event) => {
                const password =
                  event.currentTarget.parentElement?.querySelector("input")?.value ?? v.password;
                try {
                  await navigator.clipboard.writeText(password);
                  setCopied(true);
                  setCopyError(false);
                } catch {
                  setCopyError(true);
                }
              }}
            />
          </div>
          {copied && <output className="px-2.5 text-[12px] text-muted">Copiada</output>}
          {copyError && (
            <span role="alert" className="px-2.5 text-[12px] text-warning">
              No se pudo copiar.
            </span>
          )}
        </td>
        <td className={CELL_CLASS}>
          <Button
            size="sm"
            variant="ghost"
            iconOnly
            icon={<MoreHorizontal size={15} />}
            aria-label="Datos adicionales del acceso"
            aria-expanded={expanded}
            onClick={() => setExpanded((value) => !value)}
          />
        </td>
        <td className={CELL_CLASS}>
          <DeleteRow label={`acceso ${v.service}`} onDelete={() => deleteAccess(access.id)} />
        </td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={5} className={CELL_CLASS}>
            <AccessDetail access={access} />
          </td>
        </tr>
      )}
    </>
  );
});
