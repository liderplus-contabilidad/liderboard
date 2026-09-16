"use client";

import {
  ArrowRightLeft,
  CheckCircle2,
  Copy,
  Flag,
  Landmark,
  Plus,
  Scale,
  Trash2,
  TrendingUp,
  Waves,
} from "lucide-react";
import { type ReactNode, useCallback, useMemo } from "react";
import { Cell, HeadCell } from "@/components/data-table/grid-cells";
import { DataGrid, GridRow } from "@/components/data-table/data-grid";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { NumericInput } from "@/components/ui/numeric-input";
import { Select } from "@/components/ui/select";
import { StatTile } from "@/components/ui/stat-tile";
import * as cashDb from "@/lib/cash-flow/db";
import { documentLabel, kindLabel, money, payableDetail } from "@/lib/cash-flow/derive";
import { accountLabel, centerName, copyFlowFrom, type FlowLine } from "@/lib/cash-flow/flow";
import type { BankAccount, FlowIncome } from "@/lib/cash-flow/types";
import { cn } from "@/lib/cn";
import { formatDayMonthYear } from "@/lib/date";
import { pluralize } from "@/lib/format";
import { useCashFlowData } from "./cash-flow-data-provider";
import { CashFlowEmptyState } from "./cash-flow-empty-state";

const NONE = "";

/**
 * The flow OF the cut date: the accounts table (the cells with a field are the CAPTURE — saldo;
 * everything else is `deriveFlow`), the projected incomes, the marked documents grouped by supplier
 * and, for an empresa with centers, the loans between them. It is `FLUJO MATRIZ`, `FJ dd-mm` and
 * `FLUJO DE BANCOS` at once: the columns that were typed are now read from Cheques and from the
 * marks in Cuentas por pagar.
 *
 * Nothing here is stored but the balances and the incomes (`db.saveFlow`, one record per date).
 */
