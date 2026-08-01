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
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ComparisonCard } from "@/components/ui/comparison-card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { NoticeBanner } from "@/components/ui/notice-banner";
import { cn } from "@/lib/cn";
import { MONTHS_FULL_ES } from "@/lib/date";
import {
  findClientForIdentity,
  normalizeClientName,
  proposeClientName,
  findClientByName,
} from "@/lib/profit-loss/clients";
import type { ReloadConflict } from "@/lib/profit-loss/conflicts";
import { countEditsForYears, getCellEdit, saveCellEdit } from "@/lib/profit-loss/db";
import { PygParseError } from "@/lib/profit-loss/errors";
import type { ParsedDataset } from "@/lib/profit-loss/types";
import { validateBatch } from "@/lib/profit-loss/upload/batch";
import type { StagedUpload } from "@/lib/profit-loss/upload/types";
import type { BuiltWorkspace } from "@/lib/profit-loss/workspace";
import {
  compareIdentity,
  describeIdentityChange,
  type IdentityMismatchReason,
  type WorkspaceIdentity,
} from "@/lib/profit-loss/workspace-identity";
import { usePygData } from "./pyg-data-provider";

interface StagedFile {
  fileName: string;
  staged?: StagedUpload;
  badge: string;
  error?: string;
}

interface UploadSummary {
  mode: "single" | "centers";
  /** Coverage per year — the summary names each year and the months it now holds. */
  loadedMonthsByYear: Record<number, number[]>;
  /** The years this upload brought, ascending; the rest of the workspace is not re-announced. */
  years: number[];
  centersCount: number;
  accountsCount: number;
  warnings: string[];
  conflicts: ReloadConflict[];
}

function describe(staged: StagedUpload): string {
  if (staged.kind === "month-slice") {
    const month = MONTHS_FULL_ES[staged.month] ?? `mes ${staged.month + 1}`;
    const label = staged.mode === "single" ? "Estado único" : "Mensual por centros";
    return `${label} · ${month} ${staged.year}`;
  }
  const isSingle = staged.datasets.length === 1 && staged.datasets[0].role === "single";
  return isSingle ? "Excel con tus datos (estado único)" : "Excel completo de la app";
}

/** Every distinct `kind` staged so far — a valid batch has exactly one. */
function stagedKinds(files: StagedFile[]): StagedUpload["kind"][] {
  return [
    ...new Set(files.filter((f) => f.staged).map((f) => f.staged?.kind as StagedUpload["kind"])),
  ];
}

/**
 * Staging modal for PyG's Excel uploads, resolved through the strategy registry: each dropped
 * file is parsed on the spot (its badge names the format and, for a month slice, the period and
 * mode), or shows its own concrete error. Month slices (either mode) are validated and merged as
 * ONE batch; an "Excel completo" file merges by year into the open client.
 *
 * A batch whose identity (sistema, empresa, modo) contradicts the ACTIVE CLIENT's opens the clash
 * dialog, which has three exits rather than the old two — and which one is the RIGHT one depends
 * on something this modal has to look up: whether another client already holds that identity. If
 * one does, the file belongs there and loading there destroys nothing; if none does, creating a
 * client is the recommendation and replacing the open one is the escape hatch for «se renombró o
 * cambió de sistema». See `pyg-single-monthly-upload`'s "Identidad del workspace" and
 * `pyg-clients`.
 */
