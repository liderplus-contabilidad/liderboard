"use client";

import { working, accessFieldRole } from "@/lib/operations/model";
import { patchAccessField } from "@/lib/operations/db";
import type { Access } from "@/lib/operations/types";
import { InlineField } from "./inline-field";
import { useOperations } from "./operations-provider";

export function AccessDetail({ access }: { access: Access }) {
  const ops = useOperations();
  const current = ops.accesses.find((a) => a.id === access.id);
  if (!ops.key || !current) return null;
  const value = working(current),
    key = ops.key;
  const extra = current.fields.filter(
    (f) => !accessFieldRole(f.label) && (f.original || current.fieldEdits[f.key]),
  );
  const content = (
    <div className="space-y-4">
      <label htmlFor={`access-detail-email-${current.id}`} className="block text-[13px] text-muted">
        Correo registrado
        <InlineField
          appearance="field"
          className="mt-2"
          id={`access-detail-email-${current.id}`}
          value={value.email}
          label="Correo registrado"
          type="email"
          onCommit={(email) => ops.patchAccess(current.id, { email })}
        />
      </label>
      <label htmlFor={`access-detail-notes-${current.id}`} className="block text-[13px] text-muted">
        Notas
        <InlineField
          appearance="field"
          className="mt-2"
          id={`access-detail-notes-${current.id}`}
          value={value.notes}
          label="Notas del acceso"
          onCommit={(notes) => ops.patchAccess(current.id, { notes })}
        />
      </label>
      {extra.map((f) => (
        <label
          key={f.key}
          htmlFor={`access-field-${current.id}-${f.key}`}
          className="block text-[13px] text-muted"
        >
          {f.label}
          <InlineField
            appearance="field"
            className="mt-2"
            id={`access-field-${current.id}-${f.key}`}
            value={current.fieldEdits[f.key] ?? f.original}
            label={f.label}
            onCommit={(v) => ops.save(() => patchAccessField(current.id, f.key, v, key))}
          />
        </label>
      ))}
      <details className="border-t border-border-soft pt-4">
        <summary className="cursor-pointer text-[12px] text-muted">
          Datos originales del Excel
        </summary>
        <div className="mt-3 space-y-2">
          {current.fields.map((f) => (
            <div key={f.key} className="grid grid-cols-[1fr_1fr] gap-3 text-[12px]">
              <span className="text-muted">
                {f.label} · {f.address}
              </span>
              <input
                type={accessFieldRole(f.label) === "password" ? "password" : "text"}
                aria-label={`Original ${f.label}`}
                value={f.original}
                readOnly
                className="w-full bg-transparent font-mono text-[12px] text-ink tabular-nums"
              />
            </div>
          ))}
        </div>
      </details>
    </div>
  );
  return content;
}