export function FlowView() {
  const { activeClientId, centers, checks, asOf, flow, previous, derived } = useCashFlowData();

  const setBalance = useCallback(
    (accountId: string, value: number | null) => {
      if (activeClientId) {
        void cashDb.saveFlow(activeClientId, asOf, { balances: { [accountId]: value ?? 0 } });
      }
    },
    [activeClientId, asOf],
  );
  const setIncomes = useCallback(
    (incomes: FlowIncome[]) => {
      if (activeClientId) {
        void cashDb.saveFlow(activeClientId, asOf, { incomes });
      }
    },
    [activeClientId, asOf],
  );
  const copyPrevious = useCallback(() => {
    if (activeClientId && previous) {
      const copy = copyFlowFrom(previous, asOf);
      void cashDb.saveFlow(activeClientId, asOf, {
        balances: copy.balances,
        incomes: copy.incomes,
      });
    }
  }, [activeClientId, previous, asOf]);

  const incomes = flow?.incomes ?? [];
  const hasCenters = centers.length > 0;
  // A column that means nothing for the open data renders nothing: an empresa that keeps no check
  // register (Nomik) has no «cheques no cobrados» to subtract.
  const hasChecks = checks.length > 0;
  const dateLabel = formatDayMonthYear(asOf) ?? asOf;
  const { totals } = derived;

  if (!activeClientId) {
    return <CashFlowEmptyState />;
  }

  return (
    <CashFlowEmptyState>
      <div className="flex flex-col gap-4 px-7 py-5">
        <div className="flex gap-3">
          <StatTile
            label="Total bancos"
            value={money(totals.bankTotal)}
            hint={`Saldo ${money(totals.balance)} + ingresos ${money(totals.incomes)} + sobregiro ${money(totals.overdraft)}`}
          />
          {hasChecks && <StatTile label="Cheques no cobrados" value={money(totals.outstanding)} />}
          <StatTile
            label="Marcado para pago"
            value={money(totals.urgent + totals.pending)}
            hint={`Urgente ${money(totals.urgent)} · Pendiente ${money(totals.pending)}`}
          />
          <StatTile
            label={totals.remaining < 0 ? "Saldo faltante" : "Saldo sobrante"}
            value={money(Math.abs(totals.remaining))}
            sign={totals.remaining < 0 ? "negativo" : "positivo"}
          />
        </div>

        {/* Incomes first: they are a capture and they ADD to the bank total the table below opens
            with, so what is typed is read before what it feeds. */}
        <IncomesSection incomes={incomes} onChange={setIncomes} />

        <FlowSection>
          <SectionHeading
            icon={<Landmark size={15} />}
            title={`Flujo de bancos · ${dateLabel}`}
            hint={flow ? undefined : "Sin captura para esta fecha"}
          >
            {previous && (
              <Button
                variant="secondary"
                size="toolbar"
                icon={<Copy size={14} />}
                onClick={copyPrevious}
              >
                Copiar del {formatDayMonthYear(previous.date)}
              </Button>
            )}
          </SectionHeading>

          {derived.accounts.length === 0 ? (
            <EmptyState icon={<Waves size={22} />}>Ninguna cuenta del centro marcado.</EmptyState>
          ) : (
            <DataGrid minWidth={hasChecks ? 1100 : 980}>
              <thead>
                <tr>
                  <HeadCell width={220}>Cuenta</HeadCell>
                  <HeadCell align="right" width={130}>
                    Saldo
                  </HeadCell>
                  <HeadCell align="right">Ingresos proy.</HeadCell>
                  <HeadCell align="right" width={130}>
                    Sobregiro
                  </HeadCell>
                  <HeadCell align="right">Total bancos</HeadCell>
                  {hasChecks && <HeadCell align="right">Cheques no cobr.</HeadCell>}
                  <HeadCell align="right">Urgente</HeadCell>
                  <HeadCell align="right">Pendiente</HeadCell>
                  <HeadCell align="right" sticky="right">
                    Saldo final
                  </HeadCell>
                </tr>
              </thead>
              <tbody>
                {derived.accounts.map((row) => (
                  <tr key={row.account.id}>
                    <Cell>
                      <span className="block font-semibold text-ink">
                        {accountLabel(row.account, [])}
                      </span>
                      {hasCenters && (
                        <span className="block text-[11px] text-faint">
                          {row.account.centerId
                            ? centerName(row.account.centerId, centers)
                            : "De la empresa"}
                        </span>
                      )}
                    </Cell>
                    <Cell numeric className="bg-marked/40 p-1">
                      <NumericInput
                        value={flow?.balances[row.account.id] ?? null}
                        nullable
                        format="currency"
                        placeholder="0.00"
                        ariaLabel={`Saldo de ${accountLabel(row.account, centers)}`}
                        onCommit={(value) => setBalance(row.account.id, value)}
                      />
                    </Cell>
                    <Cell numeric tone="muted">
                      {money(row.incomes)}
                    </Cell>
                    {/* The overdraft is the ACCOUNT's (it does not change from one date to the next),
                      but it is captured here, where the sheet writes it, and not only in Configurar. */}
                    <Cell numeric className="bg-marked/40 p-1">
                      <NumericInput
                        value={row.account.overdraft}
                        format="currency"
                        placeholder="0.00"
                        ariaLabel={`Sobregiro de ${accountLabel(row.account, centers)}`}
                        onCommit={(value) =>
                          void cashDb.updateAccount(row.account.id, { overdraft: value ?? 0 })
                        }
                      />
                    </Cell>
                    <Cell numeric strong value={row.bankTotal}>
                      {money(row.bankTotal)}
                    </Cell>
                    {hasChecks && (
                      <Cell numeric className="text-crosslink">
                        {money(row.outstanding)}
                      </Cell>
                    )}
                    <Cell numeric className="text-warning">
                      {money(row.urgent)}
                    </Cell>
                    <Cell numeric tone="muted">
                      {money(row.pending)}
                    </Cell>
                    <Cell numeric strong sticky="right" value={row.remaining}>
                      {money(row.remaining)}
                    </Cell>
                  </tr>
                ))}
                {(derived.unassignedMarked.urgent > 0 ||
                  derived.unassignedMarked.pending > 0 ||
                  derived.unassignedIncomes > 0) && (
                  <GridRow muted>
                    <Cell className="text-[11.5px] text-faint" colSpan={2}>
                      Sin cuenta asignada
                    </Cell>
                    <Cell numeric tone="muted">
                      {money(derived.unassignedIncomes)}
                    </Cell>
                    <Cell colSpan={hasChecks ? 3 : 2} />
                    <Cell numeric className="text-warning">
                      {money(derived.unassignedMarked.urgent)}
                    </Cell>
                    <Cell numeric tone="muted">
                      {money(derived.unassignedMarked.pending)}
                    </Cell>
                    <Cell sticky="right" />
                  </GridRow>
                )}
                <tr className="bg-surface-sunken">
                  <Cell strong>Total</Cell>
                  <Cell numeric strong value={totals.balance}>
                    {money(totals.balance)}
                  </Cell>
                  <Cell numeric strong>
                    {money(totals.incomes)}
                  </Cell>
                  <Cell numeric strong>
                    {money(totals.overdraft)}
                  </Cell>
                  <Cell numeric strong>
                    {money(totals.bankTotal)}
                  </Cell>
                  {hasChecks && (
                    <Cell numeric strong className="text-crosslink">
                      {money(totals.outstanding)}
                    </Cell>
                  )}
                  <Cell numeric strong className="text-warning">
                    {money(totals.urgent)}
                  </Cell>
                  <Cell numeric strong>
                    {money(totals.pending)}
                  </Cell>
                  <Cell numeric strong sticky="right" value={totals.remaining}>
                    {money(totals.remaining)}
                  </Cell>
                </tr>
              </tbody>
            </DataGrid>
          )}
        </FlowSection>

        <MarkedSection />

        {/* The sheet's «SALDO FALTANTE» row, right under the TOTAL it is read against: its three
            figures — after everything marked, after only the urgent, after only the pending. */}
        {derived.accounts.length > 0 && (
          <FlowSection>
            <SectionHeading icon={<Scale size={15} />} title="Saldo faltante o sobrante" />
            <div className="grid grid-cols-3 gap-3">
              <Remaining label="Tras todo lo marcado" value={totals.remaining} />
              <Remaining label="Pagando solo lo urgente" value={totals.remainingUrgentOnly} />
              <Remaining label="Pagando solo lo pendiente" value={totals.remainingPendingOnly} />
            </div>
          </FlowSection>
        )}

        <SettledSection />

        {hasCenters && derived.loans.length > 0 && (
          <FlowSection>
            <SectionHeading icon={<ArrowRightLeft size={15} />} title="Préstamos entre centros" />
            <ul className="flex flex-wrap gap-2">
              {derived.loans.map((loan) => (
                <li
                  key={`${loan.fromCenterId}-${loan.toCenterId}`}
                  className="rounded-[9px] border border-border bg-surface-muted px-3 py-1.5 text-[12.5px] tabular-nums"
                >
                  <span className="font-semibold text-ink">
                    {centerName(loan.fromCenterId, centers)} →{" "}
                    {centerName(loan.toCenterId, centers)}
                  </span>
                  <span className="ml-2 text-brand">{money(loan.amount)}</span>
                </li>
              ))}
            </ul>
          </FlowSection>
        )}
      </div>
    </CashFlowEmptyState>
  );
}

