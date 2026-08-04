"use client";

import { MessageSquare, Plus, ShieldCheck, SlidersHorizontal, Table2, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ActiveClient, type ClientOption } from "@/components/dashboard/active-client";
import { useEntityNaming } from "@/components/dashboard/use-entity-naming";
import { Button } from "@/components/ui/button";
import { DiscardedRow } from "@/components/ui/discarded-row";
import { formatList, pluralize } from "@/lib/format";
import { CONSOLIDATED_CLIENT_ID, CONSOLIDATED_CLIENT_NAME } from "@/lib/profit-loss/consolidate";
import {
  describeClientContents,
  type ClientContents,
  type ClientSummary,
} from "@/lib/profit-loss/db";
import { systemLabel } from "@/lib/profit-loss/upload/systems";
import { usePygData } from "./pyg-data-provider";

const MODE_LABELS = { single: "Estado único", centers: "Por centros de costo" } as const;

/** «Por centros de costo · 2024–2026» — what a client IS, in one line. */
function describeClient(client: ClientSummary): string | undefined {
  if (!client.identity) {
    return undefined;
  }
  const years = client.years;
  const span =
    years.length === 0
      ? null
      : years.length === 1
        ? `${years[0]}`
        : `${years[0]}–${years[years.length - 1]}`;
  return [systemLabel(client.identity.system), MODE_LABELS[client.identity.mode], span]
    .filter(Boolean)
    .join(" · ");
}

/**
 * El diálogo de nombre conectado al provider de PyG. Las reglas y el estado son de
 * `useEntityNaming`; aquí solo se dice de qué lista se trata — las palabras son las del default,
 * que son justamente las de PyG.
 */
function useClientNaming() {
  const { clients, createClient, renameClient } = usePygData();
  return useEntityNaming({ entities: clients, onCreate: createClient, onRename: renameClient });
}

/**
 * «Agregar cliente» outside the selector — the empty state's single exit. Same dialog, same
 * rules; only the trigger differs.
 */
export function CreateClientButton() {
  const { openCreate, dialog } = useClientNaming();
  return (
    <>
      <Button icon={<Plus size={15} />} onClick={openCreate}>
        Agregar cliente
      </Button>
      {dialog}
    </>
  );
}

/**
 * PyG's client selector: the prop-driven `ActiveClient` wired to the provider, plus the three
 * dialogs that create, rename and delete. The delete dialog lives here and not in `ActiveClient`
 * because its copy speaks PyG — «estado de resultados», «centros de costo», «cuentas» — and
 * Ocupaciones, which reuses the same block, must not inherit any of it.
 */
export function PygClientActions() {
  const {
    clients,
    activeClientId,
    activeClient,
    isConsolidated,
    consolidatable,
    contributors,
    dataset,
    mode,
    views,
    activeCenterId,
    deleteClient,
    selectClient,
  } = usePygData();
  const { openCreate, openRename, dialog } = useClientNaming();
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState<ClientSummary | null>(null);

  const withData = useMemo(() => clients.filter((client) => client.years.length > 0), [clients]);

  const options = useMemo<ClientOption[]>(() => {
    const rows = clients.map((client) => {
      const caption = describeClient(client);
      return { id: client.id, name: client.name, ...(caption ? { caption } : {}) };
    });
    // Se ofrece con dos o más clientes con datos. Si ya está abierto se sigue ofreciendo aunque
    // deje de poder sumarse —borrar el penúltimo cliente— porque si no, la entrada abierta
    // desaparecería de su propia lista y no habría desde dónde salir.
    if (!consolidatable && !isConsolidated) {
      return rows;
    }
    return [
      {
        id: CONSOLIDATED_CLIENT_ID,
        name: CONSOLIDATED_CLIENT_NAME,
        caption: `Suma de ${pluralize(withData.length, "cliente")}`,
        readOnly: true,
      },
      ...rows,
    ];
  }, [clients, withData.length, consolidatable, isConsolidated]);

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

  // In multi-center mode the subline names the active view (Consolidado / center / Sin-centro);
  // a single statement falls back to its own cost-center line, if any.
  const activeView = mode === "multi" ? views.find((v) => v.id === activeCenterId) : undefined;
  const centerCount = views.filter((v) => v.role === "center").length;
  const activeName = activeView
    ? activeView.role === "consolidado"
      ? `Consolidado (${centerCount} ${centerCount === 1 ? "centro" : "centros"})`
      : activeView.name
    : dataset?.costCenterName;
  const period = dataset
    ? activeName
      ? `${dataset.periodLabel} · ${activeName}`
      : dataset.periodLabel
    : undefined;

  // El consolidado no es una fila de `clients`, así que el bloque no lo encuentra por id: su
  // nombre y su subtítulo salen de lo que está sumando.
  const open = isConsolidated
    ? {
        name: CONSOLIDATED_CLIENT_NAME,
        ...(period ? { period: `${period} · ${pluralize(contributors.length, "cliente")}` } : {}),
      }
    : activeClient
      ? { name: activeClient.name, ...(period ? { period } : {}) }
      : undefined;

  return (
    <>
      <ActiveClient
        {...(open ? { client: open } : {})}
        emptySubline="Ningún estado de resultados cargado"
        clients={options}
        activeClientId={activeClientId}
        onSelect={(id) => void selectClient(id)}
        onCreate={openCreate}
        onRename={openRename}
        onDelete={(id) => setDeleting(clients.find((client) => client.id === id) ?? null)}
      />

      {dialog}

      {deleting && (
        <DeleteClientDialog
          client={deleting}
          others={clients.filter((client) => client.id !== deleting.id).map((c) => c.name)}
          busy={busy}
          onConfirm={() => void confirmDelete()}
          onCancel={() => setDeleting(null)}
        />
      )}
    </>
  );
}

