"use client";

import type { ReactNode } from "react";
import { Tooltip as TooltipPrimitive } from "@base-ui/react/tooltip";
import { cn } from "@/lib/cn";

/**
 * shadcn/base Tooltip, adapted to LiderPlus tokens.
 *
 * It is NOT `components/ui/tooltip.tsx`: that one explains a control inside a table (string only,
 * above or below, hoverable). This one can open to a SIDE and shares its delay through a provider,
 * which is what a rail of icons needs — the first label waits, the next ones are instant.
 */
const TooltipProvider = TooltipPrimitive.Provider;
const Tooltip = TooltipPrimitive.Root;
const TooltipTrigger = TooltipPrimitive.Trigger;

function TooltipContent({
  className,
  children,
  side = "top",
  sideOffset = 8,
  align = "center",
}: {
  className?: string;
  children: ReactNode;
} & Pick<TooltipPrimitive.Positioner.Props, "side" | "sideOffset" | "align">) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Positioner
        side={side}
        sideOffset={sideOffset}
        align={align}
        className="isolate z-50"
      >
        <TooltipPrimitive.Popup
          data-slot="tooltip-content"
          className={cn(
            // Opacity and transform only: the popup is composited, never laid out twice.
            "flex origin-(--transform-origin) items-center gap-2 rounded-[9px] border border-border bg-surface px-2.5 py-1.5 text-[12.5px] font-medium text-ink shadow-[0_4px_12px_rgba(15,23,42,0.12)] transition-[opacity,scale] duration-100 data-ending-style:opacity-0 data-instant:transition-none data-starting-style:scale-95 data-starting-style:opacity-0",
            className,
          )}
        >
          {children}
        </TooltipPrimitive.Popup>
      </TooltipPrimitive.Positioner>
    </TooltipPrimitive.Portal>
  );
}

export { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger };
