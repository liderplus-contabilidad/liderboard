"use client";

import { Plus } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxTrigger,
} from "@/components/ui/shadcn/combobox";
import { cn } from "@/lib/cn";
import { normalizeLabel } from "@/lib/workspaces";

export interface CreatableOption {
  value: string;
  label: string;
  /** Search may include fields absent from the displayed label, such as a bank or account number. */
  search?: string;
}

interface SearchableCreatableSelectProps {
  value: string | null;
  options: readonly CreatableOption[];
  onChange: (value: string | null) => void;
  onCreate: (query: string) => void | Promise<void>;
  ariaLabel: string;
  placeholder: string;
  searchLabel: string;
  searchPlaceholder: string;
  createLabel: (query: string) => string;
  /** A typed label can be selected before it is saved into the options catalogue. */
  valueLabel?: string;
  clearLabel?: string;
  allowCreate?: boolean;
  allowCreateMatching?: boolean;
  creationError?: string;
  disabled?: boolean;
  openOnMount?: boolean;
  variant?: "field" | "cell";
  popupWidth?: number;
}

interface Choice extends CreatableOption {
  action?: "clear" | "create";
}

/** One search, selection and creation surface for accounts, beneficiaries and free labels.
 * The caller owns persistence; the primitive owns focus, keyboard navigation and creation state. */
export function SearchableCreatableSelect({
  value,
  options,
  onChange,
  onCreate,
  ariaLabel,
  placeholder,
  searchLabel,
  searchPlaceholder,
  createLabel,
  valueLabel,
  clearLabel,
  allowCreate = true,
  allowCreateMatching = false,
  creationError = "No se pudo agregar. Intenta de nuevo.",
  disabled = false,
  openOnMount = false,
  variant = "field",
  popupWidth = 380,
}: SearchableCreatableSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const creatingRef = useRef(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [portalContainer, setPortalContainer] = useState<HTMLElement | null>(null);
  useEffect(() => {
    if (openOnMount) {
      setPortalContainer(triggerRef.current?.closest("dialog") ?? null);
      triggerRef.current?.focus();
      setOpen(true);
    }
  }, [openOnMount]);
  const selected =
    options.find((option) => option.value === value) ??
    (value && valueLabel ? { value, label: valueLabel } : null);
  const normalized = normalizeLabel(query);
  const matches = options.filter((option) =>
    normalizeLabel(option.search ?? option.label).includes(normalized),
  );
  const existing = options.some((option) => normalizeLabel(option.label) === normalized);
  const clear: Choice = { value: "", label: clearLabel ?? placeholder, action: "clear" };
  const creation: Choice = {
    value: "",
    label: busy ? "Agregando…" : createLabel(query.trim()),
    action: "create",
  };
  const choices: Choice[] = [
    ...(clearLabel && !normalized ? [clear] : []),
    ...matches,
    ...(allowCreate && query.trim() && (allowCreateMatching || !existing) ? [creation] : []),
  ];
  const create = async () => {
    if (creatingRef.current || !query.trim()) return;
    creatingRef.current = true;
    setBusy(true);
    setError(undefined);
    try {
      await onCreate(query.trim());
      setOpen(false);
      triggerRef.current?.focus();
    } catch {
      setError(creationError);
    } finally {
      creatingRef.current = false;
      setBusy(false);
    }
  };
  const closeOnEscape = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== "Escape" || !open) return;
    // The trigger retains focus until the popup's input is mounted. Guard both surfaces so
    // native dialog cancellation cannot discard the draft in that interval either.
    event.preventDefault();
    event.stopPropagation();
    if (!busy) {
      setOpen(false);
      triggerRef.current?.focus();
    }
  };
  return (
    <Combobox<Choice>
      autoHighlight
      items={[
        ...options,
        ...(selected && !options.includes(selected) ? [selected] : []),
        clear,
        creation,
      ]}
      filteredItems={choices}
      value={selected}
      itemToStringLabel={(item) => item.label}
      isItemEqualToValue={(item, current) =>
        item.value === current.value && item.action === current.action
      }
      inputValue={query}
      onInputValueChange={(text) => {
        setQuery(text);
        setError(undefined);
      }}
      open={open}
      onOpenChange={(next) => {
        if (busy) return;
        // Native modal dialogs occupy the browser's top layer: a body portal would be inert
        // behind them, so the same control portals inside its owning dialog when there is one.
        if (next) setPortalContainer(triggerRef.current?.closest("dialog") ?? null);
        setOpen(next);
        setQuery("");
        setError(undefined);
      }}
      disabled={disabled}
      onValueChange={(choice, details) => {
        if (choice?.action === "create") {
          details.cancel();
          void create();
        } else {
          onChange(choice?.action === "clear" ? null : (choice?.value ?? null));
        }
      }}
    >
      <ComboboxTrigger
        ref={triggerRef}
        aria-label={selected ? `${ariaLabel}: ${selected.label}` : ariaLabel}
        disabled={disabled || busy}
        onKeyDownCapture={closeOnEscape}
        className={variant === "cell" ? "h-8" : "h-[38px]"}
      >
        <span className={cn("min-w-0 flex-1 truncate text-left", !selected && "text-muted")}>
          {selected?.label ?? placeholder}
        </span>
      </ComboboxTrigger>
      <ComboboxContent
        aria-label={ariaLabel}
        style={{ width: popupWidth }}
        portalContainer={portalContainer}
        onKeyDownCapture={closeOnEscape}
      >
        <ComboboxInput aria-label={searchLabel} placeholder={searchPlaceholder} disabled={busy} />
        <ComboboxEmpty>Sin coincidencias.</ComboboxEmpty>
        <ComboboxList>
          {(choice: Choice) => (
            <ComboboxItem key={choice.action ?? choice.value} value={choice} disabled={busy}>
              {choice.action === "create" && <Plus aria-hidden />}
              <span className="min-w-0 break-words">{choice.label}</span>
            </ComboboxItem>
          )}
        </ComboboxList>
        {error && (
          <p role="alert" className="px-2 pt-2 text-[12px] text-negative">
            {error}
          </p>
        )}
      </ComboboxContent>
    </Combobox>
  );
}

interface CreatableSelectProps {
  value: string;
  options: readonly string[];
  onChange: (value: string) => void;
  ariaLabel: string;
  placeholder: string;
  searchLabel: string;
  searchPlaceholder: string;
  createLabel: string | ((query: string) => string);
  clearLabel?: string;
  openOnMount?: boolean;
  variant?: "field" | "cell";
  popupWidth?: number;
}

/** String labels use the same control as accounts, without needing an id or asynchronous write. */
export function CreatableSelect({
  value,
  options,
  onChange,
  createLabel,
  ...props
}: CreatableSelectProps) {
  const choices = useMemo(() => options.map((label) => ({ value: label, label })), [options]);
  return (
    <SearchableCreatableSelect
      {...props}
      value={value || null}
      valueLabel={value}
      options={choices}
      onChange={(next) => onChange(next ?? "")}
      onCreate={onChange}
      createLabel={
        typeof createLabel === "function" ? createLabel : (query) => `${createLabel} «${query}»`
      }
    />
  );
}
