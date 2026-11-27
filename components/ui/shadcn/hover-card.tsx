"use client";

import type { ReactNode } from "react";
import { PreviewCard as PreviewCardPrimitive } from "@base-ui/react/preview-card";
import { cn } from "@/lib/cn";

/**
 * shadcn/base HoverCard, adapted to LiderPlus tokens: a LINK that keeps navigating on click and
 * opens a card of further links on hover or focus. A menu would have turned the link into a button.
 */
const HoverCard = PreviewCardPrimitive.Root;
const HoverCardTrigger = PreviewCardPrimitive.Trigger;

function HoverCardContent({
  className,
  children,
  side = "bottom",
  sideOffset = 8,
  align = "center",
  alignOffset = 0,
}: {
  className?: string;
  children: ReactNode;
} & Pick<PreviewCardPrimitive.Positioner.Props, "side" | "sideOffset" | "align" | "alignOffset">) {
  return (
    <PreviewCardPrimitive.Portal>
      <PreviewCardPrimitive.Positioner
        side={side}
        sideOffset={sideOffset}
        align={align}
        alignOffset={alignOffset}
        className="isolate z-50"
      >
        <PreviewCardPrimitive.Popup
          data-slot="hover-card-content"
          className={cn(
            "origin-(--transform-origin) rounded-[13px] border border-border bg-surface p-1.5 text-ink shadow-[0_14px_36px_rgba(15,23,42,0.16)] outline-none transition-[opacity,scale] duration-100 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0",
            className,
          )}
        >
          {children}
        </PreviewCardPrimitive.Popup>
      </PreviewCardPrimitive.Positioner>
    </PreviewCardPrimitive.Portal>
  );
}

export { HoverCard, HoverCardContent, HoverCardTrigger };