export function CostCenterUploadModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const {
    clients,
    activeClientId,
    activeClient,
    commitWorkspace,
    commitMonthlyBatch,
    replaceMonthlyWorkspace,
    createClientWithBatch,
    commitBatchIntoClient,
    workspaceIdentity,
  } = usePygData();
  const [files, setFiles] = useState<StagedFile[]>([]);
  const [batchError, setBatchError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const [confirmReplaceYears, setConfirmReplaceYears] = useState<{
    years: number[];
    editCount: number;
  } | null>(null);
  const [confirmIdentityChange, setConfirmIdentityChange] = useState<{
    current: WorkspaceIdentity;
    incoming: WorkspaceIdentity;
    reasons: IdentityMismatchReason[];
    fileName: string;
    /** The client that already holds the incoming identity — 6A — or `null` for 6B. */
    matching: { id: string; name: string } | null;
  } | null>(null);
  /** 6B's editable proposal. The name comes from the file's razón social but stays the user's. */
  const [newClientName, setNewClientName] = useState("");
  const [newClientError, setNewClientError] = useState<string | null>(null);
  const [summary, setSummary] = useState<UploadSummary | null>(null);

  // Reset everything once the modal is closed, so it never reopens on stale state.
  useEffect(() => {
    if (!open) {
      setConfirmReplaceYears(null);
      setConfirmIdentityChange(null);
      setNewClientName("");
      setNewClientError(null);
      setSummary(null);
      setFiles([]);
      setBatchError(null);
    }
  }, [open]);

  const addFiles = useCallback(async (list: FileList | null) => {
    // Materialized BEFORE the first await: the caller clears `input.value` right after, which
    // empties the live FileList.
    const picked = list ? Array.from(list) : [];
    if (picked.length === 0) {
      return;
    }
    // Dynamic import keeps SheetJS out of the initial bundle.
    const { resolveUpload } = await import("@/lib/profit-loss/upload/registry");
    const staged = await Promise.all(
      picked.map(async (file): Promise<StagedFile> => {
        try {
          const buffer = await file.arrayBuffer();
          const result = resolveUpload(file.name, buffer);
          return { fileName: file.name, staged: result, badge: describe(result) };
        } catch (error) {
          return {
            fileName: file.name,
            badge: "No válido",
            error:
              error instanceof PygParseError
                ? error.message
                : "No se pudo leer el archivo (¿es un Excel válido?).",
          };
        }
      }),
    );
    setFiles((prev) => [...prev, ...staged]);
  }, []);

  const validFiles = useMemo(() => files.filter((f) => f.staged), [files]);
  const kinds = useMemo(() => stagedKinds(files), [files]);
  const kind = kinds.length === 1 ? kinds[0] : undefined;
  const monthSlices = useMemo(
    () =>
      kind === "month-slice"
        ? (validFiles.map((f) => f.staged) as Extract<StagedUpload, { kind: "month-slice" }>[])
        : [],
    [kind, validFiles],
  );

  // Set-level validation (single year, no duplicate month) — checked before the load button
  // ever enables, so a mistake in the batch never reaches the write path.
  useEffect(() => {
    if (monthSlices.length === 0) {
      setBatchError(null);
      return;
    }
    try {
      validateBatch(monthSlices);
      setBatchError(null);
    } catch (error) {
      setBatchError(error instanceof PygParseError ? error.message : "Lote inválido.");
    }
  }, [monthSlices]);

  const mixedKindsError =
    kinds.length > 1
      ? "No se puede cargar un Excel completo junto con archivos mensuales; quita uno de los dos grupos."
      : null;

  const finishWithMonthlyOutcome = useCallback(
    (
      mode: "single" | "centers",
      outcome: {
        datasets: ParsedDataset[];
        loadedMonthsByYear: Record<number, number[]>;
        years: number[];
        warnings: string[];
      },
      conflicts: ReloadConflict[] = [],
    ) => {
      const accountsCount = outcome.datasets[0]?.accounts.length ?? 0;
      // Centers are counted per year, so a two-year batch would otherwise report double.
      const centersCount = new Set(
        outcome.datasets.map((dataset) => dataset.centerId ?? dataset.id),
      ).size;
      setSummary({
        mode,
        loadedMonthsByYear: outcome.loadedMonthsByYear,
        years: outcome.years,
        centersCount,
        accountsCount,
        warnings: outcome.warnings,
        conflicts,
      });
      setFiles([]);
    },
    [],
  );

  const runMonthlyCommit = useCallback(async () => {
    setBusy(true);
    try {
      const outcome = await commitMonthlyBatch(monthSlices);
      finishWithMonthlyOutcome(monthSlices[0]?.mode ?? "centers", outcome, outcome.conflicts);
    } finally {
      setBusy(false);
    }
  }, [commitMonthlyBatch, monthSlices, finishWithMonthlyOutcome]);

  /** 6B's secondary exit: replace the OPEN client. The only destructive one of the three. */
  const runIdentityChangeReplace = useCallback(async () => {
    setBusy(true);
    try {
      const outcome = await replaceMonthlyWorkspace(monthSlices);
      finishWithMonthlyOutcome(monthSlices[0]?.mode ?? "centers", outcome);
    } finally {
      setBusy(false);
      setConfirmIdentityChange(null);
    }
  }, [replaceMonthlyWorkspace, monthSlices, finishWithMonthlyOutcome]);

  /** 6A's primary exit: load into the client that DOES match, which becomes the active one. */
  const runLoadIntoMatchingClient = useCallback(async () => {
    const matching = confirmIdentityChange?.matching;
    if (!matching) {
      return;
    }
    setBusy(true);
    try {
      const outcome = await commitBatchIntoClient(matching.id, monthSlices);
      finishWithMonthlyOutcome(monthSlices[0]?.mode ?? "centers", outcome);
    } finally {
      setBusy(false);
      setConfirmIdentityChange(null);
    }
  }, [commitBatchIntoClient, confirmIdentityChange, monthSlices, finishWithMonthlyOutcome]);

  /** 6B's primary exit: create the client the file belongs to and load it there. */
  const runCreateClientAndLoad = useCallback(async () => {
    const check = normalizeClientName(newClientName);
    if (!check.ok) {
      setNewClientError(check.message);
      return;
    }
    const taken = findClientByName(check.name, clients);
    if (taken) {
      setNewClientError(`Ya existe un cliente llamado «${taken.name}».`);
      return;
    }
    setBusy(true);
    try {
      const outcome = await createClientWithBatch(check.name, monthSlices);
      finishWithMonthlyOutcome(monthSlices[0]?.mode ?? "centers", outcome);
    } finally {
      setBusy(false);
      setConfirmIdentityChange(null);
    }
  }, [createClientWithBatch, clients, newClientName, monthSlices, finishWithMonthlyOutcome]);

  /** «Elegir otro archivo»: nothing is written, the staged files are dropped and the picker
   * reopens — the exit for «me equivoqué de archivo», which is most of the time. */
  const chooseAnotherFile = useCallback(() => {
    setConfirmIdentityChange(null);
    setFiles([]);
    inputRef.current?.click();
  }, []);

  const runReplaceWorkspace = useCallback(
    async (built: BuiltWorkspace) => {
      setBusy(true);
      try {
        await commitWorkspace(built);
        onClose();
        setFiles([]);
      } finally {
        setBusy(false);
        setConfirmReplaceYears(null);
      }
    },
    [commitWorkspace, onClose],
  );

  // "Excel completo de la app" — reconstructs the whole workspace via its hidden metadata sheet.
  // A single-dataset, role:"single" reconstruction is a single-mode workspace; anything else is
  // the by-centers one.
  const workspaceBuilt: BuiltWorkspace | null = (() => {
    const staged = validFiles[0]?.staged;
    if (!staged || staged.kind !== "workspace") {
      return null;
    }
    return {
      mode:
        staged.datasets.length === 1 && staged.datasets[0].role === "single" ? "single" : "multi",
      datasets: staged.datasets,
      commentsByDataset: staged.commentsByDataset,
      meta: staged.meta,
    };
  })();

  const commit = useCallback(async () => {
    if (busy) {
      return;
    }
    if (kind === "month-slice") {
      if (monthSlices.length === 0 || batchError) {
        return;
      }
      const incoming = monthSlices[0];
      const incomingIdentity: WorkspaceIdentity = {
        system: incoming.system,
        companyName: incoming.companyName,
        mode: incoming.mode,
      };
      const reasons = workspaceIdentity ? compareIdentity(workspaceIdentity, incomingIdentity) : [];
      if (workspaceIdentity && reasons.length > 0) {
        // Which form the dialog takes is decided HERE, by whether another client already holds
        // the incoming identity — not by the copy, and not by the user.
        const matching = findClientForIdentity(
          clients.filter((client) => client.id !== activeClientId),
          Object.fromEntries(clients.map((client) => [client.id, client.identity])),
          incomingIdentity,
        );
        setNewClientName(proposeClientName(incomingIdentity.companyName, clients));
        setNewClientError(null);
        setConfirmIdentityChange({
          current: workspaceIdentity,
          incoming: incomingIdentity,
          reasons,
          fileName: validFiles[0]?.fileName ?? "",
          matching: matching && { id: matching.id, name: matching.name },
        });
        return;
      }
      await runMonthlyCommit();
      return;
    }
    if (!workspaceBuilt || !activeClientId) {
      return;
    }
    // The confirmation is about the years the file REPLACES — the ones it omits survive, so
    // asking about "the whole workspace" would overstate what is at stake.
    setBusy(true);
    const replacedYears = [...new Set(workspaceBuilt.datasets.map((d) => d.year))].sort(
      (a, b) => a - b,
    );
    const editCount = await countEditsForYears(activeClientId, replacedYears);
    setBusy(false);
    if (editCount > 0) {
      setConfirmReplaceYears({ years: replacedYears, editCount });
      return;
    }
    await runReplaceWorkspace(workspaceBuilt);
  }, [
    busy,
    kind,
    monthSlices,
    batchError,
    workspaceIdentity,
    clients,
    activeClientId,
    validFiles,
    runMonthlyCommit,
    workspaceBuilt,
    runReplaceWorkspace,
  ]);

  const identityChangeConfirmation = useMemo(
    () =>
      confirmIdentityChange
        ? describeIdentityChange(
            confirmIdentityChange.current,
            confirmIdentityChange.incoming,
            confirmIdentityChange.reasons,
            {
              activeClientName: activeClient?.name ?? "el cliente abierto",
              matchingClientName: confirmIdentityChange.matching?.name ?? null,
              proposedClientName: newClientName,
              activeClientContents: describeContents(activeClient),
            },
          )
        : null,
    [confirmIdentityChange, activeClient, newClientName],
  );

  const removeAdjustment = useCallback(async (conflict: ReloadConflict) => {
    const existing = await getCellEdit(conflict.datasetId, conflict.code, conflict.monthIndex);
    await saveCellEdit({
      datasetId: conflict.datasetId,
      code: conflict.code,
      monthIndex: conflict.monthIndex,
      ...(existing?.comment ? { comment: existing.comment } : {}),
    });
    setSummary((prev) =>
      prev
        ? {
            ...prev,
            conflicts: prev.conflicts.filter(
              (c) =>
                !(
                  c.datasetId === conflict.datasetId &&
                  c.code === conflict.code &&
                  c.monthIndex === conflict.monthIndex
                ),
            ),
          }
        : prev,
    );
  }, []);

  if (!open) {
    return null;
  }

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-6">
        <div className="w-full max-w-[560px] rounded-2xl border border-border bg-surface shadow-[0_24px_60px_rgba(15,23,42,0.24)]">
          <header className="flex items-center justify-between border-b border-border px-5 py-3.5">
            <h2 className="text-sm font-semibold text-ink">
              {summary ? "Carga completa" : "Cargar Excel"}
            </h2>
            <button
              type="button"
              aria-label="Cerrar"
              onClick={onClose}
              className="text-faint hover:text-ink"
            >
              <X size={18} />
            </button>
          </header>

          {summary ? (
            <SummaryPanel summary={summary} onRemoveAdjustment={removeAdjustment} />
          ) : (
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
                  Un mes por centros de costo (PyG-AAAA-MM-…), un mes de estado único (con su rango
                  de fechas), o el Excel completo de la app (.xls / .xlsx)
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

              {mixedKindsError && <NoticeBanner className="mt-3">{mixedKindsError}</NoticeBanner>}
              {!mixedKindsError && batchError && (
                <NoticeBanner className="mt-3">{batchError}</NoticeBanner>
              )}
            </div>
          )}

          <footer className="flex items-center justify-end gap-2.5 border-t border-border px-5 py-3.5">
            {summary ? (
              <button
                type="button"
                onClick={onClose}
                className="h-[34px] rounded-[8px] bg-brand px-3.5 text-[12.5px] font-semibold text-white hover:bg-brand-hover"
              >
                Cerrar
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={onClose}
                  className="h-[34px] rounded-[8px] border border-border bg-surface px-3.5 text-[12.5px] font-semibold text-muted hover:bg-canvas"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={
                    validFiles.length === 0 ||
                    busy ||
                    Boolean(batchError) ||
                    Boolean(mixedKindsError)
                  }
                  onClick={() => void commit()}
                  className="inline-flex h-[34px] items-center gap-2 rounded-[8px] bg-brand px-3.5 text-[12.5px] font-semibold text-white hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {busy && <Loader2 size={14} className="animate-spin" />}
                  Cargar{" "}
                  {validFiles.length > 0
                    ? `${validFiles.length} archivo${validFiles.length === 1 ? "" : "s"}`
                    : ""}
                </button>
              </>
            )}
          </footer>
        </div>
      </div>

      <ConfirmDialog
        open={confirmReplaceYears !== null}
        variant="destructive"
        busy={busy}
        title={`Reemplazar ${confirmReplaceYears?.years.join(", ") ?? ""}`}
        description={
          `Cargar reemplaza ${confirmReplaceYears?.years.join(" y ") ?? ""} y descarta ` +
          `${confirmReplaceYears?.editCount ?? 0} ajuste(s) y comentario(s) de ` +
          `${(confirmReplaceYears?.years.length ?? 0) === 1 ? "ese año" : "esos años"}. ` +
          `Los demás años quedan intactos. ¿Continuar?`
        }
        confirmLabel="Cargar"
        cancelLabel="Cancelar"
        onConfirm={() => {
          if (workspaceBuilt) {
            void runReplaceWorkspace(workspaceBuilt);
          }
        }}
        onCancel={() => setConfirmReplaceYears(null)}
      />

      {identityChangeConfirmation && confirmIdentityChange && (
        <IdentityClashDialog
          confirmation={identityChangeConfirmation}
          fileName={confirmIdentityChange.fileName}
          busy={busy}
          proposedName={newClientName}
          proposedNameError={newClientError}
          onProposedNameChange={(name) => {
            setNewClientName(name);
            setNewClientError(null);
          }}
          onCancel={() => setConfirmIdentityChange(null)}
          onChooseAnotherFile={chooseAnotherFile}
          onPrimary={() =>
            void (confirmIdentityChange.matching
              ? runLoadIntoMatchingClient()
              : runCreateClientAndLoad())
          }
          onReplace={() => void runIdentityChangeReplace()}
        />
      )}
    </>
  );
}

