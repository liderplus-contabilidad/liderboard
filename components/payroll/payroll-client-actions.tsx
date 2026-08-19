"use client";

import { CalendarRange, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActiveClient,
  type ClientOption,
  type EntityLabels,
} from "@/components/dashboard/active-client";
import { useEntityNaming } from "@/components/dashboard/use-entity-naming";
import { Button } from "@/components/ui/button";
import { DiscardedRow } from "@/components/ui/discarded-row";
import { costCenterHeading, letterheadLogos } from "@/lib/cost-center";
import { formatList, pluralize } from "@/lib/format";
import type { PayrollClientContents, PayrollClientSummary } from "@/lib/payroll/db";
import { describeClientContents } from "@/lib/payroll/db";
import { usePayrollData } from "./payroll-data-provider";

/** Las palabras de este módulo: el sujeto es el cliente, como en PyG. */
export const PAYROLL_LABELS: EntityLabels = {
  subject: "cliente",
  plural: "clientes",
  renameKeeps: "sus períodos y roles de pago",
};

/** «3 períodos · 2025–2026» — lo que un cliente TIENE, en una línea. */
function describeClient(client: PayrollClientSummary): string | undefined {
  if (client.periodCount === 0) {
    return undefined;
  }
  const span =
    client.years.length === 0
      ? null
      : client.years.length === 1
        ? `${client.years[0]}`
        : `${client.years[0]}–${client.years[client.years.length - 1]}`;
  return [pluralize(client.periodCount, "período"), span].filter(Boolean).join(" · ");
}

/**
 * El diálogo de nombre conectado al provider de Rol de Pagos. Las reglas y el estado son de
 * `useEntityNaming`; aquí solo se dice qué lista, qué palabras y que este módulo pide además los
 * datos de la empresa del membrete.
 */
function useClientNaming() {
  const { clients, createClient, updateClient } = usePayrollData();
  return useEntityNaming({
    entities: clients,
    labels: PAYROLL_LABELS,
    // Rol de Pagos es el único módulo que pide el perfil de empresa: su rol y su comprobante son
    // documentos con membrete, y un cliente sin esos datos no puede producirlos.
    withCompany: true,
    // Y el único que declara un CENTRO DE COSTO: su nombre entra en el rótulo del papel y su logo
    // lo cierra por la derecha. Es opcional, a diferencia del perfil.
    withCostCenter: true,
    // Y el único que admite NOMBRES REPETIDOS: la firma lleva la nómina de varias unidades de una
    // misma empresa y las llama a todas igual, así que rechazar el segundo «Delicmar» obligaba a
    // inventarle un nombre que su papel no dice. Lo que las distingue en pantalla es el centro de
    // costo, que viaja en el rótulo de la fila cuando se declara.
    allowDuplicateNames: true,
    onCreate: createClient,
    // Los logos por centro son el cuarto argumento y aquí no existen: un cliente de Rol de Pagos no
    // tiene la lista de centros que PyG deriva de sus datos —el suyo lo DECLARA el usuario—, así
    // que se descarta y el perfil sigue de largo.
    onRename: (id, name, logo, _centerLogos, company, costCenter) =>
      updateClient(id, name, logo, company, costCenter),
  });
}

/** «Agregar cliente» fuera del selector — la única salida del vacío. Mismo diálogo, mismas
 * reglas; solo cambia el disparador. */
export function CreatePayrollClientButton() {
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
 * El selector de clientes de Rol de Pagos: el `ActiveClient` prop-driven conectado al provider,
 * más los tres diálogos que crean, renombran y borran — la misma forma que `PygClientActions` y
 * `OccupancyHotelActions`.
 */
export function PayrollClientActions() {
  const { clients, activeClientId, activeClient, deleteClient, selectClient } = usePayrollData();
  const { openCreate, openRename, dialog } = useClientNaming();
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState<PayrollClientSummary | null>(null);

  const options = useMemo<ClientOption[]>(
    () =>
      clients.map((client) => {
        const caption = describeClient(client);
        return {
          id: client.id,
          // El rótulo COMPUESTO, el mismo que encabeza el PDF y el Excel: con nombres repetidos
          // permitidos, el centro es lo único que puede decir cuál de los dos «Delicmar» es cada
          // fila, y decirlo aquí es más barato que una segunda línea que casi siempre sobra.
          name: costCenterHeading(client.name, client.costCenter),
          ...(caption ? { caption } : {}),
          ...(client.logo ? { logo: client.logo } : {}),
        };
      }),
    [clients],
  );

  const activeLogos = letterheadLogos(activeClient?.logo, activeClient?.costCenter);

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
    <>
      <ActiveClient
        {...(activeClient
          ? {
              client: {
                name: costCenterHeading(activeClient.name, activeClient.costCenter),
                period: pluralize(activeClient.periodCount, "período"),
                // En el orden en que se IMPRIMEN: el del cliente delante y el de su centro detrás,
                // así que la cabecera confirma en pantalla lo que el PDF y el Excel encabezan.
                ...(activeLogos.left ? { logo: activeLogos.left } : {}),
                ...(activeLogos.right ? { centerLogo: activeLogos.right } : {}),
              },
            }
          : {})}
        caption="Nómina mensual"
        emptySubline="Ningún período registrado"
        clients={options}
        activeClientId={activeClientId}
        labels={PAYROLL_LABELS}
        onSelect={(id) => void selectClient(id)}
        onCreate={openCreate}
        onRename={openRename}
        onDelete={(id) => setDeleting(clients.find((client) => client.id === id) ?? null)}
      />

      {dialog}

      {deleting && (
        <DeletePayrollClientDialog
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
 * Borrar un cliente es irreversible, así que la confirmación CUENTA lo que descarta en vez de
 * nombrarlo en abstracto — «sus períodos» es justo la frase que uno confirma sin leer.
 */
function DeletePayrollClientDialog({
  client,
  others,
  busy,
  onConfirm,
  onCancel,
}: {
  client: PayrollClientSummary;
  others: string[];
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const [contents, setContents] = useState<PayrollClientContents | null>(null);

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

  const span =
    contents && contents.years.length > 0
      ? contents.years.length === 1
        ? `${contents.years[0]}`
        : `${contents.years[0]}–${contents.years[contents.years.length - 1]}`
      : null;
  const data = contents
    ? [contents.periodCount > 0 ? pluralize(contents.periodCount, "período") : null, span].filter(
        Boolean,
      )
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
            <DiscardedRow icon={<CalendarRange size={15} />} label="Los períodos">
              {data.length > 0 ? data.join(", ") : "no hay ningún período registrado"}.
            </DiscardedRow>
          </ul>
        </div>

        {others.length > 0 && (
          <div className="mt-3 flex items-start gap-2.5 rounded-[9px] bg-surface-muted px-3.5 py-3">
            <ShieldCheck size={16} className="mt-px shrink-0 text-muted" />
            <p className="text-[12.5px] leading-relaxed text-ink-soft">
              <strong className="font-semibold text-ink">Los demás clientes no se tocan.</strong>{" "}
              {formatList(others)} {others.length === 1 ? "conserva" : "conservan"} sus períodos y
              roles de pago.
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
