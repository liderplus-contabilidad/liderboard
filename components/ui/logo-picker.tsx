"use client";

import { ImagePlus, Trash2 } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { LogoFileError, readLogoFile } from "@/lib/logo-file";
import { formatBytes, LOGO_ACCEPT_ATTRIBUTE, LOGO_MAX_BYTES, type EntityLogo } from "@/lib/logos";

/**
 * The control that uploads a workspace's LOGO: preview, «Cambiar» and «Quitar».
 *
 * It is a primitive and not a piece of the name dialog because the same thing holds for PyG's client,
 * Rol de Pagos' and Ocupaciones' hotel — the three share that dialog, and any other place that wants
 * to ask for an identity image wants exactly this.
 *
 * **The size limit is announced BEFORE it fails.** The help line states the maximum from the first
 * render, so the rejection confirms a rule that was already in sight instead of introducing one:
 * learning the cap only on hitting it forces a second trip to the file browser.
 *
 * The preview is drawn over a faint chequerboard because almost every logo arrives with a
 * TRANSPARENT background, and over white a white logo would look as though it had not been uploaded.
 */
/**
 * Read the file, with its rejection already worded. The workspace picker and each center's share it:
 * they are two forms of the same control, and a second copy of «what is done with the file» could
 * accept in one what the other rejects.
 */
function useLogoUpload(onChange: (logo: EntityLogo | null) => void) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const pick = useCallback(
    async (file: File | undefined) => {
      if (!file) {
        return;
      }
      setError(null);
      setBusy(true);
      try {
        onChange(await readLogoFile(file));
      } catch (cause) {
        // A foreseen rejection (type, size, unreadable file) already carries its phrase; anything
        // else is stated generically instead of showing an internal error's message.
        setError(cause instanceof LogoFileError ? cause.message : "No se pudo procesar la imagen.");
      } finally {
        setBusy(false);
      }
    },
    [onChange],
  );

  return { error, setError, busy, pick };
}

export function LogoPicker({
  value,
  onChange,
  disabled,
  label = "Logo",
  hint = "Opcional. Aparece en el header, en los Excel y en el comprobante en PDF.",
}: {
  value: EntityLogo | null;
  onChange: (logo: EntityLogo | null) => void;
  disabled?: boolean;
  label?: string;
  hint?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const { error, setError, busy, pick } = useLogoUpload(onChange);

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[10.5px] font-semibold uppercase tracking-[0.5px] text-faint">
        {label}
      </span>

      <div className="flex items-center gap-3">
        <div
          className={cn(
            "flex size-[52px] shrink-0 items-center justify-center overflow-hidden rounded-[9px] border",
            value
              ? "border-border bg-[repeating-conic-gradient(var(--color-surface-muted)_0_25%,transparent_0_50%)] bg-[length:12px_12px]"
              : "border-dashed border-border bg-surface-muted",
          )}
        >
          {value ? (
            // No `next/image`: the source is a data URL from IndexedDB, not an asset with a path the
            // optimizer could touch.
            // oxlint-disable-next-line next/no-img-element
            <img
              src={value.dataUrl}
              alt=""
              className="max-h-full max-w-full object-contain"
              width={value.width}
              height={value.height}
            />
          ) : (
            <ImagePlus size={18} className="text-faint" />
          )}
        </div>

        <div className="flex min-w-0 flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              disabled={disabled || busy}
              onClick={() => inputRef.current?.click()}
            >
              {busy ? "Procesando…" : value ? "Cambiar" : "Subir logo"}
            </Button>
            {value && (
              <Button
                variant="danger"
                size="sm"
                icon={<Trash2 size={14} />}
                disabled={disabled || busy}
                onClick={() => {
                  setError(null);
                  onChange(null);
                }}
              >
                Quitar
              </Button>
            )}
          </div>
          <span className={cn("text-[11.5px]", error ? "text-negative" : "text-faint")}>
            {error ?? `PNG, JPG o SVG · hasta ${formatBytes(LOGO_MAX_BYTES)}`}
          </span>
        </div>
      </div>

      {!error && <span className="text-[11.5px] text-faint">{hint}</span>}

      <input
        ref={inputRef}
        type="file"
        accept={LOGO_ACCEPT_ATTRIBUTE}
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          // The input is cleared BEFORE processing: without this, picking the same file again after a
          // rejection does not fire `change` and the control looks unresponsive.
          event.target.value = "";
          void pick(file);
        }}
      />
    </div>
  );
}

/**
 * The same control in ONE ROW, for each cost center of a client (each sucursal of a hotel). It is a
 * form and not a separate component: it uploads, changes and removes exactly the same thing, with the
 * same file rules.
 *
 * It is squeezed into one row because there are SEVERAL of them and they are optional — a client with
 * six centers and the full block repeated six times would push the save button off screen, and none
 * of the six is the main logo. That is also why it does not repeat the help line: the size cap and
 * the formats are already stated by the picker above, in the same dialog, and saying them seven times
 * does not make them any truer. What IS said here is the REJECTION, which belongs to this row's file.
 */
export function CenterLogoRow({
  name,
  color,
  value,
  onChange,
  disabled,
}: {
  name: string;
  /** The selector's dot, so the row can be recognised from the filter bar. */
  color?: string | undefined;
  value: EntityLogo | null;
  onChange: (logo: EntityLogo | null) => void;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const { error, setError, busy, pick } = useLogoUpload(onChange);

  return (
    <li className="flex items-center gap-2.5 py-1.5">
      <div
        className={cn(
          "flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-[7px] border",
          value
            ? "border-border bg-[repeating-conic-gradient(var(--color-surface-muted)_0_25%,transparent_0_50%)] bg-[length:8px_8px]"
            : "border-dashed border-border bg-surface-muted",
        )}
      >
        {value ? (
          // oxlint-disable-next-line next/no-img-element
          <img
            src={value.dataUrl}
            alt=""
            className="max-h-full max-w-full object-contain"
            width={value.width}
            height={value.height}
          />
        ) : (
          <ImagePlus size={14} className="text-faint" />
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <span className="flex min-w-0 items-center gap-1.5">
          {color && (
            <span
              className="size-2 shrink-0 rounded-[3px]"
              style={{ backgroundColor: color }}
              aria-hidden
            />
          )}
          <span className="truncate text-[12.5px] font-semibold text-ink">{name}</span>
        </span>
        {error && <span className="text-[11px] text-negative">{error}</span>}
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        <Button
          variant="secondary"
          size="sm"
          disabled={disabled || busy}
          onClick={() => inputRef.current?.click()}
        >
          {busy ? "Procesando…" : value ? "Cambiar" : "Subir logo"}
        </Button>
        {value && (
          <Button
            variant="danger"
            size="sm"
            iconOnly
            aria-label={`Quitar el logo de ${name}`}
            icon={<Trash2 size={14} />}
            disabled={disabled || busy}
            onClick={() => {
              setError(null);
              onChange(null);
            }}
          />
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={LOGO_ACCEPT_ATTRIBUTE}
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          void pick(file);
        }}
      />
    </li>
  );
}
