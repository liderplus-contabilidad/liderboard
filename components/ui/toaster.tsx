"use client";

import { CircleCheck, CircleX, Info, Loader2, TriangleAlert } from "lucide-react";
import { Toaster as Sonner } from "sonner";

export { toast } from "sonner";

export function Toaster() {
  return (
    <Sonner
      theme="light"
      position="top-right"
      duration={6000}
      closeButton
      containerAriaLabel="Notificaciones"
      icons={{
        success: <CircleCheck size={18} className="text-white" />,
        info: <Info size={18} className="text-brand" />,
        warning: <TriangleAlert size={18} className="text-warning" />,
        error: <CircleX size={18} className="text-negative" />,
        loading: <Loader2 size={18} className="animate-spin text-brand" />,
      }}
      toastOptions={{
        unstyled: true,
        closeButtonAriaLabel: "Cerrar notificación",
        classNames: {
          toast:
            "flex w-full items-start gap-3 rounded-[13px] border p-4 pr-9 font-sans text-ink shadow-[0_12px_32px_rgba(15,23,42,0.16)]",
          default: "border-border bg-surface",
          success:
            "border-success bg-success [&_[data-title]]:text-white [&_[data-description]]:text-white [&_[data-close-button]]:text-white/80 [&_[data-close-button]:hover]:bg-white/15 [&_[data-close-button]:hover]:text-white [&_[data-close-button]:focus-visible]:outline-white",
          warning: "border-warning/40 bg-warning-soft",
          error: "border-negative/40 bg-surface",
          info: "border-border bg-surface",
          loading: "border-border bg-surface",
          content: "min-w-0 flex-1",
          title: "text-[13px] font-semibold leading-snug",
          description: "mt-1 text-[12.5px] leading-relaxed text-ink-soft tabular-nums",
          icon: "mt-0.5 shrink-0",
          closeButton:
            "absolute top-2 right-2 flex size-6 cursor-pointer items-center justify-center rounded-full text-muted transition-colors hover:bg-canvas hover:text-ink focus-visible:outline-2 focus-visible:outline-brand",
        },
      }}
    />
  );
}
