"use client";

import { memo, useRef, useState, type InputHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export const InlineField = memo(function InlineField({
  value,
  onCommit,
  label,
  className,
  appearance = "inline",
  density = "comfortable",
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "onBlur"> & {
  value: string;
  onCommit: (value: string) => Promise<void>;
  label: string;
  appearance?: "inline" | "field";
  density?: "comfortable" | "compact";
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const [busy, setBusy] = useState(false),
    [failed, setFailed] = useState(false);
  const cancelled = useRef(false);
  const commit = async () => {
    if (cancelled.current) {
      cancelled.current = false;
      return;
    }
    if (busy) return;
    if (draft === null || (draft === value && !failed)) {
      setDraft(null);
      return;
    }
    setBusy(true);
    setFailed(false);
    try {
      await onCommit(draft);
      setDraft(null);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };
  return (
    <input
      {...props}
      readOnly={busy || props.readOnly}
      value={draft ?? value}
      aria-label={label}
      aria-invalid={failed || undefined}
      aria-busy={busy || undefined}
      placeholder={props.placeholder ?? "—"}
      className={cn(
        "w-full min-w-0 rounded-[9px] border px-2.5 text-[13px] text-ink outline-none transition-colors focus:border-brand",
        density === "compact" ? "h-[34px] py-1.5" : "py-2",
        appearance === "field"
          ? "border-border bg-surface font-mono tabular-nums placeholder:text-muted hover:border-brand/40 focus:ring-2 focus:ring-brand-soft"
          : "border-transparent bg-transparent placeholder:text-faint hover:border-border focus:bg-surface",
        failed && "border-warning",
        className,
      )}
      onFocus={() => {
        if (draft === null) setDraft(value);
      }}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => void commit()}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          e.currentTarget.blur();
        }
        if (e.key === "Escape") {
          e.preventDefault();
          cancelled.current = true;
          setDraft(null);
          setFailed(false);
          e.currentTarget.blur();
        }
      }}
    />
  );
});