/**
 * Deleting a client is irreversible, so the confirmation COUNTS what it discards instead of
 * naming it in the abstract — «sus datos» is exactly the phrasing one confirms by accident.
 *
 * «Los ajustes» here means what it means everywhere else in this app: a cell edited by hand over
 * the file's value. It is not saved views, filters or traffic-light thresholds — none of which
 * exist — and the copy says so in those words.
 */
function DeleteClientDialog({
  client,
  others,
  busy,
  onConfirm,
  onCancel,
}: {
  client: ClientSummary;
  others: string[];
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const [contents, setContents] = useState<ClientContents | null>(null);

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

  const years = contents?.years ?? [];
  const span =
    years.length === 0
      ? null
      : years.length === 1
        ? `${years[0]}`
        : `${years[0]}–${years[years.length - 1]}`;
  const data = contents
    ? [
        span ? `estado de resultados ${span}` : null,
        contents.centers > 0
          ? pluralize(contents.centers, "centro de costo", "centros de costo")
          : null,
        contents.accounts > 0 ? pluralize(contents.accounts, "cuenta") : null,
      ].filter(Boolean)
    : [];

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
            Se descarta de este cliente
          </div>
          <ul className="divide-y divide-border-soft">
            <DiscardedRow icon={<Table2 size={15} />} label="Los datos">
              {data.length > 0 ? data.join(", ") : "no hay ningún estado de resultados cargado"}.
            </DiscardedRow>
            <DiscardedRow icon={<SlidersHorizontal size={15} />} label="Los ajustes">
              las celdas editadas a mano por encima del valor del archivo.
            </DiscardedRow>
            <DiscardedRow icon={<MessageSquare size={15} />} label="Los comentarios">
              {contents === null
                ? "las notas escritas sobre sus cuentas."
                : contents.comments === 0
                  ? "no hay ninguna nota escrita sobre sus cuentas."
                  : `${pluralize(contents.comments, "nota")} ${
                      contents.comments === 1 ? "escrita" : "escritas"
                    } sobre sus cuentas.`}
            </DiscardedRow>
          </ul>
        </div>

        {others.length > 0 && (
          <div className="mt-3 flex items-start gap-2.5 rounded-[9px] bg-surface-muted px-3.5 py-3">
            <ShieldCheck size={16} className="mt-px shrink-0 text-muted" />
            <p className="text-[12.5px] leading-relaxed text-ink-soft">
              <strong className="font-semibold text-ink">Los demás clientes no se tocan.</strong>{" "}
              {formatList(others)} {others.length === 1 ? "conserva" : "conservan"} sus datos,
              ajustes y comentarios.
            </p>
          </div>
        )}

        <div className="mt-5 flex items-center justify-end gap-2.5">
          <Button variant="secondary" size="sm" disabled={busy} onClick={onCancel}>
            Cancelar
          </Button>
          <Button variant="danger-solid" size="sm" disabled={busy} onClick={onConfirm}>
            Eliminar cliente
          </Button>
        </div>
      </div>
    </div>
  );
}
