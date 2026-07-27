"use client";

import { AlertTriangle, ChevronDown, X } from "lucide-react";
import { type ReactNode, useState } from "react";
import { cn } from "@/lib/cn";

/** `children` is the summary line; `details` adds a "Ver detalle" toggle under it. */
export function NoticeBanner({
  children,
  details,
  onDismiss,
  className,
}: {
  children: ReactNode;
  details?: string[];
  onDismiss?: () => void;
  className?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const hasDetails = Boolean(details && details.length > 0);

  return (
    <div
      role="alert"
      className={cn(
        "flex items-start gap-2.5 rounded-[10px] border border-warning/50 bg-warning/10 px-3.5 py-2.5 text-[12.5px] leading-snug text-ink",
        className,
      )}
    >
      <AlertTriangle size={15} className="mt-px shrink-0" />
      <div className="min-w-0 flex-1">
        {children}
        {hasDetails && (
          <>
            <button
              type="button"
              aria-expanded={expanded}
              onClick={() => setExpanded((value) => !value)}
              className="mt-1 inline-flex items-center gap-1 text-[12px] font-semibold text-warning transition-opacity hover:opacity-80"
            >
              {expanded ? "Ocultar detalle" : "Ver detalle"}
              <ChevronDown
                size={13}
                className={cn("transition-transform", expanded && "rotate-180")}
              />
            </button>
            {expanded && (
              <ul className="mt-1.5 max-h-40 space-y-1 overflow-y-auto pr-1">
                {details?.map((message, i) => (
                  <li key={i} className="flex gap-1.5 text-[12px] text-ink-soft">
                    <span
                      aria-hidden
                      className="mt-[6px] h-1 w-1 shrink-0 rounded-full bg-warning"
                    />
                    <span className="min-w-0">{message}</span>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
      {onDismiss && (
        <button
          type="button"
          aria-label="Cerrar aviso"
          onClick={onDismiss}
          className="shrink-0 rounded p-0.5 text-current opacity-60 transition-opacity hover:opacity-100"
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
}
