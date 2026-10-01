"use client";

import { Trash2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { useOperations } from "./operations-provider";

export function DeleteRow({
  label,
  onDelete,
  description,
}: {
  label: string;
  onDelete: () => Promise<void>;
  description?: string;
}) {
  const [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false);
  const ops = useOperations();
  return (
    <>
      <Button
        size="sm"
        variant="ghost"
        iconOnly
        icon={<Trash2 size={14} />}
        aria-label={`Eliminar ${label}`}
        onClick={() => setOpen(true)}
      />
      <Modal
        open={open}
        title={`Eliminar ${label}`}
        onClose={() => {
          if (!busy) setOpen(false);
        }}
      >
        <p className="text-[13px] text-muted">{description ?? "Se eliminará esta fila."}</p>
        <div className="mt-5 flex justify-end gap-2">
          <Button size="toolbar" variant="secondary" disabled={busy} onClick={() => setOpen(false)}>
            Cancelar
          </Button>
          <Button
            size="toolbar"
            variant="danger-solid"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await ops.save(onDelete);
                setOpen(false);
              } catch {
                /* Provider shows the persistence error. */
              } finally {
                setBusy(false);
              }
            }}
          >
            Eliminar
          </Button>
        </div>
      </Modal>
    </>
  );
}

export function CreateForCompany({
  open,
  title,
  onClose,
  onCreate,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  onCreate: (companyId: string) => Promise<void>;
}) {
  const ops = useOperations();
  const [companyId, setCompanyId] = useState(""),
    [busy, setBusy] = useState(false);
  const selected = companyId || ops.companyId || ops.companies[0]?.id || "";
  return (
    <Modal
      open={open}
      title={title}
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <label className="block text-[13px] text-ink">
        Empresa
        <select
          aria-label="Empresa de la nueva fila"
          value={selected}
          onChange={(e) => setCompanyId(e.target.value)}
          className="mt-2 h-[38px] w-full rounded-[9px] border border-border bg-surface px-3 text-[13px]"
        >
          {ops.companies.map((c) => (
            <option key={c.id} value={c.id}>
              {c.edits.name ?? c.original.name}
            </option>
          ))}
        </select>
      </label>
      <div className="mt-5 flex justify-end gap-2">
        <Button size="toolbar" variant="secondary" disabled={busy} onClick={onClose}>
          Cancelar
        </Button>
        <Button
          size="toolbar"
          disabled={!selected || busy}
          onClick={async () => {
            setBusy(true);
            try {
              await onCreate(selected);
              onClose();
            } catch {
              /* Provider shows the persistence error. */
            } finally {
              setBusy(false);
            }
          }}
        >
          Agregar
        </Button>
      </div>
    </Modal>
  );
}
