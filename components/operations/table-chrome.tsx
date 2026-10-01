"use client";

import { Search, X } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { working } from "@/lib/operations/model";
import { cn } from "@/lib/cn";
import { useOperations } from "./operations-provider";

export const SELECT_CLASS =
  "h-[34px] rounded-[9px] border border-border bg-surface px-2.5 text-[13px] text-ink outline-none focus:border-brand";
export const CELL_CLASS = "border-t border-border-soft px-2.5 py-2 text-[13px] text-ink";

export function OperationsToolbar({
  children,
  placeholder = "Buscar empresa, RUC o servicio",
  companyFilter = true,
}: {
  children?: ReactNode;
  placeholder?: string;
  companyFilter?: boolean;
}) {
  const ops = useOperations();
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2.5">
      <label className="flex h-[34px] min-w-[220px] flex-1 items-center gap-2 rounded-[9px] border border-border bg-surface px-3 text-muted">
        <Search size={15} />
        <input
          aria-label={placeholder}
          value={ops.search}
          onChange={(e) => ops.setSearch(e.target.value)}
          placeholder={placeholder}
          className="w-full bg-transparent text-[13px] text-ink outline-none"
        />
      </label>
      {companyFilter && ops.companies.length > 1 && (
        <select
          aria-label="Empresa"
          className={`${SELECT_CLASS} max-w-[260px]`}
          value={ops.companyId}
          onChange={(e) => ops.setCompanyId(e.target.value)}
        >
          <option value="">Todas las empresas</option>
          {ops.companies.map((c) => (
            <option key={c.id} value={c.id}>
              {working(c).name}
            </option>
          ))}
        </select>
      )}
      {children}
    </div>
  );
}

export function OperationsTable({
  headers,
  children,
  empty,
  columnWidths,
  tableClassName,
}: {
  headers: string[];
  children: ReactNode;
  empty?: string;
  columnWidths?: (number | string)[];
  tableClassName?: string;
}) {
  return (
    <div className="overflow-auto rounded-[13px] border border-border bg-surface">
      <table className={cn("w-full border-collapse text-left", tableClassName)}>
        {columnWidths && (
          <colgroup>
            {columnWidths.map((width, index) => (
              <col key={index} style={{ width }} />
            ))}
          </colgroup>
        )}
        <thead className="sticky top-0 z-10 bg-surface-header">
          <tr>
            {headers.map((h, i) => (
              <th
                scope="col"
                key={`${h}:${i}`}
                className="whitespace-nowrap px-3 py-3 text-[12px] font-semibold text-muted"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {empty ? (
            <tr>
              <td colSpan={headers.length} className="px-5 py-14 text-center text-sm text-muted">
                {empty}
              </td>
            </tr>
          ) : (
            children
          )}
        </tbody>
      </table>
    </div>
  );
}

export function OperationsStatus({ count }: { count: string }) {
  const ops = useOperations();
  return (
    <>
      <div className="mt-3 flex items-center justify-between gap-3 text-[12px] text-muted">
        <span className="tabular-nums">{count}</span>
        <span aria-live="polite">
          {ops.saving ? "Guardando…" : ops.error ? "Cambios sin guardar" : "Guardado"}
        </span>
      </div>
      {ops.error && (
        <div
          role="alert"
          className="mt-3 flex items-center justify-between gap-3 rounded-[9px] bg-warning/10 px-4 py-3 text-[13px] text-warning"
        >
          <span>{ops.error}</span>
          <Button
            variant="ghost"
            size="sm"
            iconOnly
            icon={<X size={14} />}
            aria-label="Cerrar mensaje"
            onClick={ops.clearError}
          />
        </div>
      )}
    </>
  );
}
