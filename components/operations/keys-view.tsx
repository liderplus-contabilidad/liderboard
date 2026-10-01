"use client";

import { ArrowUpRight, LockKeyhole, Plus } from "lucide-react";
import { memo, useCallback, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { companySelection } from "@/lib/operations/company-filters";
import { addCompany, deleteCompany } from "@/lib/operations/db";
import { searchText, working } from "@/lib/operations/model";
import type { Company, CompanyValues } from "@/lib/operations/types";
import { CompanyDetail } from "./company-detail";
import { CompanyFilters } from "./company-filters";
import { InlineField } from "./inline-field";
import { useOperations } from "./operations-provider";
import { DeleteRow } from "./row-actions";
import { CELL_CLASS, OperationsStatus, OperationsTable, OperationsToolbar } from "./table-chrome";
import { VaultGate } from "./vault-gate";

export function KeysView() {
  const ops = useOperations();
  const [busy, setBusy] = useState(false);
  const [companyMark, setCompanyMark] = useState("");
  const [groupMark, setGroupMark] = useState("");
  const selection = useMemo(
    () => companySelection(ops.companies, groupMark, companyMark),
    [ops.companies, groupMark, companyMark],
  );
  const { companyId: companyFilter, groupId: groupFilter } = selection;
  const changeGroup = useCallback(
    (group: string) => {
      setGroupMark(group);
      setCompanyMark((current) => companySelection(ops.companies, group, current).companyId);
    },
    [ops.companies],
  );
  const query = searchText(ops.search);
  const companies = ops.companies.filter((c) => {
    const v = working(c);
    return (
      (!companyFilter || c.id === companyFilter) &&
      (!groupFilter || v.group.trim() === groupFilter) &&
      searchText(v.name, v.ruc, v.group, v.system).includes(query)
    );
  });
  const company = ops.companies.find((c) => c.id === ops.detailCompanyId);
  if (ops.loading) return <output className="block p-7 text-sm text-muted">Cargando…</output>;
  if (company)
    return <CompanyDetail company={company} embedded onClose={() => ops.setDetailCompanyId("")} />;
  return (
    <div className="px-7 py-5">
      <OperationsToolbar placeholder="Buscar empresa, RUC o grupo" companyFilter={false}>
        <CompanyFilters
          selection={selection}
          onGroupChange={changeGroup}
          onCompanyChange={setCompanyMark}
        />
        <Button
          size="toolbar"
          icon={<Plus size={14} />}
          disabled={busy}
          onClick={async () => {
            if (busy) return;
            setBusy(true);
            try {
              ops.setDetailCompanyId(await ops.save(addCompany));
            } catch {
              /* Provider keeps the save error visible. */
            } finally {
              setBusy(false);
            }
          }}
        >
          Nueva empresa
        </Button>
        {ops.unlocked ? (
          <Button
            size="toolbar"
            variant="ghost"
            icon={<LockKeyhole size={14} />}
            onClick={ops.lock}
          >
            Bloquear claves
          </Button>
        ) : (
          <VaultGate />
        )}
      </OperationsToolbar>
      <OperationsTable
        headers={["Empresa", "RUC", "Grupo", "Sistema", "Día declaración", "", ""]}
        empty={
          companies.length
            ? undefined
            : ops.companies.length
              ? "Sin resultados"
              : "Agrega una empresa o carga el Excel de claves."
        }
      >
        {companies.map((company) => (
          <CompanyRow
            key={company.id}
            company={company}
            patch={ops.patchCompany}
            onDetail={(company) => ops.setDetailCompanyId(company.id)}
          />
        ))}
      </OperationsTable>
      <OperationsStatus count={`${companies.length} empresas`} />
    </div>
  );
}

const CompanyRow = memo(function CompanyRow({
  company,
  patch,
  onDetail,
}: {
  company: Company;
  patch: (id: string, patch: Partial<CompanyValues>) => Promise<void>;
  onDetail: (c: Company) => void;
}) {
  const v = working(company);
  return (
    <tr>
      <td className={`${CELL_CLASS} min-w-[210px]`}>
        <InlineField
          value={v.name}
          label="Nombre de empresa"
          onCommit={(name) => patch(company.id, { name })}
        />
      </td>
      <td className={`${CELL_CLASS} min-w-[165px]`}>
        <InlineField
          className="font-mono tabular-nums"
          value={v.ruc}
          label="RUC"
          onCommit={(ruc) => patch(company.id, { ruc })}
        />
      </td>
      <td className={`${CELL_CLASS} min-w-[140px]`}>
        <InlineField
          value={v.group}
          label="Grupo"
          onCommit={(group) => patch(company.id, { group })}
        />
      </td>
      <td className={`${CELL_CLASS} min-w-[130px]`}>
        <InlineField
          value={v.system}
          label="Sistema contable"
          onCommit={(system) => patch(company.id, { system })}
        />
      </td>
      <td className={`${CELL_CLASS} w-[120px]`}>
        <InlineField
          value={v.declarationDay}
          label="Día de declaración"
          className="font-mono tabular-nums"
          onCommit={(declarationDay) => patch(company.id, { declarationDay })}
        />
      </td>
      <td className={CELL_CLASS}>
        <Button
          size="sm"
          variant="ghost"
          icon={<ArrowUpRight size={14} />}
          onClick={() => onDetail(company)}
        >
          Abrir
        </Button>
      </td>
      <td className={CELL_CLASS}>
        <DeleteRow
          label={v.name}
          description="Se eliminarán la empresa, sus accesos, obligaciones y tareas. El archivo original importado se conserva como respaldo."
          onDelete={() => deleteCompany(company.id)}
        />
      </td>
    </tr>
  );
});
