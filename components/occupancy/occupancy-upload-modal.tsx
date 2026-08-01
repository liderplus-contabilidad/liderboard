"use client";

import {
  AlertTriangle,
  CircleCheck,
  CircleX,
  FileSpreadsheet,
  Loader2,
  Upload,
  X,
} from "lucide-react";
import { useCallback, useMemo, useRef, useState } from "react";
import { ComparisonCard } from "@/components/ui/comparison-card";
import { NoticeBanner } from "@/components/ui/notice-banner";
import { cn } from "@/lib/cn";
import { pluralize } from "@/lib/format";
import { describeHotelChange } from "@/lib/occupancy/hotel-identity";
import { findHotelByName, normalizeHotelName, proposeHotelName } from "@/lib/occupancy/hotels";
import { normalize } from "@/lib/occupancy/slug";
import type { OccupancyParseResult } from "@/lib/occupancy/types";
import { useOccupancyData, type ImportPlan } from "./occupancy-data-provider";

interface StagedFile {
  fileName: string;
  result?: OccupancyParseResult;
  badge: string;
  error?: string;
}

/** What the file declares: the record it will write, and how much of it it replaces. */
function describe({ dataset, parsedMonths }: OccupancyParseResult): string {
  const months = parsedMonths.length;
  return `${dataset.centerName} · ${dataset.year} · ${months} ${months === 1 ? "mes" : "meses"}`;
}

/**
 * Each file is parsed on the fly to show the center-year it declares, and the whole selection is
 * committed at once. Parse failures are reported per file HERE, where they are still actionable.
 */
