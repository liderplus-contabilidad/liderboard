"use client";

import { ChevronDown, FileSpreadsheet, Loader2, Upload, X, type LucideIcon } from "lucide-react";
import { type ReactNode, useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import { DisabledReasonPill } from "@/components/ui/disabled-reason-pill";
import { InfoTip } from "@/components/ui/info-tip";
import { cn } from "@/lib/cn";

/**
 * The Excel actions of ANY module — upload, download and the accepted-files info tip. It is
 * deliberately domain-agnostic: it imports no providers, no modals and no export layers, so a new
 * module only writes the wrapper that passes it what «Cargar» opens, what «Descargar» generates and
 * what the `ⓘ` says.
 *
 * The SHAPE of the download control is derived from how many options it receives (one → a plain
 * button, two or more → a menu); no module declares it. The generation's progress and error live
 * here, because they are the same everywhere: the module only supplies a promise.
 */

export interface ExcelDownloadOption {
  id: string;
  /** The menu item's title. With a single option it is not shown: the button says `downloadLabel`. */
  title: string;
  description: string;
  /** The menu item's icon — the component, not the node: the size is set by whoever renders it. */
  icon?: LucideIcon;
  iconClassName?: string;
  disabled?: boolean;
  /** Why it cannot be done; offered as help text on pointing at the control. */
  disabledReason?: string;
  /** Builds the file and hands it to the browser. Rejecting is how it reports failure. */
  run: () => Promise<void>;
}

interface ExcelActionsProps {
  upload: {
    label?: string;
    onClick: () => void;
    disabled?: boolean;
    /**
     * Why uploading is not possible. Unlike the downloads, this does NOT go in a tooltip: it renders
     * as a pill beside the button. A disabled control with no visible reason forces you to point at
     * it to find out what is missing, and what is missing here is the previous step of the whole
     * module.
     */
    disabledReason?: string;
  };
  downloads: ExcelDownloadOption[];
  downloadLabel?: string;
  info?: { title?: string; children: ReactNode };
}

export function ExcelActions({
  upload,
  downloads,
  downloadLabel = "Descargar Excel",
  info,
}: ExcelActionsProps) {
  return (
    <div className="flex items-center gap-2.5">
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

      {downloads.length > 0 && <DownloadControl options={downloads} label={downloadLabel} />}

      {info && (
        <InfoTip label="¿Qué archivos acepta?" title={info.title}>
          {info.children}
        </InfoTip>
      )}
    </div>
  );
}

const MENU_WIDTH = 308;

function DownloadControl({ options, label }: { options: ExcelDownloadOption[]; label: string }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  const run = useCallback(
    async (option: ExcelDownloadOption) => {
      if (busy || option.disabled) {
        return;
      }
      setBusy(option.id);
      setFailed(false);
      try {
        await option.run();
      } catch {
        setFailed(true);
      } finally {
        setBusy(null);
        // The menu closes whatever happens: the failure is reported below, where it looks the same
        // whether it came from the menu or from the plain button.
        setOpen(false);
      }
    },
    [busy],
  );

  const single = options.length === 1 ? options[0] : undefined;

  return (
    // The title goes on the container: a disabled button does not fire the browser's tooltip.
    <div className="relative" title={single?.disabled ? single.disabledReason : undefined}>
      {open && (
        <button
          type="button"
          aria-label="Cerrar menú"
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-20 cursor-default"
        />
      )}

      {single ? (
        <Button
          size="toolbar"
          variant="secondary"
          disabled={single.disabled || busy !== null}
          icon={<ControlIcon busy={busy !== null} />}
          onClick={() => void run(single)}
        >
          {busy === single.id ? "Generando…" : label}
        </Button>
      ) : (
        <Button
          size="toolbar"
          variant="secondary"
          aria-haspopup="menu"
          aria-expanded={open}
          className="relative z-30"
          icon={<ControlIcon busy={busy !== null} />}
          trailingIcon={
            <ChevronDown size={14} className={cn("transition-transform", open && "rotate-180")} />
          }
          onClick={() => setOpen((value) => !value)}
        >
          {label}
        </Button>
      )}

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
            No se pudo generar el Excel. Intenta de nuevo.
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

/** The control's icon, whether it is a plain button or a menu trigger. */
function ControlIcon({ busy }: { busy: boolean }) {
  return busy ? <Loader2 size={14} className="animate-spin" /> : <FileSpreadsheet size={14} />;
}

/** A menu item's icon, or the spinner while that option runs. */
function OptionIcon({ option, busy }: { option: ExcelDownloadOption; busy: boolean }) {
  if (busy) {
    return <Loader2 size={17} className="animate-spin text-brand" />;
  }
  const Icon = option.icon ?? FileSpreadsheet;
  return <Icon size={17} className={option.iconClassName} />;
}
