"use client";

import { X } from "lucide-react";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { cn } from "@/lib/cn";

export interface SidePanelProps {
  /** Small line above the title — a code, a breadcrumb. */
  eyebrow?: ReactNode;
  title: ReactNode;
  /** Accessible name when `title` is not plain text. */
  label?: string;
  width?: number;
  onClose: () => void;
  children: ReactNode;
  /** Optional actions that remain visible while the panel body scrolls. */
  footer?: ReactNode;
}

/**
 * A right-anchored detail drawer built on the native `<dialog>` in its MODAL form, the same base
 * as `ConfirmDialog`. `showModal()` gives three things for free that a hand-rolled panel has to
 * reinvent and usually gets wrong: the top-layer stacking, the focus trap, and the focus RETURN
 * to whatever opened it (`close()` on unmount restores it). The dimmed `::backdrop` is the scrim
 * — the drawer takes the foreground, and a press on the darkened area closes it.
 *
 * The panel is pinned to the right with `left-auto right-0`: the dialog UA stylesheet sets both
 * `left:0` and `right:0`, so without clearing `left` a fixed-width box lands on the LEFT.
 */
export function SidePanel({
  eyebrow,
  title,
  label,
  width = 420,
  onClose,
  children,
  footer,
}: SidePanelProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  // Enter the top layer on mount; leaving it via close() (not bare removal) is what hands focus
  // back to the trigger.
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog?.open) {
      dialog?.showModal();
    }
    return () => dialog?.close();
  }, []);

  // A click whose target is the dialog element itself landed on the ::backdrop. Bound
  // imperatively so a11y lint does not read the dialog as a clickable non-interactive element.
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
      aria-labelledby={label ? undefined : titleId}
      aria-label={label}
      onCancel={(event) => {
        // Escape fires the native `cancel`; keep React the source of truth for closing.
        event.preventDefault();
        onClose();
      }}
      style={{ width }}
      className={cn(
        "fixed inset-y-0 left-auto right-0 m-0 h-auto max-h-none max-w-none p-0",
        "flex flex-col border-l border-border bg-surface text-ink outline-none",
        footer ? "overflow-hidden" : "overflow-y-auto",
        "shadow-[-18px_0_50px_rgba(15,23,42,0.16)] backdrop:bg-ink/35",
      )}
    >
      <header className="sticky top-0 z-10 flex items-start gap-3 border-b border-border bg-surface px-[18px] pb-3 pt-4">
        <div className="min-w-0 flex-1">
          {eyebrow && <div className="mb-1 flex items-center gap-2">{eyebrow}</div>}
          <h2 id={titleId} className="text-[15px] font-semibold leading-snug text-ink">
            {title}
          </h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar panel"
          className="-mr-1 mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-faint transition-colors hover:bg-canvas hover:text-ink"
        >
          <X size={16} />
        </button>
      </header>

      <div className={cn("flex-1 px-[18px] py-4", footer ? "min-h-0 overflow-y-auto" : undefined)}>
        {children}
      </div>
      {footer && (
        <footer className="shrink-0 border-t border-border bg-surface px-[18px] py-4">
          {footer}
        </footer>
      )}
    </dialog>
  );
}