export function OccupancyUploadModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { hotels, activeHotel, planImport, importParsed, importIntoNewHotel, replaceActiveHotel } =
    useOccupancyData();
  const [files, setFiles] = useState<StagedFile[]>([]);
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  /** El choque a resolver, con los archivos que lo provocaron: nada se escribe hasta que se elija. */
  const [clash, setClash] = useState<{
    plan: Extract<ImportPlan, { kind: "clash" }>;
    results: OccupancyParseResult[];
  } | null>(null);
  const [newHotelName, setNewHotelName] = useState("");
  const [newHotelNameError, setNewHotelNameError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const addFiles = useCallback(async (list: FileList | null) => {
    // Materialized BEFORE the first await: the caller clears `input.value` right after, which
    // empties the live FileList.
    const picked = list ? Array.from(list) : [];
    if (picked.length === 0) {
      return;
    }
    // Dynamic import keeps SheetJS out of the initial bundle.
    const { parseOccupancyWorkbook } = await import("@/lib/occupancy/parse");
    const staged = await Promise.all(
      picked.map(async (file): Promise<StagedFile> => {
        try {
          const result = parseOccupancyWorkbook(await file.arrayBuffer(), file.name);
          return { fileName: file.name, result, badge: describe(result) };
        } catch (error) {
          return {
            fileName: file.name,
            badge: "No válido",
            error:
              error instanceof Error
                ? error.message
                : "No se pudo leer el archivo (¿es un Excel válido?).",
          };
        }
      }),
    );
    setFiles((prev) => [...prev, ...staged]);
  }, []);

  const valid = files.filter((file): file is StagedFile & { result: OccupancyParseResult } =>
    Boolean(file.result),
  );
  // Caught here so the reason is on screen while the files are still removable.
  const declaredHotels = [
    ...new Map(valid.map((f) => [normalize(f.result.dataset.hotelName), f.result])).values(),
  ];
  const mixedHotels = declaredHotels.length > 1;
  const warnings = valid.flatMap((f) =>
    f.result.dataset.warnings.map((warning) => `${f.fileName}: ${warning}`),
  );

  /** Lo que traen los archivos, en palabras — la tarjeta derecha del diálogo de choque. */
  const incomingContents = useMemo(() => {
    const centers = new Set(valid.map((f) => f.result.dataset.centerName));
    const years = [...new Set(valid.map((f) => f.result.dataset.year))].sort((a, b) => a - b);
    return [
      centers.size > 0 ? pluralize(centers.size, "sucursal", "sucursales") : null,
      years.length === 1 ? `${years[0]}` : `${years[0]}–${years[years.length - 1]}`,
    ]
      .filter(Boolean)
      .join(" · ");
  }, [valid]);

  const done = useCallback(() => {
    setClash(null);
    // Closed before the files are dropped, so nothing re-renders against an empty list.
    onClose();
    setFiles([]);
  }, [onClose]);

  const commit = useCallback(async () => {
    if (valid.length === 0 || mixedHotels || busy) {
      return;
    }
    const results = valid.map((f) => f.result);
    const plan = planImport(results);
    // Nothing is written until the user chooses: THIS is where the files are still removable.
    if (plan.kind === "clash") {
      setNewHotelName(proposeHotelName(plan.incoming.hotelName, hotels));
      setNewHotelNameError(null);
      setClash({ plan, results });
      return;
    }
    setBusy(true);
    try {
      await importParsed(results);
      done();
    } finally {
      setBusy(false);
    }
  }, [valid, mixedHotels, busy, planImport, hotels, importParsed, done]);

  /** Las tres salidas del choque. Cada una escribe en un sitio distinto y solo en uno. */
  const runClash = useCallback(
    async (exit: "into-matching" | "new-hotel" | "replace") => {
      if (!clash || busy) {
        return;
      }
      if (exit === "new-hotel") {
        const check = normalizeHotelName(newHotelName);
        if (!check.ok) {
          setNewHotelNameError(check.message);
          return;
        }
        const taken = findHotelByName(check.name, hotels);
        if (taken) {
          setNewHotelNameError(`Ya existe un hotel llamado «${taken.name}».`);
          return;
        }
        setBusy(true);
        try {
          await importIntoNewHotel(clash.results, check.name);
          done();
        } finally {
          setBusy(false);
        }
        return;
      }
      setBusy(true);
      try {
        if (exit === "into-matching" && clash.plan.matching) {
          await importParsed(clash.results, clash.plan.matching.id);
        } else if (exit === "replace") {
          await replaceActiveHotel(clash.results);
        }
        done();
      } finally {
        setBusy(false);
      }
    },
    [clash, busy, newHotelName, hotels, importIntoNewHotel, importParsed, replaceActiveHotel, done],
  );

  const confirmation = useMemo(
    () =>
      clash
        ? describeHotelChange(clash.plan.current, clash.plan.incoming, {
            activeHotelName: activeHotel?.name ?? "el hotel abierto",
            matchingHotelName: clash.plan.matching?.name ?? null,
            proposedHotelName: newHotelName,
            activeHotelContents: describeActiveHotel(activeHotel),
            incomingContents,
          })
        : null,
    [clash, activeHotel, newHotelName, incomingContents],
  );

  if (!open) {
    return null;
  }

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-6">
        <div className="w-full max-w-[560px] rounded-2xl border border-border bg-surface shadow-[0_24px_60px_rgba(15,23,42,0.24)]">
          <header className="flex items-center justify-between border-b border-border px-5 py-3.5">
            <h2 className="text-sm font-semibold text-ink">Cargar Excel de ocupación</h2>
            <button
              type="button"
              aria-label="Cerrar"
              onClick={onClose}
              className="text-faint hover:text-ink"
            >
              <X size={18} />
            </button>
          </header>

          <div className="p-5">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                void addFiles(e.dataTransfer.files);
              }}
              className={cn(
                "flex w-full flex-col items-center gap-2 rounded-xl border-2 border-dashed px-4 py-8 text-center transition-colors",
                dragOver
                  ? "border-brand bg-brand-soft"
                  : "border-border bg-canvas hover:border-faint",
              )}
            >
              <Upload size={22} className="text-muted" />
              <span className="text-[13px] font-medium text-ink">
                Arrastra los archivos o haz clic para seleccionar
              </span>
              <span className="text-[11.5px] text-faint">
                Un archivo por sucursal y año, todos del mismo hotel (.xls / .xlsx)
              </span>
            </button>
            <input
              ref={inputRef}
              type="file"
              accept=".xls,.xlsx"
              multiple
              className="hidden"
              onChange={(e) => {
                void addFiles(e.target.files);
                // Cleared immediately so picking the same file twice fires change again.
                e.target.value = "";
              }}
            />

            {files.length > 0 && (
              <ul className="mt-4 flex flex-col gap-1.5">
                {files.map((file, i) => (
                  <li
                    key={`${file.fileName}-${i}`}
                    className="flex items-center gap-2.5 rounded-lg border border-border bg-surface px-3 py-2"
                  >
                    <FileSpreadsheet
                      size={18}
                      className={file.error ? "text-negative" : "text-brand"}
                    />
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate text-[12.5px] font-medium text-ink">
                        {file.fileName}
                      </span>
                      <span
                        className={cn("text-[11px]", file.error ? "text-negative" : "text-faint")}
                      >
                        {file.error ?? file.badge}
                      </span>
                    </span>
                    <button
                      type="button"
                      aria-label="Quitar"
                      onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))}
                      className="ml-auto text-faint hover:text-negative"
                    >
                      <X size={15} />
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {mixedHotels && (
              <NoticeBanner className="mt-3">
                Los archivos son de hoteles distintos (
                {declaredHotels.map((r) => r.dataset.hotelName).join(", ")}); cárgalos por separado.
              </NoticeBanner>
            )}

            {warnings.length > 0 && (
              <NoticeBanner details={warnings} className="mt-3">
                {warnings.length} aviso(s) de lectura; se cargarán los valores tal cual.
              </NoticeBanner>
            )}
          </div>

          <footer className="flex items-center justify-end gap-2.5 border-t border-border px-5 py-3.5">
            <button
              type="button"
              onClick={onClose}
              className="h-[34px] rounded-[8px] border border-border bg-surface px-3.5 text-[12.5px] font-semibold text-muted hover:bg-canvas"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={valid.length === 0 || mixedHotels || busy}
              onClick={() => void commit()}
              className="inline-flex h-[34px] items-center gap-2 rounded-[8px] bg-brand px-3.5 text-[12.5px] font-semibold text-white hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busy && <Loader2 size={14} className="animate-spin" />}
              Cargar{" "}
              {valid.length > 0 ? `${valid.length} archivo${valid.length === 1 ? "" : "s"}` : ""}
            </button>
          </footer>
        </div>
      </div>

      {/* Sobre el modal, no en su lugar: los archivos siguen en la lista detrás, que es lo que
          hace que «Cancelar» pueda no escribir nada y dejarlos donde estaban. */}
      {clash && confirmation && (
        <HotelClashDialog
          confirmation={confirmation}
          busy={busy}
          proposedName={newHotelName}
          proposedNameError={newHotelNameError}
          onProposedNameChange={(name) => {
            setNewHotelName(name);
            setNewHotelNameError(null);
          }}
          onCancel={() => setClash(null)}
          onPrimary={() => void runClash(clash.plan.matching ? "into-matching" : "new-hotel")}
          onReplace={() => void runClash("replace")}
        />
      )}
    </>
  );
}