/**
 * What was PAID since the previous flow — the memory the `FJ` sheets kept by keeping the sheet:
 * read here, never summed, because the captured balance already reflects it and counting it again
 * would overstate the faltante. It lists what `Cuentas por pagar` archives under «Ver liquidadas»,
 * put where one looks for it.
 */
function SettledSection() {
  const { derived } = useCashFlowData();
  if (derived.settled.length === 0) {
    return null;
  }
  const window = derived.settledSince
    ? `desde el ${formatDayMonthYear(derived.settledSince)}`
    : "en la fecha de corte";
  return (
    <FlowSection>
      <SectionHeading
        icon={<CheckCircle2 size={15} />}
        title="Pagado en esta fecha"
        hint={`${pluralize(derived.settled.length, "documento")} liquidados ${window}`}
      />
      <div className="overflow-hidden rounded-[13px] border border-border bg-surface">
        <table className="w-full table-fixed border-collapse">
          <colgroup>
            <col />
            <col style={{ width: 110 }} />
            <col style={{ width: 130 }} />
          </colgroup>
          <thead>
            <tr>
              <HeadCell>Proveedor · documento</HeadCell>
              <HeadCell>Pagado el</HeadCell>
              <HeadCell align="right">Monto</HeadCell>
            </tr>
          </thead>
          <tbody>
            {derived.settled.map(({ payable, settledOn }) => (
              <tr key={payable.id} className="opacity-80">
                <Cell>
                  <span className="block truncate font-medium text-ink">{payable.supplier}</span>
                  <span className="block truncate text-[11px] text-faint">
                    {[documentLabel(payable), payableDetail(payable, { center: false })]
                      .filter(Boolean)
                      .join(" — ")}
                  </span>
                </Cell>
                <Cell className="tabular-nums text-muted">{formatDayMonthYear(settledOn)}</Cell>
                <Cell numeric className="text-positive">
                  {money(payable.balance)}
                </Cell>
              </tr>
            ))}
            <tr className="bg-surface-sunken">
              <Cell strong colSpan={2}>
                Total pagado
              </Cell>
              <Cell numeric strong className="text-positive">
                {money(derived.settledTotal)}
              </Cell>
            </tr>
          </tbody>
        </table>
      </div>
    </FlowSection>
  );
}

