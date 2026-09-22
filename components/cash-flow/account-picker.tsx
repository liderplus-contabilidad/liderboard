"use client";

import { Plus } from "lucide-react";
import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/form-field";
import { Select } from "@/components/ui/select";
import * as cashDb from "@/lib/cash-flow/db";
import { accountLabel } from "@/lib/cash-flow/flow";
import { cn } from "@/lib/cn";
import { useCashFlowData } from "./cash-flow-data-provider";

const NONE = "";
const NEW = "__new__";

/**
 * The account select every form of this module shares, with «Nueva cuenta…» as its last option:
 * picking it unfolds a three-field row —banco · número · nombre— and «Crear» writes the account and
 * selects it, so registering a check never sends the user to «Configurar» first. The bank is what
 * a check's label is resolved against, so it is the one required field; the number and the name are
 * `Configurar`'s to complete.
 *
 * It renders a FRAGMENT: the select where the form puts it, and the creation box as a SIBLING the
 * form places with `creationClassName` — in a two-column form that is `col-span-2`, so three fields
 * and two buttons get the whole width instead of the select's half.
 */
export function AccountPicker({
  value,
  onChange,
  label = "Cuenta",
  emptyLabel = "Sin cuenta",
  disabled,
  allowNone = true,
  creationClassName,
}: {
  value: string | null;
  onChange: (accountId: string | null) => void;
  label?: string;
  /** What the empty option says — a check without an account says so with its bank label. */
  emptyLabel?: string;
  disabled?: boolean;
  allowNone?: boolean;
  /** Where the creation box lands in the parent's grid (`col-span-2` in a two-column form). */
  creationClassName?: string;
}) {
  const { activeClientId, accounts, centers } = useCashFlowData();
  const [creating, setCreating] = useState(false);
  const [bank, setBank] = useState("");
  const [number, setNumber] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | undefined>();

  const create = useCallback(async () => {
    if (!activeClientId) {
      return;
    }
    if (!bank.trim()) {
      setError("Escribe el banco: es lo que reconoce cada cheque.");
      return;
    }
    const account = await cashDb.addAccount(activeClientId, {
      bank,
      number,
      label: name,
      overdraft: 0,
      centerId: null,
    });
    onChange(account.id);
    setCreating(false);
    setBank("");
    setNumber("");
    setName("");
    setError(undefined);
  }, [activeClientId, bank, number, name, onChange]);

  return (
    <>
      <Select
        label={label}
        value={creating ? NEW : (value ?? NONE)}
        disabled={disabled}
        options={[
          ...(allowNone ? [{ value: NONE, label: emptyLabel }] : []),
          ...accounts.map((account) => ({
            value: account.id,
            label: accountLabel(account, centers),
          })),
          { value: NEW, label: "Nueva cuenta…" },
        ]}
        onChange={(event) => {
          if (event.target.value === NEW) {
            setCreating(true);
          } else {
            setCreating(false);
            onChange(event.target.value || null);
          }
        }}
      />
      {creating && (
        <div
          className={cn(
            "flex flex-col gap-2 rounded-[9px] border border-border bg-surface-muted p-3",
            creationClassName,
          )}
        >
          <TextField
            label="Banco"
            value={bank}
            error={error}
            placeholder="PRODUBANCO"
            onChange={(event) => {
              setBank(event.target.value);
              setError(undefined);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void create();
              }
            }}
          />
          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-2">
            <TextField
              label="Número"
              value={number}
              variant="mono"
              placeholder="Opcional"
              onChange={(event) => setNumber(event.target.value)}
            />
            <TextField
              label="Nombre"
              value={name}
              placeholder="Produbanco HA"
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <div className="flex items-center justify-end gap-2">
            <Button
              variant="secondary"
              size="sm"
              className="whitespace-nowrap"
              onClick={() => setCreating(false)}
            >
              Cancelar
            </Button>
            <Button
              size="sm"
              icon={<Plus size={13} />}
              className="whitespace-nowrap"
              onClick={() => void create()}
            >
              Crear cuenta
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
