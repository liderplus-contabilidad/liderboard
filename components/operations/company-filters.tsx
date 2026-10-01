"use client";

import { Building2, Layers } from "lucide-react";
import { SearchableSelect } from "@/components/ui/searchable-select";
import type { companySelection } from "@/lib/operations/company-filters";

export function CompanyFilters({
  selection,
  onGroupChange,
  onCompanyChange,
}: {
  selection: ReturnType<typeof companySelection>;
  onGroupChange: (group: string) => void;
  onCompanyChange: (company: string) => void;
}) {
  return (
    <>
      <SearchableSelect
        label="Grupo"
        value={selection.groupId}
        options={selection.groups}
        onChange={onGroupChange}
        allLabel="Todos los grupos"
        searchPlaceholder="Buscar grupo…"
        icon={<Layers size={14} />}
        className="w-[190px]"
      />
      <SearchableSelect
        label="Empresa"
        value={selection.companyId}
        options={selection.options}
        onChange={onCompanyChange}
        allLabel={selection.groupId ? "Empresas del grupo" : "Todas las empresas"}
        searchPlaceholder="Buscar empresa o RUC…"
        icon={<Building2 size={14} />}
      />
    </>
  );
}