/** Los años y centros del cliente abierto en una frase — lo que el bloque de reemplazo descarta. */
function describeContents(client: { years: number[]; identity: unknown } | undefined): string {
  const years = client?.years ?? [];
  if (years.length === 0) {
    return "sin datos cargados";
  }
  return years.length === 1 ? `${years[0]}` : `${years[0]}–${years[years.length - 1]}`;
}

/**
 * El diálogo de choque, en sus dos formas. Rinde lo que `describeIdentityChange` decidió: la copia
 * y qué acción es la principal viven en `lib/`, y esto solo las pone en pantalla. Las tarjetas
 * comparan empresa y sistema — nunca un NIT, que ninguna estrategia extrae.
 */
function IdentityClashDialog({
  confirmation,
  fileName,
  busy,
  proposedName,
  proposedNameError,
  onProposedNameChange,
  onCancel,
  onChooseAnotherFile,
  onPrimary,
  onReplace,
}: {
  confirmation: NonNullable<ReturnType<typeof describeIdentityChange>>;
  fileName: string;
  busy: boolean;
  proposedName: string;
  proposedNameError: string | null;
  onProposedNameChange: (name: string) => void;
  onCancel: () => void;
  onChooseAnotherFile: () => void;
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
            {fileName && (
              <p className="mt-0.5 truncate font-mono text-[12px] text-faint">{fileName}</p>
            )}
          </div>
        </div>

        <div className="mt-4 flex items-stretch gap-3">
          <ComparisonCard card={confirmation.cards.current} monoDetail />
          <span className="flex shrink-0 items-center text-faintest">
            <X size={16} />
          </span>
          <ComparisonCard card={confirmation.cards.incoming} monoDetail />
        </div>

        <div className="mt-4 flex items-start gap-2.5 rounded-[9px] bg-surface-muted px-3.5 py-3">
          <span className="mt-px shrink-0">
            {confirmation.form === "other-client" ? (
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
              Nombre del cliente
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
          <button
            type="button"
            onClick={confirmation.replace ? onReplace : onChooseAnotherFile}
            disabled={busy}
            className="h-[34px] rounded-[9px] border border-border bg-surface px-3.5 text-[12.5px] font-semibold text-muted hover:bg-canvas disabled:opacity-60"
          >
            {confirmation.replace ? confirmation.replace.label : "Elegir otro archivo"}
          </button>
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

        {/* «Elegir otro archivo» no cabe en la fila de 6B, que ya lleva tres botones: va debajo,
            junto a lo que la acción principal implica. */}
        <div className="mt-2.5 flex items-center justify-between gap-3">
          {confirmation.replace ? (
            <button
              type="button"
              onClick={onChooseAnotherFile}
              disabled={busy}
              className="text-[11.5px] font-semibold text-brand hover:underline disabled:opacity-60"
            >
              Elegir otro archivo
            </button>
          ) : (
            <span />
          )}
          {confirmation.primaryHint && (
            <p className="text-right text-[11.5px] text-faint">{confirmation.primaryHint}</p>
          )}
        </div>
      </div>
    </div>
  );
}

function SummaryPanel({
  summary,
  onRemoveAdjustment,
}: {
  summary: UploadSummary;
  onRemoveAdjustment: (conflict: ReloadConflict) => void;
}) {
  // Grouped by year: with two years loaded, one flat list of month names could not say which
  // «marzo» it meant.
  const byYear = summary.years.map((year) => {
    const months = (summary.loadedMonthsByYear[year] ?? []).map(
      (m) => MONTHS_FULL_ES[m] ?? `mes ${m + 1}`,
    );
    return `${year}: ${months.join(", ") || "ninguno"}`;
  });
  return (
    <div className="flex flex-col gap-3 p-5">
      <p className="text-[13px] text-ink-soft">
        Meses cargados — {byYear.join(" · ") || "ninguno"}.{" "}
        {summary.mode === "centers" && (
          <>
            {summary.centersCount} centro{summary.centersCount === 1 ? "" : "s"},{" "}
          </>
        )}
        {summary.accountsCount} cuenta{summary.accountsCount === 1 ? "" : "s"}.
      </p>
      {summary.warnings.length > 0 && (
        <NoticeBanner details={summary.warnings}>
          {summary.warnings.length} aviso{summary.warnings.length === 1 ? "" : "s"} de la carga.
        </NoticeBanner>
      )}
      {summary.conflicts.length > 0 && (
        <div className="rounded-lg border border-border">
          <div className="border-b border-border px-3 py-2 text-[12px] font-semibold text-ink">
            {summary.conflicts.length} ajuste{summary.conflicts.length === 1 ? "" : "s"} sobre un
            valor que cambió
          </div>
          <ul className="flex flex-col divide-y divide-border-soft">
            {summary.conflicts.map((conflict, i) => (
              <li
                key={`${conflict.datasetId}-${conflict.code}-${conflict.monthIndex}-${i}`}
                className="flex items-start gap-2.5 px-3 py-2 text-[12px] text-ink-soft"
              >
                <span className="min-w-0 flex-1">
                  <span className="font-semibold text-ink">{conflict.centerName}</span> ·{" "}
                  {conflict.code} {conflict.accountName} (
                  {MONTHS_FULL_ES[conflict.monthIndex] ?? conflict.monthIndex + 1} de{" "}
                  {conflict.year}): el archivo cambió de {conflict.previousFileValue} a{" "}
                  {conflict.newFileValue}, el ajuste sigue en {conflict.adjustmentValue}.
                </span>
                <button
                  type="button"
                  onClick={() => onRemoveAdjustment(conflict)}
                  className="shrink-0 text-[11.5px] font-semibold text-brand hover:underline"
                >
                  Quitar ajuste
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
