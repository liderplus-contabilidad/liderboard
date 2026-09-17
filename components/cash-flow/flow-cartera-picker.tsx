"use client";

import { FileText } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { EmptyState } from "@/components/ui/empty-state";
import { Modal } from "@/components/ui/modal";
import { SearchInput } from "@/components/ui/search-input";
import * as cashDb from "@/lib/cash-flow/db";
import { documentLabel, groupBySupplier, money, payableDetail } from "@/lib/cash-flow/derive";
import { matchesSearch } from "@/lib/cash-flow/filters";
import { cn } from "@/lib/cn";
import { formatDayMonthYear } from "@/lib/date";
import { pluralize } from "@/lib/format";
import { useCashFlowData } from "./cash-flow-data-provider";

/**
 * «Agregar de la cartera»: the open documents that carry NO priority, grouped by beneficiario as the
 * cartera lists them, to pick the ones that join the flow. Confirming writes `priority: "urgent"`
 * to the picked ids in ONE write — urgente because adding to a flow means «pay in this flow»; the
 * sheet's rows are URGENTE by default and the accountant flips the few that are PENDIENTE, one
 * select away in the list. A `Modal` (read alone, dims the page) and not a drawer: the list behind
 * it is what the pick changes.
 */
export function FlowCarteraPicker({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { payables, asOf } = useCashFlowData();
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<ReadonlySet<string>>(() => new Set());
  const [busy, setBusy] = useState(false);

  const candidates = useMemo(
    () => payables.filter((payable) => payable.status === "open" && payable.priority === null),
    [payables],
  );
  const groups = useMemo(
    () =>
      groupBySupplier(
        query.trim() ? candidates.filter((payable) => matchesSearch(payable, query)) : candidates,
      ),
    [candidates, query],
  );
  const visibleIds = useMemo(
    () => new Set(groups.flatMap((group) => group.payables.map((payable) => payable.id))),
    [groups],
  );
  const pickedTotal = useMemo(
    () =>
      candidates.reduce((acc, payable) => acc + (picked.has(payable.id) ? payable.balance : 0), 0),
    [candidates, picked],
  );

  const toggle = (id: string) =>
    setPicked((current) => {
      const next = new Set(current);
      if (!next.delete(id)) {
        next.add(id);
      }
      return next;
    });
  const toggleGroup = (ids: string[]) =>
    setPicked((current) => {
      const next = new Set(current);
      const all = ids.every((id) => next.has(id));
      for (const id of ids) {
        if (all) {
          next.delete(id);
        } else {
          next.add(id);
        }
      }
      return next;
    });
  const close = () => {
    setQuery("");
    setPicked(new Set());
    onClose();
  };
  const confirm = async () => {
    const ids = [...picked].filter((id) => candidates.some((payable) => payable.id === id));
    if (ids.length === 0) {
      return;
    }
    setBusy(true);
    try {
      await cashDb.updatePayables(ids, { priority: "urgent" });
      close();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} title="Agregar de la cartera" width={640} onClose={close}>
      <div className="flex flex-col gap-3">
        <SearchInput
          size="sm"
          value={query}
          placeholder="Proveedor, documento o concepto"
          onChange={setQuery}
        />
        {candidates.length === 0 ? (
          <EmptyState icon={<FileText size={22} />}>
            Toda la cartera ya está en el flujo.
          </EmptyState>
        ) : groups.length === 0 ? (
          <EmptyState icon={<FileText size={22} />}>Ningún documento coincide.</EmptyState>
        ) : (
          <ul className="max-h-[52vh] divide-y divide-border-soft overflow-y-auto rounded-[9px] border border-border">
            {groups.map((group) => {
              const ids = group.payables.map((payable) => payable.id);
              const allOn = ids.every((id) => picked.has(id));
              return (
                <li key={group.key}>
                  <label className="flex cursor-pointer items-center gap-2.5 bg-surface-muted px-3 py-2">
                    <Checkbox
                      checked={allOn}
                      onChange={() => toggleGroup(ids)}
                      ariaLabel={`Seleccionar todo de ${group.label}`}
                    />
                    <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold text-ink">
                      {group.label}
                    </span>
                    <span className="text-[11.5px] text-faint">
                      {pluralize(group.payables.length, "documento")}
                    </span>
                    <span className="w-[110px] text-right text-[12.5px] font-semibold tabular-nums text-ink">
                      {money(group.balance)}
                    </span>
                  </label>
                  <ul>
                    {group.payables.map((payable) => {
                      const overdue = payable.dueOn !== null && payable.dueOn < asOf;
                      return (
                        <li key={payable.id}>
                          <label className="flex cursor-pointer items-center gap-2.5 px-3 py-1.5 pl-9 hover:bg-canvas">
                            <Checkbox
                              checked={picked.has(payable.id)}
                              onChange={() => toggle(payable.id)}
                              ariaLabel={`Seleccionar ${documentLabel(payable) || payable.supplier}`}
                            />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate font-mono text-[12px] text-ink">
                                {documentLabel(payable) || payable.supplier}
                              </span>
                              {payableDetail(payable) && (
                                <span className="block truncate text-[11px] text-faint">
                                  {payableDetail(payable)}
                                </span>
                              )}
                            </span>
                            <span
                              className={cn(
                                "w-[84px] text-[11.5px] tabular-nums",
                                overdue ? "font-semibold text-negative" : "text-muted",
                              )}
                            >
                              {formatDayMonthYear(payable.dueOn) ?? "—"}
                            </span>
                            <span className="w-[110px] text-right text-[12.5px] tabular-nums text-ink">
                              {money(payable.balance)}
                            </span>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                </li>
              );
            })}
          </ul>
        )}
        <div className="flex items-center justify-between gap-2 border-t border-border-soft pt-3">
          <span className="text-[12px] text-muted">
            {picked.size > 0
              ? `${pluralize(picked.size, "documento")} · ${money(pickedTotal)}`
              : `${pluralize(visibleIds.size, "documento")} sin marcar`}
          </span>
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" disabled={busy} onClick={close}>
              Cancelar
            </Button>
            <Button size="sm" disabled={busy || picked.size === 0} onClick={() => void confirm()}>
              {picked.size > 0 ? `Agregar ${picked.size} al flujo` : "Agregar al flujo"}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