/**
 * One block of the page, in its order: ingresos → bancos → pagos marcados → faltante → pagado →
 * préstamos. A hairline above and the same air between them is what tells one from the next —
 * six headings of the same size, one after another, read as one long table.
 */
function FlowSection({ children }: { children: ReactNode }) {
  return <section className="flex flex-col gap-3 border-t border-border pt-5">{children}</section>;
}

/** A section's heading: its icon on a brand tile, the title, the hint, and the controls of the
 *  section (a total, «Agregar», «Copiar del …») on the right. */
function SectionHeading({
  icon,
  title,
  hint,
  children,
}: {
  icon: ReactNode;
  title: string;
  hint?: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="flex size-[30px] shrink-0 items-center justify-center rounded-[9px] bg-brand-soft text-brand">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <h2 className="text-[14px] font-bold text-ink">{title}</h2>
        {hint && <p className="mt-0.5 text-[11.5px] text-faint">{hint}</p>}
      </div>
      {children}
    </div>
  );
}

/** One of the three «SALDO FALTANTE» readings: red with ▼ when short, green with ▲ when over. */
function Remaining({ label, value }: { label: string; value: number }) {
  return (
    <StatTile
      label={
        value < 0
          ? `Saldo faltante · ${label.toLowerCase()}`
          : `Saldo sobrante · ${label.toLowerCase()}`
      }
      value={money(Math.abs(value))}
      sign={value < 0 ? "negativo" : "positivo"}
    />
  );
}

