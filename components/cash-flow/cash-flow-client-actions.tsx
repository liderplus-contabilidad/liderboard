"use client";

import { Building2, Landmark, Plus, Settings2, ShieldCheck, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActiveClient,
  type ClientOption,
  type EntityLabels,
} from "@/components/dashboard/active-client";
import { useEntityNaming } from "@/components/dashboard/use-entity-naming";
import { Button } from "@/components/ui/button";
import { DiscardedRow } from "@/components/ui/discarded-row";
import type { CashFlowClientContents, CashFlowClientSummary } from "@/lib/cash-flow/db";
import { describeClientContents } from "@/lib/cash-flow/db";
import { formatList, pluralize } from "@/lib/format";
import { useCashFlowData } from "./cash-flow-data-provider";
import { ClientConfigPanel } from "./client-config-panel";

/** This module's words: the subject is the EMPRESA — what has bank accounts. */
export const CASH_FLOW_LABELS: EntityLabels = {
  subject: "empresa",
  plural: "empresas",
  renameKeeps: "sus cuentas, su cartera, sus cheques y sus flujos",
};

/** «3 cuentas · 68 documentos» — what an empresa HAS, in one line. */
function describeClient(client: CashFlowClientSummary): string | undefined {
  const parts = [
    client.accountCount > 0 ? pluralize(client.accountCount, "cuenta") : null,
    client.openPayableCount > 0 ? pluralize(client.openPayableCount, "documento") : null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : undefined;
}

function useClientNaming() {
  const { clients, createClient, updateClient } = useCashFlowData();
  return useEntityNaming({
    entities: clients,
    labels: CASH_FLOW_LABELS,
    onCreate: createClient,
    onRename: (id, name, logo) => updateClient(id, name, logo),
  });
}

/** «Agregar empresa» outside the selector — the only exit from the empty state. */
export function CreateCashFlowClientButton() {
  const { openCreate, dialog } = useClientNaming();
  return (
    <>
      <Button icon={<Plus size={15} />} onClick={openCreate}>
        Agregar empresa
      </Button>
      {dialog}
    </>
  );
}

/** «Configurar» — centers and bank accounts of the open empresa. Also offered from the empty
 *  state of every tab, because without an account the flow has no row to capture. */
export function ConfigureClientButton({
  variant = "secondary",
}: {
  variant?: "secondary" | "primary";
}) {
  const { activeClientId } = useCashFlowData();
  const [open, setOpen] = useState(false);
  if (!activeClientId) {
    return null;
  }
  return (
    <>
      <Button
        variant={variant}
        size="toolbar"
        icon={<Settings2 size={14} />}
        onClick={() => setOpen(true)}
      >
        Configurar
      </Button>
      {open && <ClientConfigPanel onClose={() => setOpen(false)} />}
    </>
  );
}

/**
 * Flujo de caja's empresa selector: the prop-driven `ActiveClient` wired to the provider, plus the
 * dialogs that create, rename and delete — the same shape as `PayrollClientActions`.
 */
export function CashFlowClientActions() {
  const { clients, activeClientId, activeClient, deleteClient, selectClient } = useCashFlowData();
  const { openCreate, openRename, dialog } = useClientNaming();
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState<CashFlowClientSummary | null>(null);

  const options = useMemo<ClientOption[]>(
    () =>
      clients.map((client) => {
        const caption = describeClient(client);
        return {
          id: client.id,
          name: client.name,
          ...(caption ? { caption } : {}),
          ...(client.logo ? { logo: client.logo } : {}),
        };
      }),
    [clients],
  );

  const confirmDelete = useCallback(async () => {
    if (!deleting) {
      return;
    }
    setBusy(true);
    try {
      await deleteClient(deleting.id);
      setDeleting(null);
    } finally {
      setBusy(false);
    }
  }, [deleting, deleteClient]);

  return (
    <div className="flex items-center gap-2.5">
      <ConfigureClientButton />
      <ActiveClient
        {...(activeClient
          ? {
              client: {
                name: activeClient.name,
                period: pluralize(activeClient.accountCount, "cuenta"),
                ...(activeClient.logo ? { logo: activeClient.logo } : {}),
              },
            }
          : {})}
        clients={options}
        activeClientId={activeClientId}
        labels={CASH_FLOW_LABELS}
        onSelect={(id) => void selectClient(id)}
        onCreate={openCreate}
        onRename={openRename}
        onDelete={(id) => setDeleting(clients.find((client) => client.id === id) ?? null)}
      />

      {dialog}

      {deleting && (
        <DeleteCashFlowClientDialog
          client={deleting}
          others={clients.filter((client) => client.id !== deleting.id).map((c) => c.name)}
          busy={busy}
          onConfirm={() => void confirmDelete()}
          onCancel={() => setDeleting(null)}
        />
      )}
    </div>
  );
}

/** Deleting is irreversible, so the confirmation COUNTS what it discards. */
function DeleteCashFlowClientDialog({
  client,
  others,
  busy,
  onConfirm,
  onCancel,
}: {
  client: CashFlowClientSummary;
  others: string[];
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const [contents, setContents] = useState<CashFlowClientContents | null>(null);

  useEffect(() => {
    let cancelled = false;
    void describeClientContents(client.id).then((result) => {
      if (!cancelled) {
        setContents(result);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [client.id]);

  const line = (count: number, noun: string) => (count > 0 ? pluralize(count, noun) : null);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-ink/40 p-6">
      <div className="w-full max-w-[520px] rounded-[13px] border border-border bg-surface p-5 shadow-[0_24px_60px_rgba(15,23,42,0.24)]">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-[9px] bg-negative/10">
            <Trash2 size={17} className="text-negative" />
          </span>
          <div className="min-w-0">
            <h2 className="text-[15px] font-bold tracking-[-0.2px] text-ink">
              Eliminar «{client.name}»
            </h2>
            <p className="mt-0.5 text-[12.5px] text-faint">Esta acción no se puede deshacer.</p>
          </div>
        </div>

        <div className="mt-4 overflow-hidden rounded-[9px] border border-border">
          <div className="border-b border-border bg-surface-muted px-3.5 py-2 text-[10.5px] font-semibold uppercase tracking-[0.5px] text-faint">
            Se descarta de esta empresa
          </div>
          <ul className="divide-y divide-border-soft">
            <DiscardedRow icon={<Landmark size={15} />} label="Las cuentas y el flujo">
              {contents
                ? [line(contents.accountCount, "cuenta"), line(contents.flowCount, "flujo")]
                    .filter(Boolean)
                    .join(", ") || "sin cuentas ni flujos"
                : "…"}
              .
            </DiscardedRow>
            <DiscardedRow icon={<Building2 size={15} />} label="La cartera y los cheques">
              {contents
                ? [line(contents.payableCount, "documento"), line(contents.checkCount, "cheque")]
                    .filter(Boolean)
                    .join(", ") || "sin documentos ni cheques"
                : "…"}
              .
            </DiscardedRow>
          </ul>
        </div>

        {others.length > 0 && (
          <div className="mt-3 flex items-start gap-2.5 rounded-[9px] bg-surface-muted px-3.5 py-3">
            <ShieldCheck size={16} className="mt-px shrink-0 text-muted" />
            <p className="text-[12.5px] leading-relaxed text-ink-soft">
              <strong className="font-semibold text-ink">Las demás empresas no se tocan.</strong>{" "}
              {formatList(others)} {others.length === 1 ? "conserva" : "conservan"} sus cuentas, su
              cartera y sus cheques.
            </p>
          </div>
        )}

        <div className="mt-5 flex items-center justify-end gap-2.5">
          <Button variant="secondary" size="sm" disabled={busy} onClick={onCancel}>
            Cancelar
          </Button>
          <Button variant="danger-solid" size="sm" disabled={busy} onClick={onConfirm}>
            Eliminar empresa
          </Button>
        </div>
      </div>
    </div>
  );
}