/** Lo que el hotel abierto tiene ahora, en una frase — lo que el bloque de reemplazo descarta. */
function describeActiveHotel(hotel: { centers: number; years: number[] } | undefined): string {
  if (!hotel || hotel.years.length === 0) {
    return "sin datos cargados";
  }
  const years = hotel.years;
  return [
    pluralize(hotel.centers, "sucursal", "sucursales"),
    years.length === 1 ? `${years[0]}` : `${years[0]}–${years[years.length - 1]}`,
  ].join(", ");
}

/**
 * El diálogo de choque, en sus dos formas. Rinde lo que `describeHotelChange` decidió: la copia y
 * qué acción es la principal viven en `lib/`, y esto solo las pone en pantalla.
 */
function HotelClashDialog({
  confirmation,
  busy,
  proposedName,
  proposedNameError,
  onProposedNameChange,
  onCancel,
  onPrimary,
  onReplace,
}: {
  confirmation: NonNullable<ReturnType<typeof describeHotelChange>>;
  busy: boolean;
  proposedName: string;
  proposedNameError: string | null;
  onProposedNameChange: (name: string) => void;
  onCancel: () => void;
  onPrimary: () => void;
  onReplace: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-ink/40 p-6">
      <div className="w-full max-w-[600px] rounded-[13px] border border-border bg-surface p-6 shadow-[0_24px_60px_rgba(15,23,42,0.24)]">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-[9px] bg-surface-muted">
            <AlertTriangle size={18} className="text-warning" />
          </span>
          <div className="min-w-0">
            <h3 className="text-[15px] font-bold tracking-[-0.2px] text-ink">
              {confirmation.title}
            </h3>
          </div>
        </div>

        <div className="mt-4 flex items-stretch gap-3">
          <ComparisonCard card={confirmation.cards.current} />
          <span className="flex shrink-0 items-center text-faintest">
            <X size={16} />
          </span>
          <ComparisonCard card={confirmation.cards.incoming} />
        </div>

        <div className="mt-4 flex items-start gap-2.5 rounded-[9px] bg-surface-muted px-3.5 py-3">
          <span className="mt-px shrink-0">
            {confirmation.form === "other-hotel" ? (
              <CircleCheck size={16} className="text-brand" />
            ) : (
              <CircleX size={16} className="text-muted" />
            )}
          </span>
          <p className="text-[12.5px] leading-relaxed text-ink-soft">{confirmation.verdict}</p>
        </div>

        {confirmation.form === "no-match" && (
          <label className="mt-4 flex flex-col gap-1.5">
            <span className="text-[10.5px] font-semibold uppercase tracking-[0.5px] text-faint">
              Nombre del hotel
            </span>
            <input
              value={proposedName}
              onChange={(e) => onProposedNameChange(e.target.value)}
              className="h-[38px] rounded-[9px] border border-border bg-surface px-3 text-[13px] text-ink outline-none focus:border-brand"
            />
            {proposedNameError && (
              <span className="text-[11.5px] text-negative">{proposedNameError}</span>
            )}
          </label>
        )}

        {confirmation.replace && (
          <div className="mt-4 overflow-hidden rounded-[9px] border border-border">
            <div className="border-b border-border bg-surface-muted px-3.5 py-2 text-[10.5px] font-semibold uppercase tracking-[0.5px] text-faint">
              {confirmation.replace.heading}
            </div>
            <p className="px-3.5 py-3 text-[12.5px] leading-relaxed text-ink-soft">
              {confirmation.replace.description}
            </p>
          </div>
        )}

        <div className="mt-5 flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="h-[34px] rounded-[9px] px-3.5 text-[12.5px] font-semibold text-muted hover:bg-canvas disabled:opacity-60"
          >
            Cancelar
          </button>
          {confirmation.replace && (
            <button
              type="button"
              onClick={onReplace}
              disabled={busy}
              className="h-[34px] rounded-[9px] border border-border bg-surface px-3.5 text-[12.5px] font-semibold text-muted hover:bg-canvas disabled:opacity-60"
            >
              {confirmation.replace.label}
            </button>
          )}
          <button
            type="button"
            onClick={onPrimary}
            disabled={busy}
            className="inline-flex h-[34px] items-center gap-2 rounded-[9px] bg-brand px-3.5 text-[12.5px] font-semibold text-white hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy && <Loader2 size={14} className="animate-spin" />}
            {confirmation.primaryLabel}
          </button>
        </div>

        {confirmation.primaryHint && (
          <p className="mt-2.5 text-right text-[11.5px] text-faint">{confirmation.primaryHint}</p>
        )}
      </div>
    </div>
  );
}
