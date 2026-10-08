"use client";

import { Combobox as ComboboxPrimitive } from "@base-ui/react";
import { cn } from "@/lib/cn";

import { ChevronDownIcon, CheckIcon } from "lucide-react";

/** shadcn/base Combobox: the popup search variant, using LiderPlus tokens. */
type Styled<T> = Omit<T, "className"> & { className?: string };
const Combobox = ComboboxPrimitive.Root;

function ComboboxValue({ ...props }: Styled<ComboboxPrimitive.Value.Props>) {
  return <ComboboxPrimitive.Value data-slot="combobox-value" {...props} />;
}

function ComboboxTrigger({
  className,
  children,
  ...props
}: Styled<ComboboxPrimitive.Trigger.Props>) {
  return (
    <ComboboxPrimitive.Trigger
      data-slot="combobox-trigger"
      className={cn(
        "flex w-full items-center justify-between gap-2 rounded-[9px] border border-border bg-surface px-2.5 text-[12.5px] text-ink outline-none transition-colors hover:bg-canvas focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-brand/20 disabled:cursor-not-allowed disabled:opacity-50 [&_svg]:size-3.5",
        className,
      )}
      {...props}
    >
      {children}
      <ChevronDownIcon className="pointer-events-none size-4 text-muted" />
    </ComboboxPrimitive.Trigger>
  );
}

function ComboboxInput({ className, ...props }: Styled<ComboboxPrimitive.Input.Props>) {
  return (
    <ComboboxPrimitive.Input
      data-slot="combobox-input"
      className={cn(
        "h-[38px] w-full shrink-0 rounded-[9px] border border-border bg-surface px-2.5 text-[13px] text-ink outline-none placeholder:text-muted focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-brand/20 disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

function ComboboxContent({
  className,
  side = "bottom",
  sideOffset = 6,
  align = "start",
  alignOffset = 0,
  anchor,
  portalContainer,
  ...props
}: Styled<ComboboxPrimitive.Popup.Props> & { portalContainer?: HTMLElement | null } & Pick<
    ComboboxPrimitive.Positioner.Props,
    "side" | "align" | "sideOffset" | "alignOffset" | "anchor"
  >) {
  return (
    <ComboboxPrimitive.Portal container={portalContainer ?? undefined}>
      <ComboboxPrimitive.Positioner
        side={side}
        sideOffset={sideOffset}
        align={align}
        alignOffset={alignOffset}
        anchor={anchor}
        className="isolate z-50"
      >
        <ComboboxPrimitive.Popup
          data-slot="combobox-content"
          data-chips={!!anchor}
          className={cn(
            "group/combobox-content flex max-h-(--available-height) w-(--anchor-width) min-w-[320px] max-w-(--available-width) flex-col overflow-hidden rounded-[13px] border border-border bg-surface p-2 text-ink shadow-[0_14px_36px_rgba(15,23,42,0.16)]",
            className,
          )}
          {...props}
        />
      </ComboboxPrimitive.Positioner>
    </ComboboxPrimitive.Portal>
  );
}

function ComboboxList({ className, ...props }: Styled<ComboboxPrimitive.List.Props>) {
  return (
    <ComboboxPrimitive.List
      data-slot="combobox-list"
      className={cn(
        "min-h-0 max-h-[240px] scroll-py-1 overflow-y-auto overscroll-contain p-1 data-empty:p-0",
        className,
      )}
      {...props}
    />
  );
}

function ComboboxItem({ className, children, ...props }: Styled<ComboboxPrimitive.Item.Props>) {
  return (
    <ComboboxPrimitive.Item
      data-slot="combobox-item"
      className={cn(
        "relative flex w-full cursor-default items-center gap-2 rounded-[9px] py-2 pr-8 pl-2 text-[12.5px] outline-none select-none data-highlighted:bg-brand-soft data-highlighted:text-brand data-selected:font-semibold data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-3.5",
        className,
      )}
      {...props}
    >
      {children}
      <ComboboxPrimitive.ItemIndicator
        render={
          <span className="pointer-events-none absolute right-2 flex size-4 items-center justify-center" />
        }
      >
        <CheckIcon className="pointer-events-none" />
      </ComboboxPrimitive.ItemIndicator>
    </ComboboxPrimitive.Item>
  );
}

function ComboboxGroup({ className, ...props }: Styled<ComboboxPrimitive.Group.Props>) {
  return (
    <ComboboxPrimitive.Group data-slot="combobox-group" className={cn(className)} {...props} />
  );
}

function ComboboxLabel({ className, ...props }: Styled<ComboboxPrimitive.GroupLabel.Props>) {
  return (
    <ComboboxPrimitive.GroupLabel
      data-slot="combobox-label"
      className={cn("px-2 py-1.5 text-xs text-muted", className)}
      {...props}
    />
  );
}

function ComboboxCollection({ ...props }: Styled<ComboboxPrimitive.Collection.Props>) {
  return <ComboboxPrimitive.Collection data-slot="combobox-collection" {...props} />;
}

function ComboboxEmpty({ className, ...props }: Styled<ComboboxPrimitive.Empty.Props>) {
  // Base UI keeps this live region mounted; an empty message must not reserve vertical space.
  return (
    <ComboboxPrimitive.Empty
      data-slot="combobox-empty"
      className={cn("py-3 text-center text-[12.5px] text-muted empty:py-0", className)}
      {...props}
    />
  );
}

function ComboboxSeparator({ className, ...props }: Styled<ComboboxPrimitive.Separator.Props>) {
  return (
    <ComboboxPrimitive.Separator
      data-slot="combobox-separator"
      className={cn("-mx-1 my-1 h-px bg-border", className)}
      {...props}
    />
  );
}

export {
  Combobox,
  ComboboxValue,
  ComboboxTrigger,
  ComboboxInput,
  ComboboxContent,
  ComboboxList,
  ComboboxItem,
  ComboboxGroup,
  ComboboxLabel,
  ComboboxCollection,
  ComboboxEmpty,
  ComboboxSeparator,
};
