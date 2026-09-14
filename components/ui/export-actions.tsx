"use client";

import {
  ChevronDown,
  Download,
  FileSpreadsheet,
  Loader2,
  Upload,
  X,
  type LucideIcon,
} from "lucide-react";
import { type ReactNode, useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import { DisabledReasonPill } from "@/components/ui/disabled-reason-pill";
import { InfoTip } from "@/components/ui/info-tip";
import { cn } from "@/lib/cn";

/**
 * The file actions of ANY module — upload, the «Exportar» menu and the accepted-files info tip. It
 * is deliberately domain-agnostic: it imports no providers, no modals and no export layers, so a new
 * module only writes the wrapper that passes it what «Cargar» opens, what «Exportar» offers and what
 * the `ⓘ` says.
 *
 * The menu does not know what FORMAT an option is. An Excel is GENERATED —its `run` returns a
 * promise, and the progress and the error of generating live here because they are the same
 * everywhere— and a PDF report is OPENED —its `run` returns nothing, and the wrapper mounts the
 * preview with its own state. Both are entries of the same menu, which is what lets every module's
 * header read «Cargar Excel · Exportar ▾ · ⓘ» and nothing else.
 *
 * It is ALWAYS a menu named «Exportar», even with a single option: the shape used to be derived from
 * the count (one → a plain button), and that made the control change its look the day a module
 * gained its second output. With no options at all it draws nothing — a control that means nothing
 * for the open data does not render disabled.
 */

export interface ExportOption {
  id: string;
  title: string;
  description: string;
  /** The menu item's icon — the component, not the node: the size is set by whoever renders it. */
  icon?: LucideIcon;
  iconClassName?: string;
  disabled?: boolean;
  /** Why it cannot be done; offered as help text on pointing at the entry. */
  disabledReason?: string;
  /**
   * Builds the file and hands it to the browser (a promise: rejecting is how it reports failure),
   * or opens a layer (nothing to wait for: the menu closes at once).
   */
  run: () => void | Promise<void>;
}

interface ExportActionsProps {
  /**
   * OPTIONAL, because a module that only EXPORTS is a real case: «Reportería de ingresos» derives
   * its figures from PyG and types the rest into a drawer, so it has nothing to upload. Left out, no
   * upload button is drawn at all.
   */
  upload?: {
    label?: string;
    onClick: () => void;
    disabled?: boolean;
    /**
     * Why uploading is not possible. Unlike the exports, this does NOT go in a tooltip: it renders
     * as a pill beside the button. A disabled control with no visible reason forces you to point at
     * it to find out what is missing, and what is missing here is the previous step of the whole
     * module.
     */
    disabledReason?: string;
  };
  exports: ExportOption[];
  info?: { title?: string; children: ReactNode };
}

export function ExportActions({ upload, exports, info }: ExportActionsProps) {
  return (
    <div className="flex items-center gap-2.5">
      {upload && (
        <>
          {upload.disabled && upload.disabledReason && (
            <DisabledReasonPill>{upload.disabledReason}</DisabledReasonPill>
          )}
          <Button
            size="toolbar"
            icon={<Upload size={14} />}
            onClick={upload.onClick}
            disabled={upload.disabled}
          >
            {upload.label ?? "Cargar Excel"}
          </Button>
        </>
      )}

      {exports.length > 0 && <ExportMenu options={exports} />}

      {info && (
        <InfoTip label="¿Qué archivos acepta?" title={info.title}>
          {info.children}
        </InfoTip>
      )}
    </div>
  );
}

const MENU_WIDTH = 308;

function ExportMenu({ options }: { options: ExportOption[] }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  const run = useCallback(
    async (option: ExportOption) => {
      if (busy || option.disabled) {
        return;
      }
      setBusy(option.id);
      setFailed(false);
      try {
        // A `void` run resolves in the same microtask: React batches the two `setBusy` and no
        // spinner frame is painted for an option that only opens a layer.
        await option.run();
      } catch {
        setFailed(true);
      } finally {
        setBusy(null);
        // The menu closes whatever happens: the failure is reported below, under the trigger.
        setOpen(false);
      }
    },
    [busy],
  );

  return (
    <div className="relative">
      {open && (
        <button
          type="button"
          aria-label="Cerrar menú"
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-20 cursor-default"
        />
      )}

      <Button
        size="toolbar"
        variant="secondary"
        aria-haspopup="menu"
        aria-expanded={open}
        className="relative z-30"
        icon={
          busy !== null ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />
        }
        trailingIcon={
          <ChevronDown size={14} className={cn("transition-transform", open && "rotate-180")} />
        }
        onClick={() => setOpen((value) => !value)}
      >
        Exportar
      </Button>

      {open && (
        <div
          role="menu"
          style={{ width: MENU_WIDTH }}
          className="absolute right-0 top-[calc(100%+8px)] z-30 rounded-xl border border-border bg-surface p-[7px] shadow-[0_14px_36px_rgba(15,23,42,0.16)]"
        >
          {options.map((option) => (
            <button
              key={option.id}
              type="button"
              role="menuitem"
              disabled={option.disabled || busy !== null}
              title={option.disabled ? option.disabledReason : undefined}
              onClick={() => void run(option)}
              className="flex w-full items-start gap-2.5 rounded-[9px] px-[11px] py-2.5 text-left transition-colors hover:bg-canvas disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent"
            >
              <span className="mt-px shrink-0">
                <OptionIcon option={option} busy={busy === option.id} />
              </span>
              <span className="flex flex-col gap-0.5">
                <span className="text-[13px] font-semibold text-ink">{option.title}</span>
                <span className="text-[11.5px] leading-snug text-faint">{option.description}</span>
              </span>
            </button>
          ))}
        </div>
      )}

      {failed && (
        <div
          role="alert"
          style={{ width: MENU_WIDTH }}
          className="absolute right-0 top-[calc(100%+8px)] z-30 flex items-start gap-2 rounded-xl border border-border bg-surface px-[11px] py-2.5 shadow-[0_14px_36px_rgba(15,23,42,0.16)]"
        >
          <span className="flex-1 text-[11.5px] leading-snug text-negative">
            No se pudo generar el archivo. Intenta de nuevo.
          </span>
          <button
            type="button"
            aria-label="Descartar el aviso"
            onClick={() => setFailed(false)}
            className="mt-px shrink-0 text-faint transition-colors hover:text-muted"
          >
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  );
}

/** A menu item's icon, or the spinner while that option runs. */
function OptionIcon({ option, busy }: { option: ExportOption; busy: boolean }) {
  if (busy) {
    return <Loader2 size={17} className="animate-spin text-brand" />;
  }
  const Icon = option.icon ?? FileSpreadsheet;
  return <Icon size={17} className={option.iconClassName} />;
}
