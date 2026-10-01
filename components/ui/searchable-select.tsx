"use client";

import { Check, ChevronsUpDown, Plus } from "lucide-react";
import { useId, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/cn";
import { compactLabel } from "@/lib/text";

export interface SearchableSelectOption {
  value: string;
  label: string;
  keywords?: string[];
}

/** shadcn's Popover + Command combobox pattern, with search inside the menu. */
export function SearchableSelect({
  label,
  value,
  options,
  onChange,
  allLabel,
  searchPlaceholder,
  icon,
  className,
  onCreate,
  allowAll = true,
  fallbackLabel,
  disabled = false,
  id,
  ariaLabel,
  appearance = "field",
  completed = false,
}: {
  label: string;
  value: string;
  options: readonly SearchableSelectOption[];
  onChange: (value: string) => void | Promise<void>;
  allLabel: string;
  searchPlaceholder: string;
  icon?: ReactNode;
  className?: string;
  onCreate?: (label: string) => void | Promise<void>;
  allowAll?: boolean;
  fallbackLabel?: string;
  disabled?: boolean;
  id?: string;
  ariaLabel?: string;
  appearance?: "field" | "inline";
  completed?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [container, setContainer] = useState<HTMLElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listId = useId();
  const selected = options.find((option) => option.value === value);
  const display = selected?.label ?? fallbackLabel ?? allLabel;
  const createLabel = query.trim();
  const canCreate =
    onCreate &&
    createLabel &&
    !options.some((option) => compactLabel(option.label) === compactLabel(createLabel));
  const choose = async (next: string, create = false) => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      if (create) await onCreate?.(next);
      else await onChange(next);
      setOpen(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo guardar. Inténtalo de nuevo.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (busy) return;
        if (next) {
          setQuery("");
          setError("");
          setContainer(triggerRef.current?.closest("dialog") ?? null);
        }
        setOpen(next);
      }}
    >
      <PopoverTrigger asChild>
        <Button
          ref={triggerRef}
          id={id}
          size="toolbar"
          variant={appearance === "inline" ? "ghost" : "secondary"}
          // A button opens the searchable list, following shadcn's combobox pattern.
          // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role
          role="combobox"
          aria-expanded={open}
          aria-controls={open ? listId : undefined}
          aria-label={ariaLabel ?? `${label}: ${display}`}
          disabled={busy || disabled}
          title={display}
          data-inline={appearance === "inline"}
          data-completed={completed}
          icon={icon}
          trailingIcon={<ChevronsUpDown size={14} className="shrink-0 text-muted" />}
          className={cn(
            "justify-between data-[inline=true]:w-full data-[inline=true]:border data-[inline=true]:border-transparent data-[inline=true]:px-2.5 data-[inline=true]:text-[14px] data-[inline=true]:text-ink data-[inline=true]:hover:border-border data-[completed=true]:text-muted",
            className ?? "w-[230px]",
          )}
        >
          <span className={cn("min-w-0 flex-1 truncate text-left", completed && "line-through")}>
            {display}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        container={container}
        className="w-[var(--radix-popover-trigger-width)] min-w-[260px] p-0"
      >
        <Command
          label={label}
          filter={(value, search, keywords) =>
            compactLabel([value, ...(keywords ?? [])].join(" ")).includes(compactLabel(search))
              ? 1
              : 0
          }
        >
          <CommandInput
            value={query}
            onValueChange={setQuery}
            disabled={busy}
            placeholder={searchPlaceholder}
            aria-label={searchPlaceholder}
          />
          <CommandList id={listId}>
            <CommandEmpty>Sin resultados.</CommandEmpty>
            <CommandGroup>
              {allowAll && (
                <CommandItem
                  disabled={busy}
                  value="__all__"
                  keywords={[allLabel]}
                  onSelect={() => void choose("")}
                >
                  <Check className={cn(!selected && "text-brand", selected && "opacity-0")} />
                  {allLabel}
                </CommandItem>
              )}
              {options.map((option) => (
                <CommandItem
                  key={option.value}
                  value={option.value}
                  keywords={[option.label, ...(option.keywords ?? [])]}
                  disabled={busy}
                  onSelect={() => void choose(option.value)}
                >
                  <Check className={cn(value === option.value ? "text-brand" : "opacity-0")} />
                  <span className="min-w-0 flex-1">{option.label}</span>
                </CommandItem>
              ))}
              {canCreate && (
                <CommandItem
                  value={`__create__ ${createLabel}`}
                  onSelect={() => void choose(createLabel, true)}
                  disabled={busy}
                >
                  <Plus />
                  <span>Crear proceso «{createLabel}»</span>
                </CommandItem>
              )}
            </CommandGroup>
          </CommandList>
          {error && (
            <p role="alert" className="px-3 py-2 text-[12px] text-alert">
              {error}
            </p>
          )}
        </Command>
      </PopoverContent>
    </Popover>
  );
}
