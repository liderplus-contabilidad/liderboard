"use client";

import { Collapsible as CollapsiblePrimitive } from "@base-ui/react/collapsible";
import { cn } from "@/lib/cn";

/** shadcn/base Collapsible. The panel animates its HEIGHT, measured by Base UI, and unmounts closed. */
const Collapsible = CollapsiblePrimitive.Root;
const CollapsibleTrigger = CollapsiblePrimitive.Trigger;

function CollapsiblePanel({
  className,
  ...props
}: Omit<CollapsiblePrimitive.Panel.Props, "className"> & { className?: string }) {
  return (
    <CollapsiblePrimitive.Panel
      data-slot="collapsible-panel"
      className={cn(
        "h-(--collapsible-panel-height) overflow-hidden transition-[height] duration-200 ease-out data-ending-style:h-0 data-starting-style:h-0 motion-reduce:transition-none",
        className,
      )}
      {...props}
    />
  );
}

export { Collapsible, CollapsiblePanel, CollapsibleTrigger };
