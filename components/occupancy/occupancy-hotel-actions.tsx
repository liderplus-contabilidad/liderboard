"use client";

import { CalendarRange, Pencil, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActiveClient,
  type ClientOption,
  type EntityLabels,
} from "@/components/dashboard/active-client";
import { useEntityNaming } from "@/components/dashboard/use-entity-naming";
import { Button } from "@/components/ui/button";
import { DiscardedRow } from "@/components/ui/discarded-row";
import { formatList, pluralize } from "@/lib/format";
import type { HotelContents, HotelSummary } from "@/lib/occupancy/db";
import { describeHotelContents } from "@/lib/occupancy/db";
import { DEFAULT_CENTER_ID } from "@/lib/occupancy/types";
import { useOccupancyData } from "./occupancy-data-provider";

/** Las palabras de este módulo: el sujeto es el HOTEL, no el cliente. */
export const HOTEL_LABELS: EntityLabels = {
  subject: "hotel",
  plural: "hoteles",
  renameKeeps: "sus sucursales, años y lo que hayas escrito a mano",
};

/** Los años de un hotel en una frase: «2025» o «2024–2026». */
function yearSpan(years: readonly number[]): string | null {
  if (years.length === 0) {
    return null;
  }
  return years.length === 1 ? `${years[0]}` : `${years[0]}–${years[years.length - 1]}`;
}

/** «2 sucursales · 2025–2026» — lo que un hotel ES, en una línea. */
function describeHotel(hotel: HotelSummary): string | undefined {
  if (!hotel.identity) {
    return undefined;
  }
  return [
    hotel.centers > 0 ? pluralize(hotel.centers, "sucursal", "sucursales") : null,
    yearSpan(hotel.years),
  ]
    .filter(Boolean)
    .join(" · ");
}

/**
 * El diálogo de nombre conectado al provider de Ocupaciones. Las reglas y el estado son de
 * `useEntityNaming`; lo único de aquí son las palabras, que hablan de hoteles y no de clientes.
 */
function useHotelNaming() {
  const { hotels, createHotel, updateHotel } = useOccupancyData();
  return useEntityNaming({
    entities: hotels,
    labels: HOTEL_LABELS,
    onCreate: createHotel,
    onRename: updateHotel,
  });
}

/**
 * «Agregar hotel» fuera del selector — la única salida del vacío. Mismo diálogo, mismas reglas;
 * solo cambia el disparador.
 */
export function CreateHotelButton() {
  const { openCreate, dialog } = useHotelNaming();
  return (
    <>
      <Button icon={<Plus size={15} />} onClick={openCreate}>
        Agregar hotel
      </Button>
      {dialog}
    </>
  );
}

/**
 * El selector de hoteles de Ocupaciones: el `ActiveClient` prop-driven conectado al provider, más
 * los tres diálogos que crean, renombran y borran. Viven aquí y no en `ActiveClient` porque su copia
 * habla de Ocupaciones —«sucursales», «meses con datos»— y PyG, que comparte el bloque, no debe
 * heredar nada de eso.
 */
