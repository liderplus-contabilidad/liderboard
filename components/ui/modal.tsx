"use client";

import { X } from "lucide-react";
import { useEffect, useId, useRef, type ReactNode } from "react";

/**
 * Una ventana CENTRADA, sobre el nativo `<dialog>`: apilado en el top-layer, trampa de foco y
 * Escape los pone el navegador, no nosotros.
 *
 * Es la hermana de `SidePanel` y se elige por la FORMA de lo que muestra, no por gusto. El cajón
 * lateral existe para un detalle que se lee JUNTO a lo que lo abrió —la ficha de una cuenta contra
 * su fila de la tabla— y por eso no lleva velo: se puede seguir leyendo detrás. Esta ventana es lo
 * contrario: interrumpe, se pone en medio y apaga el fondo, así que es lo correcto cuando lo que se
 * abre se lee SOLO y se cierra enseguida.
 *
 * `ConfirmDialog` es anterior a este archivo y repite estas mecánicas; cuando alguien lo toque,
 * conviene plegarlo aquí en vez de mantener dos.
 */
export function Modal({
  open,
  title,
  eyebrow,
  onClose,
  children,
  width = 460,
}: {
  open: boolean;
  title: string;
  /** Lo que identifica sin ser el nombre — un código de cuenta sobre el título. */
  eyebrow?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  width?: number;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const closeId = useId();

  // El `open` controlado se sincroniza con el estado nativo. `showModal()` es lo que pone la
  // ventana en el top-layer; el foco se mueve al cierre explícitamente y por id —no por orden en
  // el DOM— para que abrir no deje el foco perdido dentro del contenido.
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) {
      return;
    }
    if (open && !dialog.open) {
      dialog.showModal();
      document.getElementById(closeId)?.focus();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open, closeId]);

  // Clic en el velo: el evento cuyo target ES el propio `<dialog>` cayó en el `::backdrop`. Se ata
  // a mano y no con `onClick` para que las reglas de accesibilidad no lean el diálogo como un
  // elemento no interactivo al que se le colgó un clic.
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) {
      return;
    }
    const onBackdropClick = (event: MouseEvent) => {
      if (event.target === dialog) {
        onClose();
      }
    };
    dialog.addEventListener("click", onBackdropClick);
    return () => dialog.removeEventListener("click", onBackdropClick);
  }, [onClose]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(event) => {
        // Escape dispara el `cancel` nativo; React sigue siendo la fuente de verdad del cierre.
        event.preventDefault();
        onClose();
      }}
      style={{ maxWidth: width }}
      className="m-auto w-full border-none bg-transparent p-0 backdrop:bg-ink/40"
    >
      <div className="rounded-[13px] border border-border bg-surface shadow-[0_24px_60px_rgba(15,23,42,0.24)]">
        <div className="flex items-start justify-between gap-3 border-b border-border-soft px-5 py-4">
          <div className="min-w-0">
            {eyebrow && <div className="mb-1 flex items-center gap-2">{eyebrow}</div>}
            <h2 id={titleId} className="truncate text-[15px] font-semibold text-ink">
              {title}
            </h2>
          </div>
          <button
            id={closeId}
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="-mr-1 -mt-0.5 shrink-0 rounded-lg p-1.5 text-faint transition-colors hover:bg-canvas hover:text-ink"
          >
            <X size={16} />
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
      </div>
    </dialog>
  );
}
