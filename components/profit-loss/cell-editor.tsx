"use client";

import { MessageSquare } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { formatNumber, parseCurrency } from "@/lib/format";
import { formatAmount } from "./datos-utils";

/** Where the editor should anchor — the clicked cell's viewport rect. */
export interface EditorAnchor {
  top: number;
  left: number;
  bottom: number;
  right: number;
}

const POPOVER_WIDTH = 288;

/**
 * A cell edit/comment popover, positioned next to the clicked cell (fixed, so the
 * table's own `overflow:auto` never clips it). Visual only: `onSave` hands the new
 * value/comment back to the view, which stores it in a local override map. Closes on
 * backdrop click or Escape.
 */
export function CellEditor({
  anchor,
  title,
  subtitle,
  valueEditable,
  initialValue,
  initialComment,
  onSave,
  onClose,
}: {
  anchor: EditorAnchor;
  title: string;
  subtitle: string;
  /** Movement accounts edit the value; parent accounts can only comment. */
  valueEditable: boolean;
  initialValue: number | null;
  initialComment: string;
  onSave: (value: number | null, comment: string) => void;
  onClose: () => void;
}) {
  // Seed with the Ecuadorian format the parser expects (`,` thousands, `.` decimals) so
  // a value with cents round-trips on save instead of being inflated by dropped separators.
  const [value, setValue] = useState(initialValue === null ? "" : formatNumber(initialValue));
  const [comment, setComment] = useState(initialComment);
  const inputRef = useRef<HTMLInputElement>(null);
  const commentRef = useRef<HTMLTextAreaElement>(null);
  const popoverRef = useRef<HTMLDialogElement>(null);
  const [pos, setPos] = useState({ top: anchor.bottom + 6, left: anchor.right - POPOVER_WIDTH });

  useEffect(() => {
    if (valueEditable) {
      inputRef.current?.select();
    } else {
      commentRef.current?.focus();
    }
  }, [valueEditable]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Flip/clamp so the popover stays on screen relative to the anchored cell.
  useLayoutEffect(() => {
    const height = popoverRef.current?.offsetHeight ?? 0;
    const left = Math.max(
      12,
      Math.min(anchor.right - POPOVER_WIDTH, window.innerWidth - POPOVER_WIDTH - 12),
    );
    const below = anchor.bottom + 6;
    const top =
      below + height > window.innerHeight - 12 ? Math.max(12, anchor.top - height - 6) : below;
    setPos({ top, left });
  }, [anchor]);

  const submit = () => {
    if (!valueEditable) {
      onSave(initialValue, comment.trim());
      return;
    }
    const trimmed = value.trim();
    if (trimmed === "") {
      onSave(null, comment.trim()); // cleared cell
      return;
    }
    const parsed = parseCurrency(trimmed);
    onSave(parsed ?? initialValue, comment.trim()); // unparseable → keep the original value
  };

  const displayValue = formatAmount(initialValue);

  return (
    <>
      <button
        type="button"
        aria-label="Cerrar editor"
        onClick={onClose}
        className="fixed inset-0 z-40 cursor-default"
      />
      <dialog
        ref={popoverRef}
        open
        aria-label={`Editar ${title}`}
        style={{ position: "fixed", top: pos.top, left: pos.left, width: POPOVER_WIDTH }}
        className="z-50 m-0 rounded-xl border border-border bg-surface p-3.5 text-ink shadow-[0_18px_50px_rgba(15,23,42,0.22)]"
      >
        <div className="mb-2.5">
          <div className="truncate text-[13px] font-semibold text-ink">{title}</div>
          <div className="text-[11.5px] text-faint">{subtitle}</div>
        </div>

        {valueEditable ? (
          <label className="mb-3 block">
            <span className="mb-1 block text-[10.5px] font-semibold uppercase tracking-[0.5px] text-faintest">
              Valor
            </span>
            <div className="relative">
              <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 font-mono text-[13px] text-faint">
                $
              </span>
              <input
                ref={inputRef}
                inputMode="decimal"
                value={value}
                onChange={(event) => setValue(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    submit();
                  }
                }}
                className="h-9 w-full rounded-lg border border-border bg-surface pl-6 pr-2.5 text-right font-mono text-[13px] tabular-nums text-ink outline-none focus:border-brand"
              />
            </div>
          </label>
        ) : (
          <div className="mb-3">
            <div className="mb-1 text-[10.5px] font-semibold uppercase tracking-[0.5px] text-faintest">
              Valor
            </div>
            <div className="flex h-9 items-center justify-end rounded-lg border border-border bg-canvas px-2.5 font-mono text-[13px] tabular-nums text-muted">
              {displayValue}
            </div>
            <p className="mt-1 text-[11px] leading-snug text-faint">
              Se calcula desde las cuentas de movimiento. Solo puedes comentarla.
            </p>
          </div>
        )}

        <label className="mb-3 block">
          <span className="mb-1 flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.5px] text-faintest">
            <MessageSquare size={12} />
            Comentario
          </span>
          <textarea
            ref={commentRef}
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            rows={2}
            placeholder="Nota opcional para esta celda"
            className="w-full resize-none rounded-lg border border-border bg-surface px-2.5 py-2 text-[12.5px] leading-snug text-ink outline-none placeholder:text-faintest focus:border-brand"
          />
        </label>

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="h-8 rounded-lg border border-border bg-surface px-3 text-[12.5px] font-semibold text-muted transition-colors hover:bg-canvas"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={submit}
            className="h-8 rounded-lg bg-brand px-3.5 text-[12.5px] font-semibold text-white transition-colors hover:bg-brand-hover"
          >
            Guardar
          </button>
        </div>
      </dialog>
    </>
  );
}