function IncomesSection({
  incomes,
  onChange,
}: {
  incomes: FlowIncome[];
  onChange: (incomes: FlowIncome[]) => void;
}) {
  const { accounts, centers } = useCashFlowData();
  const options = [
    { value: NONE, label: "Sin cuenta" },
    ...accounts.map((account) => ({ value: account.id, label: accountLabel(account, centers) })),
  ];
  const update = (id: string, patch: Partial<FlowIncome>) =>
    onChange(incomes.map((income) => (income.id === id ? { ...income, ...patch } : income)));
  const total = incomes.reduce((acc, income) => acc + income.amount, 0);

  return (
    <FlowSection>
      <SectionHeading icon={<TrendingUp size={15} />} title="Ingresos proyectados">
        <span className="text-[13px] font-semibold tabular-nums text-brand">{money(total)}</span>
        <Button
          variant="secondary"
          size="sm"
          icon={<Plus size={13} />}
          onClick={() =>
            onChange([
              ...incomes,
              {
                id: crypto.randomUUID(),
                concept: "",
                amount: 0,
                accountId: accounts.length === 1 ? accounts[0].id : null,
              },
            ])
          }
        >
          Agregar
        </Button>
      </SectionHeading>
      {incomes.length > 0 && (
        <ul className="divide-y divide-border-soft rounded-[13px] border border-border bg-surface px-4 py-1">
          {incomes.map((income) => (
            <li
              key={income.id}
              className="grid grid-cols-[1fr_150px_220px_auto] items-center gap-2 py-1.5"
            >
              <input
                defaultValue={income.concept}
                placeholder="Proyección de ventas"
                aria-label="Concepto del ingreso"
                onBlur={(event) =>
                  event.target.value !== income.concept &&
                  update(income.id, { concept: event.target.value })
                }
                className="rounded-lg border border-border bg-surface px-[9px] py-1.5 text-[13px] text-ink outline-none placeholder:text-faint focus:border-brand"
              />
              <NumericInput
                value={income.amount}
                format="currency"
                ariaLabel="Monto del ingreso"
                onCommit={(value) => update(income.id, { amount: value ?? 0 })}
              />
              {accounts.length > 1 ? (
                <Select
                  size="sm"
                  aria-label="Cuenta del ingreso"
                  value={income.accountId ?? NONE}
                  options={options}
                  onChange={(event) => update(income.id, { accountId: event.target.value || null })}
                />
              ) : (
                <span />
              )}
              <Button
                variant="danger"
                size="sm"
                iconOnly
                icon={<Trash2 size={13} />}
                aria-label="Quitar ingreso"
                onClick={() => onChange(incomes.filter((row) => row.id !== income.id))}
              />
            </li>
          ))}
        </ul>
      )}
    </FlowSection>
  );
}

/**
 * The marked documents, grouped by supplier, in the sheet's own columns — SALDO · URGENTE ·
 * PENDIENTE, the amount under the mark it carries — and closed by the TOTAL row the sheet paints
 * green: it is what «Saldo faltante» is read against, so it sits at the END of the list, filled,
 * and not in a corner of the header.
 */
function MarkedSection() {
  const { derived, accounts, centers, asOf } = useCashFlowData();
  const accountName = useMemo(
    () => new Map(accounts.map((account) => [account.id, accountLabel(account, centers)])),
    [accounts, centers],
  );
  const lineById = useMemo(
    () => new Map(derived.lines.map((line) => [line.payable.id, line])),
    [derived.lines],
  );
  const total = derived.totals.urgent + derived.totals.pending;

  return (
    <FlowSection>
      <SectionHeading
        icon={<Flag size={15} />}
        title="Pagos marcados"
        hint={pluralize(derived.lines.length, "documento")}
      />
      <div className="overflow-hidden rounded-[13px] border border-border bg-surface">
        {derived.groups.length === 0 ? (
          <p className="px-4 py-4 text-[12.5px] text-faint">Sin pagos marcados.</p>
        ) : (
          <table className="w-full table-fixed border-collapse">
            <colgroup>
              <col />
              <col style={{ width: 104 }} />
              <col style={{ width: 104 }} />
              <col style={{ width: 190 }} />
              <col style={{ width: 110 }} />
              <col style={{ width: 130 }} />
              <col style={{ width: 130 }} />
              <col style={{ width: 130 }} />
            </colgroup>
            <thead>
              <tr>
                <HeadCell>Proveedor · documento</HeadCell>
                <HeadCell>Emisión</HeadCell>
                <HeadCell>Vence</HeadCell>
                <HeadCell>Cuenta</HeadCell>
                <HeadCell>Programado</HeadCell>
                <HeadCell align="right">Saldo</HeadCell>
                <HeadCell align="right">Urgente</HeadCell>
                <HeadCell align="right">Pendiente</HeadCell>
              </tr>
            </thead>
            <tbody>
              {derived.groups.map((group) => (
                <GroupRows
                  key={group.key}
                  group={group}
                  asOf={asOf}
                  accounts={accounts}
                  accountName={accountName}
                  lineById={lineById}
                />
              ))}
              <tr className="bg-brand text-white">
                <Cell
                  colSpan={5}
                  className="border-b-0 py-3 text-[13px] font-bold uppercase tracking-[0.4px] text-white"
                >
                  Total
                </Cell>
                <Cell numeric className="border-b-0 py-3 text-[14px] font-bold text-white">
                  {money(total)}
                </Cell>
                <Cell numeric className="border-b-0 py-3 text-[14px] font-bold text-white">
                  {money(derived.totals.urgent)}
                </Cell>
                <Cell numeric className="border-b-0 py-3 text-[14px] font-bold text-white">
                  {money(derived.totals.pending)}
                </Cell>
              </tr>
            </tbody>
          </table>
        )}
      </div>
    </FlowSection>
  );
}

