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

/** This module's words: the subject is the client, as in PyG. */
export const PAYROLL_LABELS: EntityLabels = {
  subject: "cliente",
  plural: "clientes",
  renameKeeps: "sus períodos y roles de pago",
};

/** «3 períodos · 2025–2026» — what a client HAS, in one line. */
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
 * The name dialog wired to Rol de Pagos' provider. The rules and the state belong to
 * `useEntityNaming`; all that is said here is which list, which words and that this module also asks
 * for the letterhead's company data.
 */
function useClientNaming() {
  const { clients, createClient, updateClient } = usePayrollData();
  return useEntityNaming({
    entities: clients,
    labels: PAYROLL_LABELS,
    // Rol de Pagos is the only module that asks for the company profile: its rol and its payslip are
    // documents with a letterhead, and a client without that data cannot produce them.
    withCompany: true,
    // And the only one that declares a COST CENTER: its name goes into the paper's heading and its
    // logo closes it on the right. It is optional, unlike the profile.
    withCostCenter: true,
    // And the only one that admits DUPLICATE NAMES: the firm keeps the nómina of several units of the
    // same company and calls them all the same, so rejecting the second «Delicmar» forced inventing a
    // name its paper does not say. What tells them apart on screen is the cost center, which travels
    // in the row's label when it is declared.
    allowDuplicateNames: true,
    onCreate: createClient,
    // The per-center logos are the fourth argument and do not exist here: a Rol de Pagos client does
    // not have the list of centers PyG derives from its data —the user DECLARES its own—, so it is
    // dropped and the profile carries on.
    onRename: (id, name, logo, _centerLogos, company, costCenter) =>
      updateClient(id, name, logo, company, costCenter),
  });
}

/** «Agregar cliente» outside the selector — the only exit from the empty state. Same dialog, same
 * rules; only the trigger changes. */
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
 * Rol de Pagos' client selector: the prop-driven `ActiveClient` wired to the provider, plus the three
 * dialogs that create, rename and delete — the same shape as `PygClientActions` and
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
          // The COMPOSED label, the same one that heads the PDF and the Excel: with duplicate names
          // allowed, the center is the only thing that can say which of the two «Delicmar» each row
          // is, and saying it here is cheaper than a second line that is almost always superfluous.
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
                // In the order in which they are PRINTED: the client's in front and its center's
                // behind, so the header confirms on screen what the PDF and the Excel head with.
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
 * Deleting a client is irreversible, so the confirmation COUNTS what it discards instead of naming it
 * in the abstract — «sus períodos» is exactly the phrase one confirms without reading.
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
