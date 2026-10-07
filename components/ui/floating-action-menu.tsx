"use client";

import { ChevronDown, Plus } from "lucide-react";
import { useEffect, useId, useRef, type KeyboardEvent, type ReactNode } from "react";
import { Button } from "./button";
import { Dropdown, DropdownPanel, useDropdown } from "./dropdown";

export interface FloatingAction {
  id: string;
  label: string;
  description: string;
  icon: ReactNode;
  run: () => void;
}

/** A single entry point with named circular icons, so choosing does not require guessing an icon. */
export function FloatingActionMenu({
  label,
  actions,
}: {
  label: string;
  actions: readonly FloatingAction[];
}) {
  return (
    <Dropdown>
      <ActionMenu label={label} actions={actions} />
    </Dropdown>
  );
}

function ActionMenu({ label, actions }: { label: string; actions: readonly FloatingAction[] }) {
  const { open, setOpen, triggerRef } = useDropdown();
  const menuId = useId();
  return (
    <>
      <Button
        ref={triggerRef}
        size="sm"
        icon={<Plus size={14} />}
        trailingIcon={<ChevronDown size={13} />}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen(!open)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            setOpen(true);
          }
        }}
      >
        {label}
      </Button>
      <DropdownPanel align="right" width={360}>
        <ActionChoices id={menuId} label={label} actions={actions} />
      </DropdownPanel>
    </>
  );
}

function ActionChoices({
  id,
  label,
  actions,
}: {
  id: string;
  label: string;
  actions: readonly FloatingAction[];
}) {
  const ref = useRef<HTMLDivElement>(null);
  const { setOpen, triggerRef } = useDropdown();
  useEffect(() => {
    ref.current?.querySelector<HTMLButtonElement>("button")?.focus();
  }, []);
  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const buttons = [...(ref.current?.querySelectorAll<HTMLButtonElement>("button") ?? [])];
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp", "Home", "End"].includes(event.key)) {
      event.preventDefault();
      const next =
        event.key === "Home"
          ? 0
          : event.key === "End"
            ? buttons.length - 1
            : (index +
                (["ArrowRight", "ArrowDown"].includes(event.key) ? 1 : -1) +
                buttons.length) %
              buttons.length;
      buttons[next]?.focus();
    } else if (event.key === "Escape" || event.key === "Tab") {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
      }
      setOpen(false);
      triggerRef.current?.focus();
    }
  };
  return (
    <div ref={ref} id={id} aria-label={label}>
      <p className="mb-3 text-[12px] font-semibold text-ink">¿De dónde viene el pago?</p>
      <div className="flex gap-2">
        {actions.map((action) => (
          <button
            key={action.id}
            type="button"
            role="menuitem"
            onKeyDown={handleKeyDown}
            className="group flex min-w-0 flex-1 flex-col items-center gap-2 rounded-[9px] px-2 py-3 text-center transition-colors hover:bg-canvas focus-visible:bg-canvas focus-visible:outline-2 focus-visible:outline-brand"
            onClick={() => {
              setOpen(false);
              triggerRef.current?.focus();
              action.run();
            }}
          >
            <span className="flex size-12 items-center justify-center rounded-full border border-border bg-brand-soft text-brand shadow-sm transition-colors group-hover:bg-brand group-hover:text-white group-focus-visible:bg-brand group-focus-visible:text-white">
              {action.icon}
            </span>
            <span className="text-[13px] font-semibold text-ink">{action.label}</span>
            <span className="text-[11px] leading-snug text-muted">{action.description}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
