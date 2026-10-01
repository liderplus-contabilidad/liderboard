"use client";

import { useState } from "react";
import { compactLabel } from "@/lib/text";
import type { CompanyFieldType } from "@/lib/operations/types";
import { InlineField } from "./inline-field";
import { SELECT_CLASS } from "./table-chrome";

export function CompanyFieldControl({
  id,
  label,
  value,
  fieldType,
  onCommit,
}: {
  id?: string;
  label: string;
  value: string;
  fieldType?: CompanyFieldType;
  onCommit: (value: string) => Promise<void>;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (!fieldType || fieldType.kind === "text")
    return (
      <InlineField
        id={id}
        label={label}
        value={value}
        appearance="field"
        placeholder="Agregar valor"
        onCommit={onCommit}
      />
    );
  const shown = draft ?? value;
  const checked = ["ok", "si", "true", "1", "x", "✓"].includes(compactLabel(shown));
  const unrecognized =
    shown.trim() && !checked && !["no", "false", "0"].includes(compactLabel(shown));
  const commit = async (next: string) => {
    setDraft(next);
    setBusy(true);
    setError("");
    try {
      await onCommit(next);
      setDraft(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo guardar. Inténtalo de nuevo.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div>
      {fieldType.kind === "select" ? (
        <select
          id={id}
          aria-label={label}
          aria-invalid={!!error}
          disabled={busy}
          value={shown}
          className={`${SELECT_CLASS} w-full font-normal`}
          onChange={(event) => void commit(event.target.value)}
        >
          <option value="">Seleccionar</option>
          {shown && !fieldType.options.includes(shown) && <option value={shown}>{shown}</option>}
          {fieldType.options.map((option) => (
            <option key={option}>{option}</option>
          ))}
        </select>
      ) : (
        <label className="flex min-h-[38px] cursor-pointer items-center gap-3 rounded-[9px] border border-border px-3 py-2 text-[13px] text-ink-soft hover:border-brand/40 focus-within:ring-2 focus-within:ring-brand-soft">
          <input
            id={id}
            aria-label={label}
            aria-invalid={!!error}
            type="checkbox"
            checked={checked}
            disabled={busy}
            className="h-4 w-4 cursor-pointer accent-brand"
            onChange={(event) => void commit(event.target.checked ? "OK" : "")}
          />
          {checked ? "Sí" : "No"}
        </label>
      )}
      {fieldType.kind === "checkbox" && unrecognized && (
        <p className="mt-1 text-[12px] text-muted">Valor actual: {shown}</p>
      )}
      {error && (
        <p role="alert" className="mt-1 text-[12px] text-alert">
          {error}
        </p>
      )}
    </div>
  );
}

export function CompanyFieldTypeEditor({
  type,
  onChange,
  disabled,
}: {
  type: CompanyFieldType;
  onChange: (type: CompanyFieldType) => void;
  disabled: boolean;
}) {
  return (
    <>
      <label className="block text-[11px] font-semibold text-faint">
        Tipo de dato
        <select
          aria-label="Tipo de dato"
          value={type.kind}
          disabled={disabled}
          className={`${SELECT_CLASS} mt-1.5 w-full`}
          onChange={(event) =>
            onChange({ ...type, kind: event.target.value as CompanyFieldType["kind"] })
          }
        >
          <option value="text">Texto libre</option>
          <option value="select">Lista de opciones</option>
          <option value="checkbox">Casilla de verificación</option>
        </select>
      </label>
      {type.kind === "select" && (
        <label className="block text-[11px] font-semibold text-faint">
          Opciones
          <textarea
            aria-label="Opciones del campo"
            placeholder={"Pendiente\nEn curso\nHecho"}
            value={type.options.join("\n")}
            disabled={disabled}
            onChange={(event) => onChange({ ...type, options: event.target.value.split("\n") })}
            rows={4}
            className="mt-1.5 w-full rounded-[9px] border border-border bg-surface px-3 py-2 text-[13px] font-normal text-ink outline-none focus:border-brand"
          />
          <span className="mt-1 block text-[11px] font-normal text-muted">
            Una opción por línea.
          </span>
        </label>
      )}
    </>
  );
}
