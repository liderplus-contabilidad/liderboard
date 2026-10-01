"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { TextField } from "@/components/ui/form-field";
import type { CompanyFieldType } from "@/lib/operations/types";
import type { CompanyFieldAction } from "@/lib/operations/db";
import { CompanyFieldTypeEditor } from "./company-field-control";
import { SELECT_CLASS } from "./table-chrome";

export function CreateInformation({
  kind,
  sections,
  initialCategory,
  onClose,
  onSave,
}: {
  kind: "tab" | "field";
  sections: string[];
  initialCategory: string;
  onClose: () => void;
  onSave: (action: CompanyFieldAction) => Promise<void>;
}) {
  const [label, setLabel] = useState("");
  const [category, setCategory] = useState(initialCategory);
  const [value, setValue] = useState("");
  const [fieldType, setFieldType] = useState<CompanyFieldType>({ kind: "text", options: [] });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <Modal
      open
      title={kind === "tab" ? "Nueva pestaña" : "Agregar campo"}
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <form
        className="space-y-4"
        onSubmit={async (event) => {
          event.preventDefault();
          if (busy || !label.trim()) return;
          setBusy(true);
          setError("");
          try {
            await onSave(
              kind === "tab"
                ? { type: "add-tab", label }
                : { type: "add-field", category, label, value, fieldType },
            );
          } catch (cause) {
            setError(
              cause instanceof Error ? cause.message : "No se pudo guardar. Inténtalo de nuevo.",
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        <TextField
          label={kind === "tab" ? "Nombre de la pestaña" : "Nombre del campo"}
          placeholder={kind === "tab" ? "Ej. Documentación" : "Ej. Contacto administrativo"}
          value={label}
          required
          disabled={busy}
          onChange={(event) => setLabel(event.target.value)}
        />
        {kind === "field" && (
          <>
            <label className="block text-[11px] font-semibold text-faint">
              Pestaña
              <select
                aria-label="Pestaña del nuevo campo"
                className={`${SELECT_CLASS} mt-1.5 w-full`}
                disabled={busy}
                value={category}
                onChange={(event) => setCategory(event.target.value)}
              >
                {(sections.length ? sections : [initialCategory]).map((section) => (
                  <option key={section}>{section}</option>
                ))}
              </select>
            </label>
            <CompanyFieldTypeEditor
              type={fieldType}
              disabled={busy}
              onChange={(next) => {
                if (next.kind !== fieldType.kind) setValue("");
                setFieldType(next);
              }}
            />
            {fieldType.kind === "checkbox" ? (
              <label className="flex items-center gap-3 text-[13px] text-ink-soft">
                <input
                  aria-label="Valor inicial"
                  type="checkbox"
                  checked={value === "OK"}
                  disabled={busy}
                  className="h-4 w-4 accent-brand"
                  onChange={(event) => setValue(event.target.checked ? "OK" : "")}
                />{" "}
                Marcado al crear
              </label>
            ) : fieldType.kind === "select" ? (
              <label className="block text-[11px] font-semibold text-faint">
                Valor inicial
                <select
                  aria-label="Valor inicial"
                  className={`${SELECT_CLASS} mt-1.5 w-full`}
                  value={value}
                  disabled={busy}
                  onChange={(event) => setValue(event.target.value)}
                >
                  <option value="">Sin seleccionar</option>
                  {[
                    ...new Set(fieldType.options.map((option) => option.trim()).filter(Boolean)),
                  ].map((option) => (
                    <option key={option}>{option}</option>
                  ))}
                </select>
              </label>
            ) : (
              <TextField
                label="Valor"
                placeholder="Puedes completarlo después"
                value={value}
                disabled={busy}
                onChange={(event) => setValue(event.target.value)}
              />
            )}
          </>
        )}
        {error && (
          <p role="alert" className="text-[13px] text-alert">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2 border-t border-border-soft pt-4">
          <Button size="toolbar" variant="secondary" disabled={busy} onClick={onClose}>
            Cancelar
          </Button>
          <Button size="toolbar" type="submit" disabled={busy || !label.trim()}>
            {busy ? "Guardando…" : kind === "tab" ? "Crear pestaña" : "Agregar campo"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export function ConfigureCompanyFieldForm({
  label,
  initialType,
  onClose,
  onSave,
}: {
  label: string;
  initialType?: CompanyFieldType;
  onClose: () => void;
  onSave: (type: CompanyFieldType) => Promise<void>;
}) {
  const [type, setType] = useState<CompanyFieldType>(initialType ?? { kind: "text", options: [] });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <Modal
      open
      title="Configurar campo"
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <form
        className="space-y-4"
        onSubmit={async (event) => {
          event.preventDefault();
          if (busy) return;
          setBusy(true);
          setError("");
          try {
            await onSave(type);
          } catch (cause) {
            setError(cause instanceof Error ? cause.message : "No se pudo guardar.");
          } finally {
            setBusy(false);
          }
        }}
      >
        <p className="text-[13px] font-medium text-ink">{label}</p>
        <CompanyFieldTypeEditor type={type} onChange={setType} disabled={busy} />
        {error && (
          <p role="alert" className="text-[13px] text-alert">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2 border-t border-border-soft pt-4">
          <Button size="toolbar" variant="secondary" disabled={busy} onClick={onClose}>
            Cancelar
          </Button>
          <Button size="toolbar" type="submit" disabled={busy}>
            {busy ? "Guardando…" : "Guardar"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
