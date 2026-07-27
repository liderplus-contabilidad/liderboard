"use client";

import { ChevronDown, FileSpreadsheet, Loader2, Upload, X, type LucideIcon } from "lucide-react";
import { type ReactNode, useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import { InfoTip } from "@/components/ui/info-tip";
import { cn } from "@/lib/cn";

/**
 * Las acciones de Excel de CUALQUIER módulo — cargar, descargar y el info tip de archivos
 * aceptados. Es deliberadamente agnóstico del dominio: no importa proveedores, modales ni capas
 * de exportación, así que un módulo nuevo solo escribe el envoltorio que le pasa qué abre
 * «Cargar», qué genera «Descargar» y qué dice el `ⓘ`.
 *
 * La FORMA del control de descarga se deriva de cuántas opciones reciba (una → botón plano,
 * dos o más → menú); ningún módulo la declara. El progreso y el error de la generación viven
 * aquí, porque son los mismos en todos lados: el módulo solo aporta una promesa.
 */

export interface ExcelDownloadOption {
  id: string;
  /** Título del ítem de menú. Con una sola opción no se muestra: el botón dice `downloadLabel`. */
  title: string;
  description: string;
  /** Icono del ítem de menú — el componente, no el nodo: el tamaño lo pone quien lo rinde. */
  icon?: LucideIcon;
  iconClassName?: string;
  disabled?: boolean;
  /** Por qué no se puede; se ofrece como texto de ayuda al apuntar el control. */
  disabledReason?: string;
  /** Construye el archivo y lo entrega al navegador. Rechazar es cómo reporta el fallo. */
  run: () => Promise<void>;
}

interface ExcelActionsProps {
  upload: { label?: string; onClick: () => void; disabled?: boolean };
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
        // El menú se cierra pase lo que pase: el fallo se cuenta abajo, donde se ve igual
        // venga del menú o del botón plano.
        setOpen(false);
      }
    },
    [busy],
  );

  const single = options.length === 1 ? options[0] : undefined;

  return (
    // El título va en el contenedor: un botón deshabilitado no dispara el tooltip del navegador.
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

/** El icono del control, igual sea botón plano o disparador de menú. */
function ControlIcon({ busy }: { busy: boolean }) {
  return busy ? <Loader2 size={14} className="animate-spin" /> : <FileSpreadsheet size={14} />;
}

/** El icono de un ítem de menú, o el spinner mientras esa opción corre. */
function OptionIcon({ option, busy }: { option: ExcelDownloadOption; busy: boolean }) {
  if (busy) {
    return <Loader2 size={17} className="animate-spin text-brand" />;
  }
  const Icon = option.icon ?? FileSpreadsheet;
  return <Icon size={17} className={option.iconClassName} />;
}
