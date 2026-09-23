"use client";

import { BellRing, ChevronDown, Pencil } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FieldBox, FormField } from "@/components/ui/form-field";
import { NumericInput } from "@/components/ui/numeric-input";
import * as cashDb from "@/lib/cash-flow/db";
import { todayISO } from "@/lib/cash-flow/dates";
import { money } from "@/lib/cash-flow/derive";
import { accountLabel } from "@/lib/cash-flow/flow";
import { overdraftDatesError, overdraftNotice } from "@/lib/cash-flow/overdraft";
import type { BankAccount } from "@/lib/cash-flow/types";
import { cn } from "@/lib/cn";
import { formatDayMonthYear } from "@/lib/date";
import { useCashFlowData } from "./cash-flow-data-provider";
import { OverdraftDateFields } from "./overdraft-date-fields";

export function OverdraftNotices() {
  const { accounts, centers } = useCashFlowData();
  const [today, setToday] = useState(todayISO);
  const [expanded, setExpanded] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const detailsId = useId();
  useEffect(() => {
    const refresh = () => setToday(todayISO());
    const timer = window.setInterval(refresh, 60_000);
    window.addEventListener("focus", refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
    };
  }, []);
  // Undated credit lines remain visible so their first reminder can be set here.
  const notices = accounts
    .filter((account) => account.overdraft > 0)
    .map((account) => ({ account, notice: overdraftNotice(account, today) }))
    .sort((a, b) =>
      (a.account.overdraftEndsOn ?? "9999").localeCompare(b.account.overdraftEndsOn ?? "9999"),
    );
  if (!notices.length) return null;
  const overdue = notices.filter(({ notice }) => notice?.variant === "negative").length;
  const soon = notices.filter(({ notice }) => notice?.variant === "warning").length;
  const undated = notices.filter(({ account }) => !account.overdraftEndsOn).length;
  const next = notices.find(({ notice }) => notice)?.notice;
  return (
    <section
      aria-label="Vencimientos de sobregiros"
      className={cn(
        "shrink-0 rounded-[9px] border border-l-4",
        overdue
          ? "border-negative/30 border-l-negative bg-negative/10"
          : soon
            ? "border-warning/30 border-l-warning bg-warning/10"
            : "border-brand/30 border-l-brand bg-brand-soft",
      )}
    >
      <h3>
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={detailsId}
          onClick={() => setExpanded((value) => !value)}
          className="flex w-full items-center gap-3 rounded-[9px] px-4 py-3 text-left focus-visible:outline-2 focus-visible:outline-brand"
        >
          <BellRing
            size={21}
            className={cn(
              "shrink-0",
              overdue ? "text-negative" : soon ? "text-warning" : "text-brand",
            )}
          />
          <span className="flex-1">
            <span className="block text-[14px] font-bold text-ink">Vencimientos de sobregiros</span>
            <span className="mt-0.5 block text-[12px] tabular-nums text-muted">
              {notices.length} {notices.length === 1 ? "sobregiro" : "sobregiros"} · Al{" "}
              {formatDayMonthYear(today)}
              {undated > 0 && ` · ${undated} sin fecha de fin`}
            </span>
          </span>
          {overdue > 0 && (
            <Badge variant="negative">
              {overdue} {overdue === 1 ? "vencido" : "vencidos"}
            </Badge>
          )}
          {soon > 0 && <Badge variant="warning">{soon} por vencer · hasta 7 días</Badge>}
          {next && <Badge variant={next.variant}>{next.label}</Badge>}
          <span className="text-[12px] font-semibold text-ink">
            {expanded ? "Ocultar" : "Ver y editar"}
          </span>
          <ChevronDown
            size={17}
            className={cn("text-muted transition-transform", expanded && "rotate-180")}
          />
        </button>
      </h3>
      <div id={detailsId} hidden={!expanded}>
        <ul className="mx-4 mb-3 divide-y divide-border-soft rounded-[9px] border border-border bg-surface">
          {notices.map(({ account, notice }) => (
            <li key={account.id} className="px-3 py-3">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-[12px] tabular-nums">
                <span className="font-semibold text-ink">{accountLabel(account, centers)}</span>
                <span className="font-mono text-ink">{money(account.overdraft)}</span>
                <span className="text-muted">
                  Inicio: {formatDayMonthYear(account.overdraftStartsOn ?? null) ?? "Sin fecha"} ·
                  Fin: {formatDayMonthYear(account.overdraftEndsOn ?? null) ?? "Sin fecha"}
                </span>
                <Badge variant={notice?.variant ?? "outline"}>
                  {notice?.label ?? "Sin vencimiento"}
                </Badge>
                <Button
                  variant="secondary"
                  size="sm"
                  icon={<Pencil size={13} />}
                  className="ml-auto"
                  aria-label={`Editar sobregiro de ${accountLabel(account, centers)}`}
                  onClick={() => setEditingId(account.id)}
                >
                  Editar
                </Button>
              </div>
              {editingId === account.id && (
                <OverdraftEditor account={account} onClose={() => setEditingId(null)} />
              )}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function OverdraftEditor({ account, onClose }: { account: BankAccount; onClose: () => void }) {
  const [amount, setAmount] = useState<number | null>(account.overdraft);
  const [dates, setDates] = useState({
    overdraftStartsOn: account.overdraftStartsOn ?? null,
    overdraftEndsOn: account.overdraftEndsOn ?? null,
  });
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);
  async function save() {
    const invalid = overdraftDatesError(dates);
    if (invalid) {
      setError(invalid);
      return;
    }
    setSaving(true);
    try {
      await cashDb.updateAccount(account.id, { overdraft: amount ?? 0, ...dates });
      onClose();
    } catch {
      setError("No se pudo guardar el sobregiro. Intenta de nuevo.");
    } finally {
      setSaving(false);
    }
  }
  return (
    <fieldset
      disabled={saving}
      className="mt-3 grid grid-cols-3 gap-3 border-t border-border-soft pt-3"
    >
      <legend className="sr-only">Editar sobregiro</legend>
      <FormField label="Monto del sobregiro">
        <FieldBox>
          <NumericInput
            value={amount}
            format="currency"
            align="left"
            ariaLabel="Monto del sobregiro"
            onCommit={setAmount}
          />
        </FieldBox>
      </FormField>
      <OverdraftDateFields
        startsOn={dates.overdraftStartsOn}
        endsOn={dates.overdraftEndsOn}
        error={error}
        onChange={(patch) => {
          setDates((current) => ({ ...current, ...patch }));
          setError(undefined);
        }}
      />
      <div className="col-span-3 flex justify-end gap-2">
        <Button variant="secondary" size="sm" onClick={onClose}>
          Cancelar
        </Button>
        <Button size="sm" onClick={() => void save()}>
          {saving ? "Guardando…" : "Guardar sobregiro"}
        </Button>
      </div>
    </fieldset>
  );
}
