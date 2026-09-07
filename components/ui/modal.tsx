"use client";

import { X } from "lucide-react";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * A CENTRED window, over the native `<dialog>`: top-layer stacking, focus trapping and Escape are
 * provided by the browser, not by us.
 *
 * It is `SidePanel`'s sibling and is chosen by the SHAPE of what it shows, not by taste. The side
 * drawer exists for a detail read NEXT TO what opened it —an account's ficha against its row of the
 * table— and that is why it carries no scrim: you can keep reading behind it. This window is the
 * opposite: it interrupts, stands in the middle and dims the background, so it is the right thing
 * when what opens is read ALONE and closed straight away.
 *
 * `ConfirmDialog` predates this file and repeats these mechanics; when someone touches it, it is
 * better folded in here than kept as a second one — and `fill` exists for the same reason: a window
 * that wants the WHOLE screen is still this window, and writing a second `<dialog>` for it would be
 * repeating the top layer, the focus trap, Escape and the scrim a third time.
 */
export function Modal({
  open,
  title,
  eyebrow,
  onClose,
  children,
  width = 460,
  fill = false,
}: {
  open: boolean;
  title: string;
  /** What identifies without being the name — an account code above the title. */
  eyebrow?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  width?: number;
  /**
   * The window takes the SCREEN instead of a width: for what is not read but LOOKED AT, and where
   * the size is the whole point of opening it — an enlarged chart. The body becomes a flex box that
   * knows its own height, so what goes inside can measure it; `width` means nothing here.
   */
  fill?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const closeId = useId();

  // The controlled `open` is synced with the native state. `showModal()` is what puts the window in
  // the top layer; focus is moved to the close button explicitly and by id —not by DOM order— so
  // opening does not leave focus lost inside the content.
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

  // A click on the scrim: the event whose target IS the `<dialog>` itself landed on the `::backdrop`.
  // It is bound by hand and not with `onClick` so the accessibility rules do not read the dialog as a
  // non-interactive element with a click hung on it.
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
        // Escape fires the native `cancel`; React remains the source of truth for closing.
        event.preventDefault();
        onClose();
      }}
      style={fill ? undefined : { maxWidth: width }}
      className={cn(
        "m-auto border-none bg-transparent p-0 backdrop:bg-ink/40",
        fill ? "h-[92vh] w-[94vw]" : "w-full",
      )}
    >
      <div
        className={cn(
          "rounded-[13px] border border-border bg-surface shadow-[0_24px_60px_rgba(15,23,42,0.24)]",
          fill && "flex h-full flex-col",
        )}
      >
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
        {/* Filling, the body is what has a HEIGHT: the dialog's flex fixes it, so its content can
            measure the box instead of guessing it from the viewport. */}
        <div className={cn("px-5 py-4", fill && "min-h-0 flex-1 overflow-hidden")}>{children}</div>
      </div>
    </dialog>
  );
}
