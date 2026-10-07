"use client";

import { Banknote } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { EmptyState } from "@/components/ui/empty-state";
import { Modal } from "@/components/ui/modal";
import { SearchInput } from "@/components/ui/search-input";
import { availableFlowChecks, checkStatusLabel } from "@/lib/cash-flow/checks";
import { matchesCheckSearch } from "@/lib/cash-flow/check-filters";
import * as cashDb from "@/lib/cash-flow/db";
import { money } from "@/lib/cash-flow/derive";
import { accountLabel } from "@/lib/cash-flow/flow";
import { formatDayMonthYear } from "@/lib/date";
import { pluralize } from "@/lib/format";
import { useCashFlowData } from "./cash-flow-data-provider";

/** Link the register's pending checks; no copying or second deduction of their amounts. */
export function FlowCheckPicker({ onClose }: { onClose: () => void }) {
  const { activeClientId, checks, accounts, centers, asOf, payableFilters, derived } =
    useCashFlowData();
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<ReadonlySet<string>>(() => new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const candidates = useMemo(
    () =>
      availableFlowChecks(
        checks,
        asOf,
        payableFilters.centerIds.length ? derived.accounts.map((row) => row.account.id) : undefined,
      ),
    [checks, asOf, payableFilters.centerIds, derived.accounts],
  );
  const visible = useMemo(
    () => candidates.filter((check) => matchesCheckSearch(check, query)),
    [candidates, query],
  );
  const selected = useMemo(
    () => candidates.filter((check) => picked.has(check.id)),
    [candidates, picked],
  );
  const total = selected.reduce((sum, check) => sum + check.amount, 0);
  const toggle = (id: string) =>
    setPicked((current) => {
      const next = new Set(current);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  const confirm = async () => {
    if (!activeClientId || busy || selected.length === 0) return;
    setBusy(true);
    setError(undefined);
    try {
      await cashDb.setFlowCheckLinks(
        activeClientId,
        selected.map((check) => check.id),
        asOf,
      );
      onClose();
    } catch {
      setError("No se pudieron agregar los cheques. Intenta de nuevo.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open title="Agregar desde Cheques" width={720} onClose={onClose}>
      <div className="flex flex-col gap-3">
        <SearchInput
          size="sm"
          value={query}
          placeholder="Beneficiario, cheque, egreso o banco"
          onChange={setQuery}
        />
        {visible.length === 0 ? (
          <EmptyState icon={<Banknote size={22} />}>
            {candidates.length === 0
              ? "No hay cheques pendientes por agregar."
              : "Ningún cheque coincide con la búsqueda."}
          </EmptyState>
        ) : (
          <ul className="max-h-[52vh] divide-y divide-border-soft overflow-y-auto">
            {visible.map((check) => {
              const account = accounts.find((row) => row.id === check.accountId);
              return (
                <li key={check.id}>
                  <label className="flex cursor-pointer items-center gap-3 py-3 hover:bg-canvas">
                    <Checkbox
                      checked={picked.has(check.id)}
                      onChange={() => toggle(check.id)}
                      ariaLabel={`Seleccionar cheque ${check.number || check.voucher}`}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-semibold text-ink">
                        {check.payee}
                      </span>
                      <span className="block text-[11.5px] tabular-nums text-muted">
                        Cheque {check.number || "—"} · Egreso {check.voucher}
                      </span>
                      <span className="block text-[11.5px] text-faint">
                        {account
                          ? accountLabel(account, centers)
                          : "Sin cuenta · elige una cuenta en Flujo"}{" "}
                        · {checkStatusLabel(check)}
                      </span>
                    </span>
                    <span className="text-[11.5px] tabular-nums text-muted">
                      {formatDayMonthYear(check.expectedCashOn ?? check.issuedOn) ?? "—"}
                    </span>
                    <span className="w-[110px] text-right font-mono text-[13px] font-semibold tabular-nums text-ink">
                      {money(check.amount)}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        )}
        {error && (
          <p role="alert" className="text-[12px] text-negative">
            {error}
          </p>
        )}
        <div className="flex items-center justify-between gap-3 border-t border-border-soft pt-3">
          <span className="text-[12px] tabular-nums text-muted">
            {selected.length
              ? `${pluralize(selected.length, "seleccionado")} · ${money(total)}`
              : `${pluralize(candidates.length, "cheque")} por agregar`}
          </span>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" disabled={busy} onClick={onClose}>
              Cancelar
            </Button>
            <Button
              size="sm"
              disabled={busy || selected.length === 0}
              onClick={() => void confirm()}
            >
              {busy ? "Agregando…" : "Agregar al flujo"}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
