"use client";

import { ImagePlus, Trash2 } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { LogoFileError, readLogoFile } from "@/lib/logo-file";
import { formatBytes, LOGO_ACCEPT_ATTRIBUTE, LOGO_MAX_BYTES, type EntityLogo } from "@/lib/logos";

/**
 * El control que sube el LOGO de un workspace: vista previa, «Cambiar» y «Quitar».
 *
 * Es un primitivo y no un trozo del diálogo de nombre porque lo mismo vale para el cliente de PyG,
 * el de Rol de Pagos y el hotel de Ocupaciones — los tres comparten ese diálogo, y cualquier otro
 * sitio que quiera pedir una imagen de identidad quiere exactamente esto.
 *
 * **El límite de peso se anuncia ANTES de fallar.** La línea de ayuda dice el máximo desde el
 * primer render, así que el rechazo confirma una regla que ya estaba a la vista en vez de estrenar
 * una: enterarse del tope solo al chocar con él obliga a un segundo viaje al explorador de
 * archivos.
 *
 * La vista previa se dibuja sobre un tablero de cuadros tenue porque casi todo logo llega con
 * fondo TRANSPARENTE, y sobre blanco un logo blanco parecería no haberse subido.
 */
/**
 * Leer el archivo, con su rechazo ya redactado. Lo comparten el picker del workspace y el de cada
 * centro: son dos formas del mismo control, y una segunda copia de «qué se hace con el archivo»
 * podría aceptar en una lo que la otra rechaza.
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
        // Un rechazo previsto (tipo, peso, archivo ilegible) ya trae su frase; cualquier otra cosa
        // se dice en genérico en vez de enseñar el mensaje de un error interno.
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
            // Sin `next/image`: la fuente es un data URL de IndexedDB, no un asset con ruta que el
            // optimizador pueda tocar.
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
          // Se limpia el input ANTES de procesar: sin esto, volver a elegir el mismo archivo tras
          // un rechazo no dispara `change` y el control parece no responder.
          event.target.value = "";
          void pick(file);
        }}
      />
    </div>
  );
}

/**
 * El mismo control en UNA FILA, para cada centro de costo de un cliente (cada sucursal de un
 * hotel). Es una forma y no un componente aparte: sube, cambia y quita exactamente lo mismo, con
 * las mismas reglas de archivo.
 *
 * Se aprieta a una fila porque son VARIOS y opcionales — un cliente de seis centros con el bloque
 * completo repetido seis veces empujaría el botón de guardar fuera de la pantalla, y ninguno de los
 * seis es el logo principal. Por eso tampoco repite la línea de ayuda: el tope de peso y los
 * formatos ya los declara el picker de arriba, en el mismo diálogo, y decirlos siete veces no los
 * hace más ciertos. Lo que sí se dice aquí es el RECHAZO, que es del archivo de esta fila.
 */
export function CenterLogoRow({
  name,
  color,
  value,
  onChange,
  disabled,
}: {
  name: string;
  /** El punto del selector, para que la fila se reconozca desde la barra de filtros. */
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
