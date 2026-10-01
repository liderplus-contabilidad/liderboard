"use client";

import { useRef, useState } from "react";
import { UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FieldBox, FormField } from "@/components/ui/form-field";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export function TaskAssigneeField({
  value,
  label,
  onCommit,
}: {
  value: string;
  label: string;
  onCommit: (person: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [container, setContainer] = useState<HTMLElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (busy) return;
        if (next) {
          setDraft(value);
          setFailed(false);
          setContainer(triggerRef.current?.closest("dialog") ?? null);
        }
        setOpen(next);
      }}
    >
      <PopoverTrigger asChild>
        <Button
          ref={triggerRef}
          size="sm"
          variant="secondary"
          icon={<UserRound size={12} />}
          aria-label={label}
          title={value || "Asignar responsable"}
          disabled={busy}
        >
          <span className="max-w-[120px] truncate font-normal">{value || "Asignar"}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        container={container}
        aria-label="Asignar responsable"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          inputRef.current?.focus();
        }}
      >
        <form
          className="flex flex-col gap-3 p-3"
          onSubmit={async (event) => {
            event.preventDefault();
            if (busy) return;
            setBusy(true);
            setFailed(false);
            try {
              await onCommit(draft.trim());
              setOpen(false);
            } catch {
              setFailed(true);
            } finally {
              setBusy(false);
            }
          }}
        >
          <FormField
            label="Responsable"
            error={failed ? "No se guardó. Inténtalo de nuevo." : undefined}
          >
            <FieldBox invalid={failed}>
              <input
                ref={inputRef}
                aria-label="Nombre del responsable"
                aria-invalid={failed || undefined}
                value={draft}
                disabled={busy}
                placeholder="Nombre del responsable"
                onChange={(event) => setDraft(event.target.value)}
                className="w-full bg-transparent text-[13px] text-ink outline-none placeholder:text-muted"
              />
            </FieldBox>
          </FormField>
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button size="sm" type="submit" disabled={busy}>
              {busy ? "Guardando…" : "Guardar"}
            </Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  );
}