export function OccupancyHotelActions() {
  const {
    hotels,
    activeHotelId,
    activeHotel,
    activeCenterId,
    activeCenterName,
    activeYear,
    centers,
    isConsolidated,
    deleteHotel,
    selectHotel,
  } = useOccupancyData();
  const { openCreate, openRename, dialog } = useHotelNaming();
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState<HotelSummary | null>(null);

  const options = useMemo<ClientOption[]>(
    () =>
      hotels.map((hotel) => {
        const caption = describeHotel(hotel);
        return {
          id: hotel.id,
          name: hotel.name,
          ...(caption ? { caption } : {}),
          ...(hotel.logo ? { logo: hotel.logo } : {}),
        };
      }),
    [hotels],
  );

  const confirmDelete = useCallback(async () => {
    if (!deleting) {
      return;
    }
    setBusy(true);
    try {
      await deleteHotel(deleting.id);
      setDeleting(null);
    } finally {
      setBusy(false);
    }
  }, [deleting, deleteHotel]);

  // `principal` is left out: it is labelled with the hotel's own name, so naming it here would say
  // the same thing twice.
  const centerLabel = isConsolidated
    ? `Consolidado (${pluralize(centers.length, "sucursal", "sucursales")})`
    : activeCenterId === DEFAULT_CENTER_ID
      ? undefined
      : activeCenterName;
  const period = [activeYear, centerLabel].filter(Boolean).join(" · ") || undefined;

  return (
    <>
      <ActiveClient
        {...(activeHotel
          ? {
              client: {
                name: activeHotel.name,
                ...(period ? { period } : {}),
                ...(activeHotel.logo ? { logo: activeHotel.logo } : {}),
              },
            }
          : {})}
        caption="Ocupación diaria"
        emptySubline="Ninguna ocupación cargada"
        clients={options}
        activeClientId={activeHotelId}
        labels={HOTEL_LABELS}
        onSelect={(id) => void selectHotel(id)}
        onCreate={openCreate}
        onRename={openRename}
        onDelete={(id) => setDeleting(hotels.find((hotel) => hotel.id === id) ?? null)}
      />

      {dialog}

      {deleting && (
        <DeleteHotelDialog
          hotel={deleting}
          others={hotels.filter((hotel) => hotel.id !== deleting.id).map((h) => h.name)}
          busy={busy}
          onConfirm={() => void confirmDelete()}
          onCancel={() => setDeleting(null)}
        />
      )}
    </>
  );
}

/**
 * Borrar un hotel es irreversible, así que la confirmación CUENTA lo que descarta en vez de
 * nombrarlo en abstracto — «sus datos» es justo la frase que uno confirma sin leer.
 */
function DeleteHotelDialog({
  hotel,
  others,
  busy,
  onConfirm,
  onCancel,
}: {
  hotel: HotelSummary;
  others: string[];
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const [contents, setContents] = useState<HotelContents | null>(null);

  useEffect(() => {
    let cancelled = false;
    void describeHotelContents(hotel.id).then((result) => {
      if (!cancelled) {
        setContents(result);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [hotel.id]);

  const span = yearSpan(contents?.years ?? []);
  const data = contents
    ? [
        contents.centers > 0 ? pluralize(contents.centers, "sucursal", "sucursales") : null,
        span,
        contents.monthsWithData > 0
          ? `${pluralize(contents.monthsWithData, "mes", "meses")} con datos`
          : null,
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
              Eliminar «{hotel.name}»
            </h2>
            <p className="mt-0.5 text-[12.5px] text-faint">Esta acción no se puede deshacer.</p>
          </div>
        </div>

        <div className="mt-4 overflow-hidden rounded-[9px] border border-border">
          <div className="border-b border-border bg-surface-muted px-3.5 py-2 text-[10.5px] font-semibold uppercase tracking-[0.5px] text-faint">
            Se descarta de este hotel
          </div>
          <ul className="divide-y divide-border-soft">
            <DiscardedRow icon={<CalendarRange size={15} />} label="Los datos">
              {data.length > 0 ? data.join(", ") : "no hay ninguna ocupación cargada"}.
            </DiscardedRow>
            <DiscardedRow icon={<Pencil size={15} />} label="Lo escrito a mano">
              las celdas que hayas escrito o corregido sobre lo que traía el archivo.
            </DiscardedRow>
          </ul>
        </div>

        {others.length > 0 && (
          <div className="mt-3 flex items-start gap-2.5 rounded-[9px] bg-surface-muted px-3.5 py-3">
            <ShieldCheck size={16} className="mt-px shrink-0 text-muted" />
            <p className="text-[12.5px] leading-relaxed text-ink-soft">
              <strong className="font-semibold text-ink">Los demás hoteles no se tocan.</strong>{" "}
              {formatList(others)} {others.length === 1 ? "conserva" : "conservan"} sus sucursales,
              años y lo escrito a mano.
            </p>
          </div>
        )}

        <div className="mt-5 flex items-center justify-end gap-2.5">
          <Button variant="secondary" size="sm" disabled={busy} onClick={onCancel}>
            Cancelar
          </Button>
          <Button variant="danger-solid" size="sm" disabled={busy} onClick={onConfirm}>
            Eliminar hotel
          </Button>
        </div>
      </div>
    </div>
  );
}
