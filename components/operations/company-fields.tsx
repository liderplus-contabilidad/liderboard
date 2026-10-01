"use client";

import { useId, useMemo, useRef, useState } from "react";
import { MoreHorizontal, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { companyFieldSections } from "@/lib/operations/company-fields";
import {
  changeCompanyFields,
  patchCompanyField,
  type CompanyFieldAction,
} from "@/lib/operations/db";
import type { Company, SourceField } from "@/lib/operations/types";
import { CompanyFieldControl } from "./company-field-control";
import { CreateInformation, ConfigureCompanyFieldForm } from "./company-field-form";
import { useOperations } from "./operations-provider";
import { DeleteRow } from "./row-actions";
import { SELECT_CLASS } from "./table-chrome";

export function CompanyFields({ company }: { company: Company }) {
  const ops = useOperations();
  const sections = useMemo(() => companyFieldSections(company), [company]);
  const [mark, setMark] = useState("");
  const active = sections.find((section) => section.label === mark) ?? sections[0];
  const [creating, setCreating] = useState<"tab" | "field" | null>(null);
  const [configuring, setConfiguring] = useState<SourceField | null>(null);
  const id = useId();
  const save = async (action: CompanyFieldAction) => {
    await ops.save(() => changeCompanyFields(company.id, action));
  };
  if (company.detailsPending) return null;
  return (
    <section className="border-t border-border-soft pt-5" aria-label="Información adicional">
      <div className="mb-4 flex items-center justify-between gap-4">
        <h3 className="text-[15px] font-semibold text-brand">Información adicional</h3>
        <>
          <div className="flex items-center gap-2">
            <Button
              size="toolbar"
              variant="ghost"
              icon={<Plus size={14} />}
              onClick={() => setCreating("tab")}
            >
              Nueva pestaña
            </Button>
            <Button size="toolbar" icon={<Plus size={14} />} onClick={() => setCreating("field")}>
              Agregar campo
            </Button>
          </div>
        </>
      </div>
      {active ? (
        <>
          <div
            role="tablist"
            aria-label="Pestañas de información adicional"
            className="mb-5 flex gap-1 overflow-x-auto border-b border-border-soft"
          >
            {sections.map((section, index) => (
              <button
                key={section.label}
                id={`${id}-tab-${index}`}
                type="button"
                role="tab"
                aria-selected={section === active}
                aria-controls={`${id}-panel`}
                tabIndex={section === active ? 0 : -1}
                onClick={() => setMark(section.label)}
                onKeyDown={(event) => {
                  let next: number;
                  if (event.key === "ArrowRight") next = (index + 1) % sections.length;
                  else if (event.key === "ArrowLeft")
                    next = (index + sections.length - 1) % sections.length;
                  else if (event.key === "Home") next = 0;
                  else if (event.key === "End") next = sections.length - 1;
                  else return;
                  event.preventDefault();
                  setMark(sections[next].label);
                  document.getElementById(`${id}-tab-${next}`)?.focus();
                }}
                className={`flex shrink-0 items-center gap-2 border-b-2 px-3 py-3 text-[13px] font-medium outline-none transition-colors focus-visible:bg-brand-soft ${section === active ? "border-brand text-brand" : "border-transparent text-muted hover:text-ink"}`}
              >
                {section.label}
                <span className="rounded-full bg-canvas px-1.5 font-mono text-[11px] text-muted tabular-nums">
                  {section.fields.length}
                </span>
              </button>
            ))}
          </div>
          <div
            id={`${id}-panel`}
            role="tabpanel"
            aria-labelledby={`${id}-tab-${sections.indexOf(active)}`}
            tabIndex={0}
            className="outline-none focus-visible:ring-2 focus-visible:ring-brand-soft"
          >
            {active.fields.length ? (
              <div className="grid grid-cols-2 gap-x-7 gap-y-5">
                {active.fields.map((field) => (
                  <div key={field.key} className="min-w-0">
                    <div className="mb-1.5 flex min-h-8 items-center justify-between gap-2">
                      <label
                        htmlFor={`${id}-field-${field.key}`}
                        className="text-[13px] font-medium leading-relaxed text-ink-soft"
                      >
                        {field.label}
                      </label>
                      <FieldActions
                        label={field.label}
                        category={active.label}
                        sections={sections.map((s) => s.label)}
                        custom={!!company.customFields?.some((f) => f.key === field.key)}
                        onMove={(category) =>
                          save({ type: "move-field", fieldKey: field.key, category })
                        }
                        onDelete={() => save({ type: "remove-field", fieldKey: field.key })}
                        onConfigure={() => setConfiguring(field)}
                      />
                    </div>
                    <CompanyFieldControl
                      id={`${id}-field-${field.key}`}
                      label={field.label}
                      fieldType={company.fieldTypes?.[field.key]}
                      value={company.fieldEdits[field.key] ?? field.original}
                      onCommit={(value) => {
                        return ops.save(() => patchCompanyField(company.id, field.key, value));
                      }}
                    />
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-[9px] border border-dashed border-border px-5 py-7 text-center">
                <p className="mb-3 text-[13px] text-muted">Esta pestaña aún no tiene campos.</p>
                <Button
                  size="toolbar"
                  variant="secondary"
                  icon={<Plus size={14} />}
                  onClick={() => setCreating("field")}
                >
                  Agregar primer campo
                </Button>
              </div>
            )}
          </div>
        </>
      ) : (
        <p className="rounded-[9px] border border-dashed border-border px-5 py-7 text-center text-[13px] text-muted">
          Agrega campos para guardar más información de esta empresa.
        </p>
      )}
      {creating && (
        <CreateInformation
          kind={creating}
          sections={sections.map((s) => s.label)}
          initialCategory={active?.label ?? "Otros"}
          onClose={() => setCreating(null)}
          onSave={async (action) => {
            await save(action);
            setMark(
              action.type === "add-tab"
                ? action.label.trim().replace(/\s+/g, " ")
                : action.type === "add-field"
                  ? action.category
                  : "",
            );
            setCreating(null);
          }}
        />
      )}
      {configuring && (
        <ConfigureCompanyFieldForm
          label={configuring.label}
          initialType={company.fieldTypes?.[configuring.key]}
          onClose={() => setConfiguring(null)}
          onSave={async (fieldType) => {
            await save({ type: "configure-field", fieldKey: configuring.key, fieldType });
            setConfiguring(null);
          }}
        />
      )}
    </section>
  );
}

function FieldActions({
  label,
  category,
  sections,
  custom,
  onMove,
  onDelete,
  onConfigure,
}: {
  label: string;
  category: string;
  sections: string[];
  custom: boolean;
  onMove: (category: string) => Promise<void>;
  onDelete: () => Promise<void>;
  onConfigure: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [container, setContainer] = useState<HTMLElement | null>(null);
  const ref = useRef<HTMLButtonElement>(null);
  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (busy) return;
        if (next) {
          setError("");
          setContainer(ref.current?.closest("dialog") ?? null);
        }
        setOpen(next);
      }}
    >
      <PopoverTrigger asChild>
        <Button
          ref={ref}
          size="sm"
          variant="ghost"
          iconOnly
          icon={<MoreHorizontal size={15} />}
          aria-label={`Opciones de campo ${label}`}
          className="shrink-0"
        />
      </PopoverTrigger>
      <PopoverContent container={container} align="end" className="w-[240px] space-y-3 p-3">
        <Button
          size="toolbar"
          variant="ghost"
          className="w-full justify-start"
          onClick={() => {
            setOpen(false);
            onConfigure();
          }}
        >
          Configurar tipo de dato
        </Button>
        <label className="block text-[12px] font-medium text-ink-soft">
          Mover a pestaña
          <select
            aria-label={`Mover ${label} a pestaña`}
            className={`${SELECT_CLASS} mt-2 w-full`}
            disabled={busy}
            value={category}
            onChange={async (event) => {
              setBusy(true);
              setError("");
              try {
                await onMove(event.target.value);
                setOpen(false);
              } catch (cause) {
                setError(cause instanceof Error ? cause.message : "No se pudo mover el campo.");
              } finally {
                setBusy(false);
              }
            }}
          >
            {sections.map((section) => (
              <option key={section}>{section}</option>
            ))}
          </select>
        </label>
        {custom && (
          <div className="flex items-center justify-between border-t border-border-soft pt-2 text-[12px] text-muted">
            Eliminar campo{" "}
            <DeleteRow
              label={`campo ${label}`}
              description="Se eliminará este campo y su valor de esta empresa."
              onDelete={onDelete}
            />
          </div>
        )}
        {error && (
          <p role="alert" className="text-[12px] text-alert">
            {error}
          </p>
        )}
      </PopoverContent>
    </Popover>
  );
}
