"use client";

import { ArrowLeft, CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SidePanel } from "@/components/ui/side-panel";
import { working } from "@/lib/operations/model";
import type { Company, CompanyValues } from "@/lib/operations/types";
import { InlineField } from "./inline-field";
import { useOperations } from "./operations-provider";
import { CompanyAccesses } from "./company-accesses";
import { CompanyFields } from "./company-fields";
import { CompanyTaxFields } from "./company-tax-fields";
import { VaultGate } from "./vault-gate";
import { OperationsStatus } from "./table-chrome";

export function CompanyDetail({
  company,
  onClose,
  embedded = false,
  onSchedule,
}: {
  company: Company;
  onClose: () => void;
  embedded?: boolean;
  onSchedule?: () => void;
}) {
  const ops = useOperations();
  const current = ops.companies.find((c) => c.id === company.id) ?? company;
  const values = working(current);
  const taskCount = ops.tasks.filter((task) => task.companyId === current.id).length;
  const content = (
    <div className="space-y-7">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[13px] text-muted">Datos y credenciales de esta empresa.</p>
        <Button
          size="toolbar"
          icon={<CalendarDays size={14} />}
          onClick={onSchedule ?? (() => ops.openCompanySchedule(current.id))}
        >
          Ver cronograma
        </Button>
      </div>
      <section>
        <h3 className="mb-3 text-[15px] font-semibold text-brand">Datos de la empresa</h3>
        {current.detailsPending && (
          <div className="mb-4 flex items-center justify-between gap-4 rounded-[9px] border border-border bg-canvas px-4 py-3">
            <p className="text-[13px] text-muted">
              Desbloquea las credenciales una vez para recuperar los campos anteriores. Después
              podrás editarlos sin contraseña.
            </p>
            <VaultGate label="Recuperar campos" />
          </div>
        )}
        <div className="grid grid-cols-2 gap-x-7 gap-y-4">
          {(
            [
              ["name", "Empresa"],
              ["ruc", "RUC"],
              ["group", "Grupo"],
              ["system", "Sistema contable"],
              ["declarationDay", "Día declaración"],
              ["periodicity", "Periodicidad"],
              ["notes", "Notas"],
            ] as [keyof CompanyValues, string][]
          ).map(([key, label]) => (
            <label
              key={key}
              htmlFor={`company-core-${key}`}
              className={`block text-[13px] font-medium text-ink-soft ${key === "notes" ? "col-span-2" : ""}`}
            >
              {label}
              <InlineField
                appearance="field"
                className="mt-2 font-normal"
                id={`company-core-${key}`}
                value={values[key]}
                label={label}
                onCommit={(v) => ops.patchCompany(current.id, { [key]: v })}
              />
            </label>
          ))}
          <CompanyTaxFields key={current.id} company={current} />
        </div>
      </section>
      <CompanyAccesses companyId={current.id} />
      <CompanyFields key={current.id} company={current} />
      <OperationsStatus count={`${taskCount} tareas`} />
    </div>
  );
  if (!embedded)
    return (
      <SidePanel title={values.name} width={900} onClose={onClose}>
        {content}
      </SidePanel>
    );
  return (
    <div className="min-h-full bg-surface px-7 py-5">
      <div className="mb-5 flex items-center gap-4">
        <Button size="toolbar" variant="ghost" icon={<ArrowLeft size={14} />} onClick={onClose}>
          Empresas
        </Button>
        <h2 className="text-[20px] font-semibold text-brand">{values.name}</h2>
      </div>
      {content}
    </div>
  );
}