function GroupRows({
  group,
  asOf,
  accounts,
  accountName,
  lineById,
}: {
  group: ReturnType<typeof useCashFlowData>["derived"]["groups"][number];
  asOf: string;
  accounts: BankAccount[];
  accountName: Map<string, string>;
  lineById: Map<string, FlowLine>;
}) {
  const sum = (key: "urgent" | "pending") =>
    group.payables.reduce((acc, payable) => acc + (lineById.get(payable.id)?.[key] ?? 0), 0);
  const urgent = sum("urgent");
  const pending = sum("pending");
  return (
    <>
      <GridRow muted>
        <Cell className="font-semibold text-ink" colSpan={5}>
          {group.label}
          {group.payables[0]?.kind && (
            <span className="ml-2 text-[11px] font-normal text-faint">
              {kindLabel(group.payables[0].kind)}
            </span>
          )}
        </Cell>
        <Cell numeric strong value={urgent + pending}>
          {money(urgent + pending)}
        </Cell>
        <Cell numeric className="font-semibold text-warning">
          {urgent > 0 ? money(urgent) : ""}
        </Cell>
        <Cell numeric className="font-semibold text-ink">
          {pending > 0 ? money(pending) : ""}
        </Cell>
      </GridRow>
      {group.payables.map((payable) => {
        const line = lineById.get(payable.id);
        const amount = line?.amount ?? 0;
        return (
          <tr key={payable.id}>
            <Cell className="pl-7">
              <span className="block truncate font-mono text-[12px] text-muted">
                {documentLabel(payable) || payable.supplier}
              </span>
              {payableDetail(payable, { center: false }) && (
                <span className="block truncate text-[11px] text-faint">
                  {payableDetail(payable, { center: false })}
                </span>
              )}
            </Cell>
            <Cell className="tabular-nums text-muted">
              {formatDayMonthYear(payable.issuedOn) ?? "—"}
            </Cell>
            <Cell
              className={cn(
                "tabular-nums",
                payable.dueOn && payable.dueOn < asOf
                  ? "font-semibold text-negative"
                  : "text-muted",
              )}
            >
              {formatDayMonthYear(payable.dueOn) ?? "—"}
            </Cell>
            <Cell className="truncate text-muted">
              {payable.payFromAccountId
                ? (accountName.get(payable.payFromAccountId) ?? "—")
                : accounts.length === 1
                  ? (accountName.get(accounts[0].id) ?? "—")
                  : "Sin cuenta"}
            </Cell>
            <Cell className="tabular-nums text-muted">
              {formatDayMonthYear(payable.payOn) ?? "—"}
            </Cell>
            <Cell numeric>{money(amount)}</Cell>
            <Cell numeric className="text-warning">
              {line && line.urgent > 0 ? money(line.urgent) : ""}
            </Cell>
            <Cell numeric>{line && line.pending > 0 ? money(line.pending) : ""}</Cell>
          </tr>
        );
      })}
    </>
  );
}
