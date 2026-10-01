"use client";

import { useRef, useState } from "react";
import { Check, ChevronDown, CircleCheck, CircleDashed, CircleDot } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { DropdownChoice } from "@/components/ui/dropdown";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { stagePatch, taskStage, type TaskStage } from "@/lib/schedule/model";
import type { TaskValues } from "@/lib/operations/types";
const STAGES = {
  pending: { label: "Pendiente", icon: CircleDashed },
  doing: { label: "En curso", icon: CircleDot },
  done: { label: "Hecha", icon: CircleCheck },
} as const;

export function TaskStageSelect({
  value,
  onCommit,
  label = "Estado de tarea",
  id,
}: {
  value: TaskValues;
  onCommit: (patch: Partial<TaskValues>) => Promise<void>;
  label?: string;
  id?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [container, setContainer] = useState<HTMLElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const stage = taskStage(value);
  const Icon = STAGES[stage].icon;
  const choose = async (next: TaskStage) => {
    if (busy) return;
    if (next === stage) {
      setOpen(false);
      return;
    }
    setBusy(true);
    try {
      await onCommit(stagePatch(next));
      setOpen(false);
    } catch {
      // The provider keeps the saved stage and displays the error for retry.
    } finally {
      setBusy(false);
    }
  };
  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (busy) return;
        if (next) setContainer(triggerRef.current?.closest("dialog") ?? null);
        setOpen(next);
      }}
    >
      <PopoverTrigger asChild>
        <button
          ref={triggerRef}
          type="button"
          id={id}
          aria-label={label}
          disabled={busy}
          className="inline-flex min-h-[34px] max-w-full items-center rounded-full outline-none transition-opacity hover:opacity-80 focus-visible:ring-2 focus-visible:ring-brand-soft disabled:cursor-wait disabled:opacity-50"
        >
          <Badge variant={`stage-${stage}`}>
            <Icon size={12} />
            {STAGES[stage].label}
            <ChevronDown size={10} />
          </Badge>
        </button>
      </PopoverTrigger>
      <PopoverContent
        ref={panelRef}
        container={container}
        role="menu"
        tabIndex={-1}
        aria-label="Cambiar estado"
        className="w-[180px]"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          panelRef.current?.querySelector<HTMLButtonElement>('[aria-checked="true"]')?.focus();
        }}
        onKeyDown={(event) => {
          const buttons = [
            ...(panelRef.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ??
              []),
          ];
          const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
          const next =
            event.key === "ArrowDown"
              ? (index + 1) % buttons.length
              : event.key === "ArrowUp"
                ? (index + buttons.length - 1) % buttons.length
                : event.key === "Home"
                  ? 0
                  : event.key === "End"
                    ? buttons.length - 1
                    : null;
          if (next !== null && buttons[next]) {
            event.preventDefault();
            buttons[next].focus();
          }
        }}
      >
        {(Object.keys(STAGES) as TaskStage[]).map((option) => {
          const OptionIcon = STAGES[option].icon;
          return (
            <DropdownChoice
              key={option}
              selected={stage === option}
              disabled={busy}
              onSelect={() => void choose(option)}
            >
              <Badge variant={`stage-${option}`}>
                <OptionIcon size={12} />
                {STAGES[option].label}
              </Badge>
              {stage === option && <Check size={14} className="ml-auto" />}
            </DropdownChoice>
          );
        })}
      </PopoverContent>
    </Popover>
  );
}
