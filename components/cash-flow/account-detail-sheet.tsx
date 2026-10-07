"use client";

import { X } from "lucide-react";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import styles from "./account-detail-sheet.module.css";

/** A native modal sheet over just the cash-flow drawer; focus and Escape stay in this layer. */
export function AccountDetailSheet({
  title,
  summary,
  onClose,
  children,
}: {
  title: string;
  summary: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    closeRef.current?.focus();
    return () => dialog?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }}
      className="fixed inset-y-0 left-auto right-0 m-0 h-dvh max-h-none w-[640px] max-w-none overflow-hidden border-0 bg-transparent p-0 outline-none backdrop:bg-transparent"
    >
      <button
        type="button"
        aria-label="Cerrar detalle de cuenta"
        onClick={onClose}
        className="absolute inset-0 h-full w-full bg-ink/35"
      />
      <section
        className={`${styles.sheet} absolute inset-x-0 bottom-0 flex max-h-[calc(100dvh-64px)] flex-col overflow-hidden rounded-t-[13px] border-t border-border bg-surface shadow-[0_-12px_36px_rgba(15,23,42,0.16)]`}
      >
        <header className="flex shrink-0 items-start gap-3 border-b border-border-soft px-5 py-4">
          <div className="min-w-0 flex-1">
            <h3 id={titleId} className="text-[18px] font-semibold leading-snug text-ink">
              {title}
            </h3>
            <p className="mt-1 text-[12px] tabular-nums leading-relaxed text-muted">{summary}</p>
          </div>
          <Button
            ref={closeRef}
            variant="ghost"
            size="sm"
            iconOnly
            icon={<X size={16} />}
            aria-label="Cerrar detalle de cuenta"
            onClick={onClose}
          />
        </header>
        <div className="overflow-y-auto overscroll-contain px-5 pb-5 pt-1">{children}</div>
      </section>
    </dialog>
  );
}
